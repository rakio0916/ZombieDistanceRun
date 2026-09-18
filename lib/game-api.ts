import { MAX_TICKS, ROAD_HALF_WIDTH_MM, type Action, type ContinuousInput, type GameEvent, type TerminalReason } from "./game-core";

const actions = new Set<Action>([
  "LANE_LEFT",
  "LANE_RIGHT",
  "JUMP",
  "SPRINT_ON",
  "SPRINT_OFF",
]);

export type LegacyFinishPayload = {
  schema_version: "1.0.0";
  submission_id: string;
  final_tick: number;
  terminal_reason: TerminalReason;
  events: GameEvent[];
};

export type ContinuousFinishPayload = {
  schema_version: "2.0.0";
  submission_id: string;
  final_tick: number;
  terminal_reason: TerminalReason;
  input_b64: string;
};

export type FinishPayload = LegacyFinishPayload | ContinuousFinishPayload;

export function parseFinishPayload(value: unknown): FinishPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const keys = Object.keys(body);
  if (body.schema_version === "2.0.0") {
    if (
      keys.length !== 5 ||
      !keys.every((key) => ["schema_version", "submission_id", "final_tick", "terminal_reason", "input_b64"].includes(key)) ||
      typeof body.submission_id !== "string" || !isUuid(body.submission_id) ||
      !Number.isInteger(body.final_tick) || (body.final_tick as number) < 1 || (body.final_tick as number) > MAX_TICKS ||
      (body.terminal_reason !== "CAUGHT" && body.terminal_reason !== "TIME_LIMIT") ||
      typeof body.input_b64 !== "string"
    ) return null;
    const decoded = decodeContinuousInputs(body.input_b64, body.final_tick as number);
    if (!decoded) return null;
    return { schema_version: "2.0.0", submission_id: body.submission_id, final_tick: body.final_tick as number, terminal_reason: body.terminal_reason, input_b64: body.input_b64 };
  }
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

export function encodeContinuousInputs(inputs: readonly ContinuousInput[]): string {
  const bytes = new Uint8Array(inputs.length * 2);
  inputs.forEach((input, index) => {
    const targetIndex = Math.round((input.targetXmm + ROAD_HALF_WIDTH_MM) / 10);
    const word = targetIndex | (input.jump ? 1 << 9 : 0) | (input.sprint ? 1 << 10 : 0);
    bytes[index * 2] = word & 0xff;
    bytes[index * 2 + 1] = word >>> 8;
  });
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
}

export function decodeContinuousInputs(value: string, finalTick: number): ContinuousInput[] | null {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) return null;
  let binary: string;
  try { binary = atob(value); } catch { return null; }
  if (binary.length !== finalTick * 2) return null;
  const inputs: ContinuousInput[] = [];
  for (let index = 0; index < finalTick; index += 1) {
    const word = binary.charCodeAt(index * 2) | (binary.charCodeAt(index * 2 + 1) << 8);
    if ((word & 0xf800) !== 0) return null;
    const targetIndex = word & 0x1ff;
    if (targetIndex > 480) return null;
    inputs.push({ targetXmm: -ROAD_HALF_WIDTH_MM + targetIndex * 10, jump: (word & (1 << 9)) !== 0, sprint: (word & (1 << 10)) !== 0 });
  }
  return inputs;
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
