import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getD1 } from "@/db";
import {
  challengeDateInTokyo,
  DIFFICULTY_CATALOG_VERSION,
  DIFFICULTY_CORE_VERSION,
  DIFFICULTY_RULESET_IDS,
  type Difficulty,
  isDifficulty,
  MAX_TICKS,
  seedForDate,
} from "@/lib/game-core";

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return json({ error: "AUTH_REQUIRED" }, 401);
  if ((request.headers.get("content-type") ?? "").split(";")[0] !== "application/json") {
    return json({ error: "CLIENT_UPDATE_REQUIRED" }, 409);
  }
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "INVALID_JSON" }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 2) {
    return json({ error: "INVALID_DIFFICULTY" }, 422);
  }
  const requestBody = body as Record<string, unknown>;
  if (requestBody.input_schema_version !== "4.0.0" || !isDifficulty(requestBody.difficulty)) {
    return json({ error: "INVALID_DIFFICULTY" }, 422);
  }
  const difficulty: Difficulty = requestBody.difficulty;
  const rulesetId = DIFFICULTY_RULESET_IDS[difficulty];

  const database = getD1();
  const now = Date.now();
  const challengeDate = challengeDateInTokyo();
  const playerId = await digest(user.userId);

  let player = await database
    .prepare("SELECT player_id, display_name FROM players WHERE auth_subject = ?")
    .bind(user.userId)
    .first<{ player_id: string; display_name: string }>();

  if (!player) {
    for (let attempt = 0; attempt < 5 && !player; attempt += 1) {
      const displayName = createAlias();
      try {
        await database
          .prepare(
            "INSERT INTO players (player_id, auth_subject, display_name, created_at_ms, last_active_at_ms) VALUES (?, ?, ?, ?, ?)",
          )
          .bind(playerId, user.userId, displayName, now, now)
          .run();
        player = { player_id: playerId, display_name: displayName };
      } catch {
        player = await database
          .prepare("SELECT player_id, display_name FROM players WHERE auth_subject = ?")
          .bind(user.userId)
          .first<{ player_id: string; display_name: string }>();
      }
    }
  }
  if (!player) return json({ error: "PLAYER_CREATE_FAILED" }, 503);

  await database
    .prepare("UPDATE players SET last_active_at_ms = ? WHERE player_id = ?")
    .bind(now, player.player_id)
    .run();

  // A closed tab must not leave a player permanently unable to begin a new run.
  await database
    .prepare("UPDATE runs SET status = 'REJECTED' WHERE player_id = ? AND status = 'RUNNING' AND started_at_ms < ?")
    .bind(player.player_id, now - 31 * 60 * 1000)
    .run();

  const active = await database
    .prepare("SELECT run_id FROM runs WHERE player_id = ? AND status = 'RUNNING' LIMIT 1")
    .bind(player.player_id)
    .first<{ run_id: string }>();
  if (active) return json({ error: "ACTIVE_RUN_EXISTS", active_run_id: active.run_id }, 409);

  const runId = crypto.randomUUID();
  const seed = seedForDate(challengeDate);
  await database
    .prepare(
      "INSERT INTO runs (run_id, player_id, challenge_date, seed, ruleset_id, core_version, catalog_version, status, issued_at_ms, started_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, 'RUNNING', ?, ?)",
    )
    .bind(runId, player.player_id, challengeDate, seed, rulesetId, DIFFICULTY_CORE_VERSION, DIFFICULTY_CATALOG_VERSION, now, now)
    .run();

  return json({
    run: {
      run_id: runId,
      challenge_date: challengeDate,
      seed,
      display_name: player.display_name,
      max_ticks: MAX_TICKS,
      difficulty,
      ruleset_id: rulesetId,
      core_version: DIFFICULTY_CORE_VERSION,
      catalog_version: DIFFICULTY_CATALOG_VERSION,
      input_schema_version: "4.0.0",
    },
  });
}

function createAlias(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return `Runner-${[...bytes].map((byte) => chars[byte % chars.length]).join("")}`;
}

async function digest(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
