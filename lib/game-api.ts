import type { Action, GameEvent, TerminalReason } from "./game-core";

const actions = new Set<Action>([
  "LANE_LEFT",
  "LANE_RIGHT",
  "JUMP",
  "SPRINT_ON",
  "SPRINT_OFF",
]);

export type FinishPayload = {
  schema_version: "1.0.0";
  submission_id: string;
  final_tick: number;
  terminal_reason: TerminalReason;
  events: GameEvent[];
};

export function parseFinishPayload(value: unknown): FinishPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const keys = Object.keys(body);
  if (
    keys.length !== 5 ||
    !keys.every((key) =>
      ["schema_version", "submission_id", "final_tick", "terminal_reason", "events"].includes(key),
    ) ||
    body.schema_version !== "1.0.0" ||
    typeof body.submission_id !== "string" ||
    !isUuid(body.submission_id) ||
    !Number.isInteger(body.final_tick) ||
    (body.terminal_reason !== "CAUGHT" && body.terminal_reason !== "TIME_LIMIT") ||
    !Array.isArray(body.events)
  ) {
    return null;
  }

  const events: GameEvent[] = [];
  for (const entry of body.events) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const event = entry as Record<string, unknown>;
    if (
      Object.keys(event).length !== 3 ||
      !["seq", "tick", "action"].every((key) => key in event) ||
      !Number.isInteger(event.seq) ||
      !Number.isInteger(event.tick) ||
      typeof event.action !== "string" ||
      !actions.has(event.action as Action)
    ) {
      return null;
    }
    events.push({ seq: event.seq as number, tick: event.tick as number, action: event.action as Action });
  }
  return {
    schema_version: "1.0.0",
    submission_id: body.submission_id,
    final_tick: body.final_tick as number,
    terminal_reason: body.terminal_reason,
    events,
  };
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
