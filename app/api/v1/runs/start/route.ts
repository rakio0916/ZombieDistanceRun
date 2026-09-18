import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getD1 } from "@/db";
import {
  CATALOG_VERSION,
  challengeDateInTokyo,
  CORE_VERSION,
  MAX_TICKS,
  RULESET_ID,
  seedForDate,
} from "@/lib/game-core";

export async function POST() {
  const user = await getChatGPTUser();
  if (!user) return json({ error: "AUTH_REQUIRED" }, 401);

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

  const active = await database
    .prepare("SELECT run_id FROM runs WHERE player_id = ? AND status = 'RUNNING' LIMIT 1")
    .bind(player.player_id)
    .first<{ run_id: string }>();
  if (active) return json({ error: "ACTIVE_RUN_EXISTS" }, 409);

  const runId = crypto.randomUUID();
  const seed = seedForDate(challengeDate);
  await database
    .prepare(
      "INSERT INTO runs (run_id, player_id, challenge_date, seed, ruleset_id, core_version, catalog_version, status, issued_at_ms, started_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, 'RUNNING', ?, ?)",
    )
    .bind(runId, player.player_id, challengeDate, seed, RULESET_ID, CORE_VERSION, CATALOG_VERSION, now, now)
    .run();

  return json({
    run: {
      run_id: runId,
      challenge_date: challengeDate,
      seed,
      display_name: player.display_name,
      max_ticks: MAX_TICKS,
      ruleset_id: RULESET_ID,
      core_version: CORE_VERSION,
      catalog_version: CATALOG_VERSION,
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
