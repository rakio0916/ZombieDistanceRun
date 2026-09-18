import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getD1 } from "@/db";
import { decodeContinuousInputs, parseFinishPayload } from "@/lib/game-api";
import { RULESET_ID, runContinuousSimulation, runSimulationForRuleset } from "@/lib/game-core";

type RunRow = {
  run_id: string;
  player_id: string;
  challenge_date: string;
  seed: number;
  ruleset_id: string;
  status: string;
  distance_cm: number | null;
  duration_ticks: number | null;
  terminal_reason: string | null;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const user = await getChatGPTUser();
  if (!user) return json({ error: "AUTH_REQUIRED" }, 401);
  if ((request.headers.get("content-type") ?? "").split(";")[0] !== "application/json") {
    return json({ error: "INVALID_CONTENT_TYPE" }, 400);
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 262_144) return json({ error: "PAYLOAD_TOO_LARGE" }, 413);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "INVALID_JSON" }, 400);
  }
  const payload = parseFinishPayload(body);
  if (!payload) return json({ error: "INVALID_INPUT_LOG" }, 422);

  const { runId } = await params;
  const database = getD1();
  const row = await database
    .prepare(
      "SELECT r.run_id, r.player_id, r.challenge_date, r.seed, r.ruleset_id, r.status, r.distance_cm, r.duration_ticks, r.terminal_reason FROM runs r JOIN players p ON p.player_id = r.player_id WHERE r.run_id = ? AND p.auth_subject = ?",
    )
    .bind(runId, user.userId)
    .first<RunRow>();
  if (!row) return json({ error: "RUN_NOT_FOUND" }, 404);
  if (row.status === "VERIFIED") {
    return json({ run: toPublicRun(row), already_verified: true });
  }
  if (row.status !== "RUNNING") return json({ error: "RUN_STATE_CONFLICT" }, 409);

  const result = payload.schema_version === "2.0.0" && row.ruleset_id === RULESET_ID
    ? runContinuousSimulation(row.seed, decodeContinuousInputs(payload.input_b64, payload.final_tick) ?? [])
    : payload.schema_version === "1.0.0" && row.ruleset_id !== RULESET_ID
      ? runSimulationForRuleset(row.ruleset_id, row.seed, payload.final_tick, payload.events)
      : null;
  if (!result || result.terminalReason !== payload.terminal_reason) {
    return json({ error: "RESULT_NOT_REPRODUCIBLE" }, 422);
  }

  const now = Date.now();
  const inputSha = await sha256(raw);
  const existingBest = await database
    .prepare(
      "SELECT best_run_id, distance_cm, duration_ticks, achieved_at_ms FROM best_scores WHERE challenge_date = ? AND ruleset_id = ? AND player_id = ?",
    )
    .bind(row.challenge_date, row.ruleset_id, row.player_id)
    .first<{ best_run_id: string; distance_cm: number; duration_ticks: number; achieved_at_ms: number }>();
  const isBetter =
    !existingBest ||
    result.distanceCm > existingBest.distance_cm ||
    (result.distanceCm === existingBest.distance_cm && result.durationTicks < existingBest.duration_ticks) ||
    (result.distanceCm === existingBest.distance_cm && result.durationTicks === existingBest.duration_ticks && now < existingBest.achieved_at_ms);

  const statements = [
    database
      .prepare(
        "UPDATE runs SET status = 'VERIFIED', finished_at_ms = ?, duration_ticks = ?, distance_cm = ?, terminal_reason = ?, input_sha256 = ? WHERE run_id = ? AND status = 'RUNNING'",
      )
      .bind(now, result.durationTicks, result.distanceCm, result.terminalReason, inputSha, row.run_id),
  ];
  if (isBetter) {
    statements.push(
      database
        .prepare("DELETE FROM best_scores WHERE challenge_date = ? AND ruleset_id = ? AND player_id = ?")
        .bind(row.challenge_date, row.ruleset_id, row.player_id),
      database
        .prepare(
          "INSERT INTO best_scores (challenge_date, ruleset_id, player_id, best_run_id, distance_cm, duration_ticks, achieved_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(row.challenge_date, row.ruleset_id, row.player_id, row.run_id, result.distanceCm, result.durationTicks, now),
    );
  }
  await database.batch(statements);

  return json({
    run: {
      run_id: row.run_id,
      status: "VERIFIED",
      distance_cm: result.distanceCm,
      distance_m: Number((result.distanceCm / 100).toFixed(2)),
      duration_ticks: result.durationTicks,
      terminal_reason: result.terminalReason,
      ruleset_id: row.ruleset_id,
      time_limit_completed: result.terminalReason === "TIME_LIMIT",
    },
    was_personal_best: isBetter,
  });
}

function toPublicRun(row: RunRow) {
  return {
    run_id: row.run_id,
    status: row.status,
    distance_cm: row.distance_cm,
    distance_m: row.distance_cm === null ? null : Number((row.distance_cm / 100).toFixed(2)),
    duration_ticks: row.duration_ticks,
    terminal_reason: row.terminal_reason,
    ruleset_id: row.ruleset_id,
    time_limit_completed: row.terminal_reason === "TIME_LIMIT",
  };
}

async function sha256(value: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
