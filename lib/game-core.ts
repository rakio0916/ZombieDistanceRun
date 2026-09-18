export const TICK_RATE = 30;
export const MAX_TICKS = 54_000;
export const RULESET_ID = "zdr-continuous-run-v2";
export const FRONT_RULESET_ID = "zdr-front-run-v1";
export const LEGACY_RULESET_ID = "zdr-canvas-legacy-2026-09-17";
export const CORE_VERSION = "3.0.0";
export const CATALOG_VERSION = "continuous-fixed-2";
export const SAFE_START_MM = 80_000;
export const HAZARD_LOOKAHEAD_MM = 60_000;

const ENCOUNTER_SPACING_MM = 72_000;
const FIRST_ENCOUNTER_MM = 112_000;
const PLAYER_HALF_LENGTH_MM = 500;
const PLAYER_HALF_WIDTH_MM = 450;
const LANE_STEP = 1_000;
const LANE_MOVE_PER_TICK = 84;
export const ROAD_HALF_WIDTH_MM = 2_400;
export const CONTINUOUS_MOVE_PER_TICK_MM = 200;
const INITIAL_HORDE_GAP_MM = 12_000;

export type Action = "LANE_LEFT" | "LANE_RIGHT" | "JUMP" | "SPRINT_ON" | "SPRINT_OFF";
export type TerminalReason = "CAUGHT" | "TIME_LIMIT";
export type HazardKind = "ZOMBIE" | "SOLID" | "LOW";

export type GameEvent = { seq: number; tick: number; action: Action };
export type ContinuousInput = { targetXmm: number; jump: boolean; sprint: boolean };

export type GeneratedHazard = {
  id: string;
  kind: HazardKind;
  lane: 0 | 1 | 2;
  centerMm: number;
  halfLengthMm: number;
  visualArchetype: "zombie-standing" | "wrecked-car" | "road-barrier";
};

export type GameState = {
  tick: number;
  lane: number;
  lanePositionMilli: number;
  xMm: number;
  targetXmm: number;
  sprinting: boolean;
  stamina: number;
  staminaRemainder: number;
  distanceMm: number;
  distanceRemainder: number;
  hordeGapMm: number;
  jumpStartTick: number;
  jumpUntilTick: number;
  stumbleUntilTick: number;
  contactImmunityUntilTick: number;
  lastContactHazardId: string | null;
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
    lanePositionMilli: LANE_STEP,
    xMm: 0,
    targetXmm: 0,
    sprinting: false,
    stamina: 100,
    staminaRemainder: 0,
    distanceMm: 0,
    distanceRemainder: 0,
    hordeGapMm: INITIAL_HORDE_GAP_MM,
    jumpStartTick: -1,
    jumpUntilTick: 0,
    stumbleUntilTick: 0,
    contactImmunityUntilTick: 0,
    lastContactHazardId: null,
    terminalReason: null,
  };
}

export function advanceContinuousGameState(previous: GameState, seed: number, input: ContinuousInput): GameState {
  if (previous.terminalReason) return previous;
  const state = { ...previous, lastContactHazardId: null };
  const previousXmm = state.xMm;
  state.targetXmm = clampInteger(input.targetXmm, -ROAD_HALF_WIDTH_MM, ROAD_HALF_WIDTH_MM);
  state.xMm += clampInteger(state.targetXmm - state.xMm, -CONTINUOUS_MOVE_PER_TICK_MM, CONTINUOUS_MOVE_PER_TICK_MM);
  state.lanePositionMilli = 1_000 + Math.round(state.xMm / 2.4);
  state.lane = Math.max(0, Math.min(2, Math.round(state.lanePositionMilli / LANE_STEP)));
  if (input.jump && state.jumpUntilTick <= state.tick) {
    state.jumpStartTick = state.tick;
    state.jumpUntilTick = state.tick + 24;
  }
  state.sprinting = input.sprint;

  const tier = Math.floor(state.distanceMm / 250_000);
  const baseSpeedMmPerSecond = 6_500 + Math.min(3_500, tier * 250);
  const canSprint = state.sprinting && state.stamina > 0;
  const stumbling = state.stumbleUntilTick > state.tick;
  const intendedSpeed = baseSpeedMmPerSecond + (canSprint ? 2_000 : 0);
  const playerSpeedMmPerSecond = stumbling ? Math.floor(intendedSpeed / 2) : intendedSpeed;
  const hordeSpeedMmPerSecond = 5_900 + Math.min(5_100, tier * 300);
  const previousDistanceMm = state.distanceMm;
  const distanceWithRemainder = state.distanceRemainder + playerSpeedMmPerSecond;
  state.distanceMm += Math.floor(distanceWithRemainder / TICK_RATE);
  state.distanceRemainder = distanceWithRemainder % TICK_RATE;
  state.hordeGapMm += Math.trunc((playerSpeedMmPerSecond - hordeSpeedMmPerSecond) / TICK_RATE);
  updateStamina(state, canSprint);
  applyContinuousHazardContact(state, seed, previousXmm, previousDistanceMm);
  state.tick += 1;
  if (state.hordeGapMm <= 0) {
    state.hordeGapMm = 0;
    state.terminalReason = "CAUGHT";
  } else if (state.tick >= MAX_TICKS) state.terminalReason = "TIME_LIMIT";
  return state;
}

export function advanceGameState(previous: GameState, seed: number, events: readonly GameEvent[]): GameState {
  if (previous.terminalReason) return previous;
  const state = { ...previous, lastContactHazardId: null };
  for (const event of events) applyEvent(state, event.action);
  updateLanePosition(state);

  const tier = Math.floor(state.distanceMm / 250_000);
  const baseSpeedMmPerSecond = 6_500 + Math.min(3_500, tier * 250);
  const canSprint = state.sprinting && state.stamina > 0;
  const stumbling = state.stumbleUntilTick > state.tick;
  const intendedSpeed = baseSpeedMmPerSecond + (canSprint ? 2_000 : 0);
  const playerSpeedMmPerSecond = stumbling ? Math.floor(intendedSpeed / 2) : intendedSpeed;
  const hordeSpeedMmPerSecond = 5_900 + Math.min(5_100, tier * 300);
  const previousDistanceMm = state.distanceMm;

  const distanceWithRemainder = state.distanceRemainder + playerSpeedMmPerSecond;
  state.distanceMm += Math.floor(distanceWithRemainder / TICK_RATE);
  state.distanceRemainder = distanceWithRemainder % TICK_RATE;
  state.hordeGapMm += Math.trunc((playerSpeedMmPerSecond - hordeSpeedMmPerSecond) / TICK_RATE);
  updateStamina(state, canSprint);
  applyHazardContact(state, seed, previousDistanceMm);
  state.tick += 1;

  if (state.hordeGapMm <= 0) {
    state.hordeGapMm = 0;
    state.terminalReason = "CAUGHT";
  } else if (state.tick >= MAX_TICKS) state.terminalReason = "TIME_LIMIT";
  return state;
}

export function getHazardsInRange(seed: number, startMm: number, endMm: number): GeneratedHazard[] {
  if (endMm < SAFE_START_MM || endMm < startMm) return [];
  const firstIndex = Math.max(0, Math.floor((startMm - FIRST_ENCOUNTER_MM - 2_500) / ENCOUNTER_SPACING_MM));
  const lastIndex = Math.max(firstIndex, Math.ceil((endMm - FIRST_ENCOUNTER_MM + 2_500) / ENCOUNTER_SPACING_MM));
  const hazards: GeneratedHazard[] = [];
  for (let encounterIndex = firstIndex; encounterIndex <= lastIndex; encounterIndex += 1) {
    for (const hazard of hazardsForEncounter(seed, encounterIndex)) {
      const hazardStart = hazard.centerMm - hazard.halfLengthMm;
      const hazardEnd = hazard.centerMm + hazard.halfLengthMm;
      if (hazardEnd >= startMm && hazardStart <= endMm) hazards.push(hazard);
    }
  }
  return hazards.sort((left, right) => left.centerMm - right.centerMm || left.lane - right.lane);
}

export function runSimulation(seed: number, finalTick: number, events: readonly GameEvent[]): SimulationResult | null {
  return runValidatedSimulation(createGameState(), advanceGameState, seed, finalTick, events);
}

export function runSimulationForRuleset(
  rulesetId: string,
  seed: number,
  finalTick: number,
  events: readonly GameEvent[],
): SimulationResult | null {
  if (rulesetId === FRONT_RULESET_ID) return runSimulation(seed, finalTick, events);
  if (rulesetId === LEGACY_RULESET_ID) {
    return runValidatedSimulation(createLegacyGameState(), advanceLegacyGameState, seed, finalTick, events);
  }
  return null;
}

export function runContinuousSimulation(seed: number, inputs: readonly ContinuousInput[]): SimulationResult | null {
  if (inputs.length < 1 || inputs.length > MAX_TICKS) return null;
  let state = createGameState();
  for (const input of inputs) {
    if (state.terminalReason) return null;
    if (!Number.isInteger(input.targetXmm) || input.targetXmm < -ROAD_HALF_WIDTH_MM || input.targetXmm > ROAD_HALF_WIDTH_MM) return null;
    state = advanceContinuousGameState(state, seed, input);
  }
  if (!state.terminalReason || state.tick !== inputs.length) return null;
  return { ...state, durationTicks: state.tick, distanceCm: Math.floor(state.distanceMm / 10), crowdCount: 6 + 3 * Math.floor(state.distanceMm / 250_000) };
}

function runValidatedSimulation(
  initialState: GameState,
  advance: (state: GameState, seed: number, events: readonly GameEvent[]) => GameState,
  seed: number,
  finalTick: number,
  events: readonly GameEvent[],
): SimulationResult | null {
  if (!Number.isInteger(finalTick) || finalTick < 1 || finalTick > MAX_TICKS || events.length > 4_096) return null;
  const eventsByTick = new Map<number, GameEvent[]>();
  let lastTick = -1;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (event.seq !== index || !Number.isInteger(event.tick) || event.tick < 0 || event.tick >= finalTick || event.tick < lastTick) return null;
    lastTick = event.tick;
    const group = eventsByTick.get(event.tick) ?? [];
    if (group.length >= 4) return null;
    group.push(event);
    eventsByTick.set(event.tick, group);
  }
  let state = initialState;
  while (!state.terminalReason && state.tick < finalTick) state = advance(state, seed, eventsByTick.get(state.tick) ?? []);
  if (!state.terminalReason || state.tick !== finalTick) return null;
  return {
    ...state,
    durationTicks: state.tick,
    distanceCm: Math.floor(state.distanceMm / 10),
    crowdCount: 6 + 3 * Math.floor(state.distanceMm / 250_000),
  };
}

function hazardsForEncounter(seed: number, encounterIndex: number): GeneratedHazard[] {
  const centerMm = FIRST_ENCOUNTER_MM + encounterIndex * ENCOUNTER_SPACING_MM;
  const random = hash32(seed ^ Math.imul(encounterIndex + 1, 0x9e3779b1));
  const safeLane = (random % 3) as 0 | 1 | 2;
  const blocked = ([0, 1, 2] as const).filter((lane) => lane !== safeLane);
  const variant = (random >>> 8) % 4;
  const count = variant === 0 ? 1 : 2;
  return blocked.slice(0, count).map((lane, index) => {
    const kind: HazardKind = variant === 2 && index === 1 ? "LOW" : variant === 3 && index === 0 ? "SOLID" : "ZOMBIE";
    return {
      id: `enc-${encounterIndex}-${lane}-${kind.toLowerCase()}`,
      kind,
      lane,
      centerMm,
      halfLengthMm: kind === "SOLID" ? 1_600 : kind === "LOW" ? 550 : 450,
      visualArchetype: kind === "ZOMBIE" ? "zombie-standing" : kind === "SOLID" ? "wrecked-car" : "road-barrier",
    };
  });
}

function applyEvent(state: GameState, action: Action): void {
  if (action === "LANE_LEFT") state.lane = Math.max(0, state.lane - 1);
  if (action === "LANE_RIGHT") state.lane = Math.min(2, state.lane + 1);
  if (action === "JUMP" && state.jumpUntilTick <= state.tick) {
    state.jumpStartTick = state.tick;
    state.jumpUntilTick = state.tick + 24;
  }
  if (action === "SPRINT_ON") state.sprinting = true;
  if (action === "SPRINT_OFF") state.sprinting = false;
}

function updateLanePosition(state: GameState): void {
  const target = state.lane * LANE_STEP;
  if (state.lanePositionMilli < target) state.lanePositionMilli = Math.min(target, state.lanePositionMilli + LANE_MOVE_PER_TICK);
  else if (state.lanePositionMilli > target) state.lanePositionMilli = Math.max(target, state.lanePositionMilli - LANE_MOVE_PER_TICK);
}

function updateStamina(state: GameState, sprinting: boolean): void {
  const perSecond = sprinting ? -25 : 15;
  const amount = state.staminaRemainder + perSecond;
  const delta = amount < 0 ? Math.ceil(amount / TICK_RATE) : Math.floor(amount / TICK_RATE);
  state.stamina = Math.max(0, Math.min(100, state.stamina + delta));
  state.staminaRemainder = amount - delta * TICK_RATE;
  if (state.stamina === 0) state.sprinting = false;
}

function applyHazardContact(state: GameState, seed: number, previousDistanceMm: number): void {
  const previousFront = previousDistanceMm + PLAYER_HALF_LENGTH_MM;
  const currentFront = state.distanceMm + PLAYER_HALF_LENGTH_MM;
  const candidates = getHazardsInRange(seed, previousFront, currentFront + 1_700);
  const contacted = candidates.find((hazard) => {
    const entry = hazard.centerMm - hazard.halfLengthMm;
    if (!(previousFront < entry && currentFront >= entry)) return false;
    if (Math.abs(state.lanePositionMilli - hazard.lane * LANE_STEP) > 520) return false;
    return hazard.kind !== "LOW" || !isJumpClear(state);
  });
  if (!contacted || state.contactImmunityUntilTick > state.tick) return;
  state.hordeGapMm -= 4_000;
  state.stumbleUntilTick = state.tick + 24;
  state.contactImmunityUntilTick = state.tick + 45;
  state.lastContactHazardId = contacted.id;
}

function isJumpClear(state: GameState): boolean {
  if (state.jumpStartTick < 0) return false;
  const phase = state.tick - state.jumpStartTick;
  return phase >= 6 && phase <= 18 && state.jumpUntilTick > state.tick;
}

function applyContinuousHazardContact(
  state: GameState,
  seed: number,
  previousXmm: number,
  previousDistanceMm: number,
): void {
  const start = previousDistanceMm - PLAYER_HALF_LENGTH_MM - 1_600;
  const end = state.distanceMm + PLAYER_HALF_LENGTH_MM + 1_600;
  const contacted = getHazardsInRange(seed, start, end).find((hazard) => {
    const hazardXmm = (hazard.lane - 1) * 2_400;
    const hazardHalfWidthMm = hazard.kind === "SOLID" ? 900 : hazard.kind === "LOW" ? 910 : 470;
    const overlapsForward =
      state.distanceMm + PLAYER_HALF_LENGTH_MM >= hazard.centerMm - hazard.halfLengthMm &&
      previousDistanceMm - PLAYER_HALF_LENGTH_MM <= hazard.centerMm + hazard.halfLengthMm;
    const startDelta = previousXmm - hazardXmm;
    const endDelta = state.xMm - hazardXmm;
    const expandedHalfWidth = PLAYER_HALF_WIDTH_MM + hazardHalfWidthMm;
    const overlapsSide = Math.min(startDelta, endDelta) <= expandedHalfWidth && Math.max(startDelta, endDelta) >= -expandedHalfWidth;
    return overlapsForward && overlapsSide && (hazard.kind !== "LOW" || !isJumpClear(state));
  });
  if (!contacted || state.contactImmunityUntilTick > state.tick) return;
  state.hordeGapMm -= 4_000;
  state.stumbleUntilTick = state.tick + 24;
  state.contactImmunityUntilTick = state.tick + 45;
  state.lastContactHazardId = contacted.id;
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(minimum, Math.min(maximum, Math.round(value)));
}

function createLegacyGameState(): GameState {
  return { ...createGameState(), hordeGapMm: 36_000 };
}

function advanceLegacyGameState(previous: GameState, seed: number, events: readonly GameEvent[]): GameState {
  if (previous.terminalReason) return previous;
  const state = { ...previous, lastContactHazardId: null };
  for (const event of events) {
    if (event.action === "LANE_LEFT") state.lane = Math.max(0, state.lane - 1);
    if (event.action === "LANE_RIGHT") state.lane = Math.min(2, state.lane + 1);
    if (event.action === "JUMP") state.jumpUntilTick = Math.max(state.jumpUntilTick, state.tick + 18);
    if (event.action === "SPRINT_ON") state.sprinting = true;
    if (event.action === "SPRINT_OFF") state.sprinting = false;
  }
  state.lanePositionMilli = state.lane * LANE_STEP;
  const tier = Math.floor(state.distanceMm / 250_000);
  const baseSpeed = 6_500 + Math.min(3_500, tier * 250);
  const canSprint = state.sprinting && state.stamina > 0;
  const playerSpeed = baseSpeed + (canSprint ? 2_000 : 0);
  const hordeSpeed = 5_900 + Math.min(5_100, tier * 300);
  const distanceWithRemainder = state.distanceRemainder + playerSpeed;
  state.distanceMm += Math.floor(distanceWithRemainder / TICK_RATE);
  state.distanceRemainder = distanceWithRemainder % TICK_RATE;
  state.hordeGapMm += Math.floor((playerSpeed - hordeSpeed) / TICK_RATE);
  updateStamina(state, canSprint);
  if (state.tick !== 0 && state.tick % 120 === 0) {
    const safeLane = hash32(seed ^ state.tick) % 3;
    if (state.lane !== safeLane && state.jumpUntilTick <= state.tick) state.hordeGapMm -= 4_500;
  }
  state.tick += 1;
  if (state.hordeGapMm <= 0) {
    state.hordeGapMm = 0;
    state.terminalReason = "CAUGHT";
  } else if (state.tick >= MAX_TICKS) state.terminalReason = "TIME_LIMIT";
  return state;
}

export function hash32(value: number): number {
  let hash = value >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  return (hash ^ (hash >>> 16)) >>> 0;
}

export function seedForDate(challengeDate: string): number {
  let hash = 2_166_136_261;
  for (const char of challengeDate) hash = Math.imul(hash ^ char.charCodeAt(0), 16_777_619);
  return hash >>> 0;
}

/** Calendar day used by the global Daily challenge. */
export function challengeDateInTokyo(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
