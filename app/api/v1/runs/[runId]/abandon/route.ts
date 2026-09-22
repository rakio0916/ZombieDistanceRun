import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getD1 } from "@/db";
import { FIND_OWNED_RUN_STATUS, REJECT_OWNED_RUNNING_RUN } from "@/lib/ranked-recovery";

const REASONS = new Set(["TAB_HIDDEN", "PAGE_HIDDEN", "WEBGL_CONTEXT_LOST", "USER_EXIT", "CLIENT_ERROR"]);

export async function POST(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return json({ error: "AUTH_REQUIRED" }, 401);
  if ((request.headers.get("content-type") ?? "").split(";")[0] !== "application/json") {
    return json({ error: "INVALID_CONTENT_TYPE" }, 400);
  }

  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "INVALID_JSON" }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 3) {
    return json({ error: "INVALID_ABANDON" }, 422);
  }
  const payload = body as Record<string, unknown>;
  if (payload.schema_version !== "1.0.0" || typeof payload.reason !== "string" || !REASONS.has(payload.reason)
    || !Number.isInteger(payload.at_tick) || (payload.at_tick as number) < 0 || (payload.at_tick as number) > 54000) {
    return json({ error: "INVALID_ABANDON" }, 422);
  }

  const { runId } = await params;
  const database = getD1();
  const row = await database
    .prepare(FIND_OWNED_RUN_STATUS)
    .bind(runId, user.userId)
    .first<{ status: string }>();
  if (!row) return json({ error: "RUN_NOT_FOUND" }, 404);
  if (row.status === "REJECTED") return json({ abandoned: true, already_abandoned: true });
  if (row.status !== "RUNNING") return json({ error: "RUN_STATE_CONFLICT" }, 409);

  const result = await database
    .prepare(REJECT_OWNED_RUNNING_RUN)
    .bind(runId, user.userId)
    .run();
  if (result.meta.changes === 1) return json({ abandoned: true });

  // A simultaneous finish or another abandon wins; never overwrite its result.
  const current = await database.prepare("SELECT status FROM runs WHERE run_id = ?").bind(runId).first<{ status: string }>();
  if (current?.status === "REJECTED") return json({ abandoned: true, already_abandoned: true });
  return json({ error: "RUN_STATE_CONFLICT" }, 409);
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
