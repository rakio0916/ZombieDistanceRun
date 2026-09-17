export const TICK_RATE = 30;
export const MAX_TICKS = 54_000;

export type Action = "LANE_LEFT" | "LANE_RIGHT" | "JUMP" | "SPRINT_ON" | "SPRINT_OFF";
export type TerminalReason = "CAUGHT" | "TIME_LIMIT";

export type GameEvent = {
  seq: number;
  tick: number;
  action: Action;
};

export type GameState = {
  tick: number;
  lane: number;
  sprinting: boolean;
  stamina: number;
  staminaRemainder: number;
  distanceMm: number;
  distanceRemainder: number;
  hordeGapMm: number;
  jumpUntilTick: number;
  terminalReason: TerminalReason | null;
};

export type SimulationResult = GameState & {
  durationTicks: number;
  distanceCm: number;
  crowdCount: number;
};

export function createGameState(): GameState {
  return {
    tick: 0,
    lane: 1,
    sprinting: false,
    stamina: 100,
    staminaRemainder: 0,
    distanceMm: 0,
    distanceRemainder: 0,
    hordeGapMm: 36_000,
    jumpUntilTick: 0,
    terminalReason: null,
  };
}

export function advanceGameState(
  previous: GameState,
  seed: number,
  events: readonly GameEvent[],
): GameState {
  if (previous.terminalReason) return previous;

  const state = { ...previous };
  for (const event of events) applyEvent(state, event.action);

  const tier = Math.floor(state.distanceMm / 250_000);
  const baseSpeedMmPerSecond = 6_500 + Math.min(3_500, tier * 250);
  const canSprint = state.sprinting && state.stamina > 0;
  const playerSpeedMmPerSecond = baseSpeedMmPerSecond + (canSprint ? 2_000 : 0);
  const hordeSpeedMmPerSecond = 5_900 + Math.min(5_100, tier * 300);

  const distanceWithRemainder = state.distanceRemainder + playerSpeedMmPerSecond;
  state.distanceMm += Math.floor(distanceWithRemainder / TICK_RATE);
  state.distanceRemainder = distanceWithRemainder % TICK_RATE;
  state.hordeGapMm += Math.floor(
    (playerSpeedMmPerSecond - hordeSpeedMmPerSecond) / TICK_RATE,
  );

  updateStamina(state, canSprint);
  applyHazard(state, seed);
  state.tick += 1;

  if (state.hordeGapMm <= 0) {
    state.hordeGapMm = 0;
    state.terminalReason = "CAUGHT";
  } else if (state.tick >= MAX_TICKS) {
    state.terminalReason = "TIME_LIMIT";
  }

  return state;
}

export function runSimulation(
  seed: number,
  finalTick: number,
  events: readonly GameEvent[],
): SimulationResult | null {
  if (!Number.isInteger(finalTick) || finalTick < 1 || finalTick > MAX_TICKS) {
    return null;
  }
  if (events.length > 4_096) return null;

  const eventsByTick = new Map<number, GameEvent[]>();
  let lastTick = -1;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (
      event.seq !== index ||
      !Number.isInteger(event.tick) ||
      event.tick < 0 ||
      event.tick >= finalTick ||
      event.tick < lastTick
    ) {
      return null;
    }
    lastTick = event.tick;
    const group = eventsByTick.get(event.tick) ?? [];
    if (group.length >= 4) return null;
    group.push(event);
    eventsByTick.set(event.tick, group);
  }

  let state = createGameState();
  while (!state.terminalReason && state.tick < finalTick) {
    state = advanceGameState(state, seed, eventsByTick.get(state.tick) ?? []);
  }
  if (!state.terminalReason || state.tick !== finalTick) return null;

  return {
    ...state,
    durationTicks: state.tick,
    distanceCm: Math.floor(state.distanceMm / 10),
    crowdCount: 6 + 3 * Math.floor(state.distanceMm / 250_000),
  };
}

function applyEvent(state: GameState, action: Action): void {
  switch (action) {
    case "LANE_LEFT":
      state.lane = Math.max(0, state.lane - 1);
      break;
    case "LANE_RIGHT":
      state.lane = Math.min(2, state.lane + 1);
      break;
    case "JUMP":
      state.jumpUntilTick = Math.max(state.jumpUntilTick, state.tick + 18);
      break;
    case "SPRINT_ON":
      state.sprinting = true;
      break;
    case "SPRINT_OFF":
      state.sprinting = false;
      break;
  }
}

function updateStamina(state: GameState, sprinting: boolean): void {
  const perSecond = sprinting ? -25 : 15;
  const amount = state.staminaRemainder + perSecond;
  const delta = amount < 0 ? Math.ceil(amount / TICK_RATE) : Math.floor(amount / TICK_RATE);
  state.stamina = Math.max(0, Math.min(100, state.stamina + delta));
  state.staminaRemainder = amount - delta * TICK_RATE;
  if (state.stamina === 0) state.sprinting = false;
}

function applyHazard(state: GameState, seed: number): void {
  if (state.tick === 0 || state.tick % 120 !== 0) return;
  const safeLane = hash32(seed ^ state.tick) % 3;
  const jumping = state.jumpUntilTick > state.tick;
  if (state.lane !== safeLane && !jumping) state.hordeGapMm -= 4_500;
}

export function hash32(value: number): number {
  let hash = value >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  return (hash ^ (hash >>> 16)) >>> 0;
}

export function seedForDate(challengeDate: string): number {
  let hash = 2_166_136_261;
  for (const char of challengeDate) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 16_777_619);
  }
  return hash >>> 0;
}

/** Calendar day used by the global Daily challenge. This never relies on a
 * runtime locale's date ordering. */
export function challengeDateInTokyo(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
