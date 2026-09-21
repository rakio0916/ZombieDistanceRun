export const TICK_RATE = 30;
export const MAX_TICKS = 54_000;
export const RULESET_ID = "zdr-gesture-run-v3";
export const DIFFICULTY_RULESET_IDS = {
  beginner: "zdr-difficulty-beginner-v7",
  intermediate: "zdr-difficulty-intermediate-v7",
  advanced: "zdr-difficulty-advanced-v7",
} as const;
export const FIXED_DIFFICULTY_RULESET_IDS = {
  beginner: "zdr-difficulty-beginner-v6",
  intermediate: "zdr-difficulty-intermediate-v6",
  advanced: "zdr-difficulty-advanced-v6",
} as const;
export const PREVIOUS_DIFFICULTY_RULESET_IDS = {
  beginner: "zdr-difficulty-beginner-v5",
  intermediate: "zdr-difficulty-intermediate-v5",
  advanced: "zdr-difficulty-advanced-v5",
} as const;
export const LEGACY_DIFFICULTY_RULESET_IDS = {
  beginner: "zdr-difficulty-beginner-v4",
  intermediate: "zdr-difficulty-intermediate-v4",
  advanced: "zdr-difficulty-advanced-v4",
} as const;
export const DIFFICULTY_SPEED_PERCENT = { beginner: 100, intermediate: 200, advanced: 500 } as const;
export const PREVIOUS_DIFFICULTY_SPEED_PERCENT = { beginner: 100, intermediate: 150, advanced: 200 } as const;
export const LEGACY_DIFFICULTY_SPEED_PERCENT = { beginner: 85, intermediate: 100, advanced: 120 } as const;
export const DIFFICULTY_CORE_VERSION = "8.0.0";
export const DIFFICULTY_CATALOG_VERSION = "zdr-difficulty-course-v6";
export const CONTINUOUS_RULESET_ID = "zdr-continuous-run-v2";
export const FRONT_RULESET_ID = "zdr-front-run-v1";
export const LEGACY_RULESET_ID = "zdr-canvas-legacy-2026-09-17";
export const CORE_VERSION = "4.0.0";
export const CATALOG_VERSION = "gesture-fixed-3";
export const SAFE_START_MM = 80_000;
export const HAZARD_LOOKAHEAD_MM = 60_000;
export const WALKING_ZOMBIE_LOOKAHEAD_MM = 120_000;
export const ZOMBIE_WALK_MM_PER_TICK = 15;

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
export type TerminalReason = "CAUGHT" | "EXHAUSTED" | "TIME_LIMIT";
export type HazardKind = "ZOMBIE" | "SOLID" | "LOW";
export type Difficulty = keyof typeof DIFFICULTY_RULESET_IDS;
export type DifficultyRulesGeneration = "current" | "v6" | "v5" | "v4";

export type GameEvent = { seq: number; tick: number; action: Action };
/** v3 input: jump and boost are one-tick edges, never held states. */
export type ContinuousInput = { targetXmm: number; jump: boolean; boost: boolean };
export type DifficultyInput = { targetXmm: number; jump: boolean };
/** Kept solely to replay v2 ranked runs. */
export type ContinuousV2Input = { targetXmm: number; jump: boolean; sprint: boolean };

export type GeneratedHazard = {
  id: string;
  kind: HazardKind;
  lane: 0 | 1 | 2;
  centerMm: number;
  halfLengthMm: number;
  visualArchetype: "zombie-standing" | "zombie-walking" | "wrecked-car" | "road-barrier";
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
  boostUntilTick: number;
  boostCooldownUntilTick: number;
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
    boostUntilTick: 0,
    boostCooldownUntilTick: 0,
    lastContactHazardId: null,
    terminalReason: null,
  };
}

/** New difficulty runs have no safety-distance state. */
export function createDifficultyGameState(): GameState {
  const state = createGameState();
  delete (state as Partial<GameState>).hordeGapMm;
  return state;
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
  if (input.boost && state.boostUntilTick <= state.tick && state.boostCooldownUntilTick <= state.tick && state.stamina >= 10) {
    state.stamina -= 10;
    state.boostUntilTick = state.tick + 60;
    state.boostCooldownUntilTick = state.tick + 120;
  }
  state.sprinting = state.boostUntilTick > state.tick;

  const tier = Math.floor(state.distanceMm / 250_000);
  const baseSpeedMmPerSecond = 6_500 + Math.min(3_500, tier * 250);
  const canSprint = state.sprinting;
  const stumbling = state.stumbleUntilTick > state.tick;
  const intendedSpeed = baseSpeedMmPerSecond + (canSprint ? 2_000 : 0);
  const playerSpeedMmPerSecond = stumbling ? Math.floor(intendedSpeed / 2) : intendedSpeed;
  const hordeSpeedMmPerSecond = 5_900 + Math.min(5_100, tier * 300);
  const previousDistanceMm = state.distanceMm;
  const distanceWithRemainder = state.distanceRemainder + playerSpeedMmPerSecond;
  state.distanceMm += Math.floor(distanceWithRemainder / TICK_RATE);
  state.distanceRemainder = distanceWithRemainder % TICK_RATE;
  state.hordeGapMm = Math.min(INITIAL_HORDE_GAP_MM, state.hordeGapMm + Math.trunc((playerSpeedMmPerSecond - hordeSpeedMmPerSecond) / TICK_RATE));
  applyGestureHazardContact(state, seed, previousXmm, previousDistanceMm);
  state.tick += 1;
  if (state.stamina <= 0) {
    state.stamina = 0;
    state.terminalReason = "EXHAUSTED";
  } else if (state.hordeGapMm <= 0) {
    state.hordeGapMm = 0;
    state.terminalReason = "CAUGHT";
  } else if (state.tick >= MAX_TICKS) state.terminalReason = "TIME_LIMIT";
  return state;
}

export function isDifficulty(value: unknown): value is Difficulty {
  return value === "beginner" || value === "intermediate" || value === "advanced";
}

export function difficultyForRuleset(rulesetId: string): Difficulty | null {
  return difficultyConfigForRuleset(rulesetId)?.difficulty ?? null;
}

export function difficultyConfigForRuleset(rulesetId: string): { difficulty: Difficulty; speedPercent: number; generation: DifficultyRulesGeneration } | null {
  for (const difficulty of Object.keys(DIFFICULTY_RULESET_IDS) as Difficulty[]) {
    if (DIFFICULTY_RULESET_IDS[difficulty] === rulesetId) {
      return { difficulty, speedPercent: DIFFICULTY_SPEED_PERCENT[difficulty], generation: "current" };
    }
    if (FIXED_DIFFICULTY_RULESET_IDS[difficulty] === rulesetId) {
      return { difficulty, speedPercent: DIFFICULTY_SPEED_PERCENT[difficulty], generation: "v6" };
    }
    if (PREVIOUS_DIFFICULTY_RULESET_IDS[difficulty] === rulesetId) {
      return { difficulty, speedPercent: PREVIOUS_DIFFICULTY_SPEED_PERCENT[difficulty], generation: "v5" };
    }
    if (LEGACY_DIFFICULTY_RULESET_IDS[difficulty] === rulesetId) {
      return { difficulty, speedPercent: LEGACY_DIFFICULTY_SPEED_PERCENT[difficulty], generation: "v4" };
    }
  }
  return null;
}

export function advanceDifficultyGameState(
  previous: GameState,
  seed: number,
  input: DifficultyInput,
  difficulty: Difficulty,
  speedPercent = DIFFICULTY_SPEED_PERCENT[difficulty],
  generation: DifficultyRulesGeneration = "current",
): GameState {
  if (previous.terminalReason) return previous;
  const state = { ...previous, lastContactHazardId: null, sprinting: false, boostUntilTick: 0, boostCooldownUntilTick: 0 };
  if (generation === "current" || generation === "v6") delete (state as Partial<GameState>).hordeGapMm;
  const previousXmm = state.xMm;
  state.targetXmm = clampInteger(input.targetXmm, -ROAD_HALF_WIDTH_MM, ROAD_HALF_WIDTH_MM);
  state.xMm += clampInteger(state.targetXmm - state.xMm, -CONTINUOUS_MOVE_PER_TICK_MM, CONTINUOUS_MOVE_PER_TICK_MM);
  state.lanePositionMilli = 1_000 + Math.round(state.xMm / 2.4);
  state.lane = Math.max(0, Math.min(2, Math.round(state.lanePositionMilli / LANE_STEP)));
  if (input.jump && state.jumpUntilTick <= state.tick) {
    state.jumpStartTick = state.tick;
    state.jumpUntilTick = state.tick + 24;
  }

  const tier = Math.floor(state.distanceMm / 250_000);
  const baseSpeed = 6_500 + Math.min(3_500, tier * 250);
  const hordeBaseSpeed = 5_900 + Math.min(5_100, tier * 300);
  const intendedSpeed = Math.floor((baseSpeed * speedPercent) / 100);
  const playerSpeed = state.stumbleUntilTick > state.tick ? Math.floor(intendedSpeed / 2) : intendedSpeed;
  const hordeSpeed = Math.floor((hordeBaseSpeed * speedPercent) / 100);
  const previousDistanceMm = state.distanceMm;
  const withRemainder = state.distanceRemainder + playerSpeed;
  state.distanceMm += Math.floor(withRemainder / TICK_RATE);
  state.distanceRemainder = withRemainder % TICK_RATE;
  if (generation !== "current" && generation !== "v6") {
    state.hordeGapMm = Math.min(INITIAL_HORDE_GAP_MM, (state.hordeGapMm ?? INITIAL_HORDE_GAP_MM) + Math.trunc((playerSpeed - hordeSpeed) / TICK_RATE));
  }
  applyDifficultyHazardContact(state, seed, previousXmm, previousDistanceMm, generation);
  state.tick += 1;
  if (state.stamina <= 0) {
    state.stamina = 0;
    state.terminalReason = "EXHAUSTED";
  } else if (generation !== "current" && generation !== "v6" && (state.hordeGapMm ?? 0) <= 0) {
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
    for (const hazard of hazardsForEncounter(seed, encounterIndex, 550)) {
      const hazardStart = hazard.centerMm - hazard.halfLengthMm;
      const hazardEnd = hazard.centerMm + hazard.halfLengthMm;
      if (hazardEnd >= startMm && hazardStart <= endMm) hazards.push(hazard);
    }
  }
  return hazards.sort((left, right) => left.centerMm - right.centerMm || left.lane - right.lane);
}

export function getDifficultyHazardsInRange(seed: number, startMm: number, endMm: number): GeneratedHazard[] {
  return getDifficultyHazardsForGeneration(seed, startMm, endMm, "current");
}

/** New-run zombie positions share the fixed 30Hz Core clock on client and server. */
export function getWalkingHazardsInRange(seed: number, tick: number, startMm: number, endMm: number): GeneratedHazard[] {
  if (!Number.isInteger(tick) || tick < 0 || endMm < startMm) return [];
  const walkedMm = tick * ZOMBIE_WALK_MM_PER_TICK;
  const zombies = getDifficultyHazardsForGeneration(seed, startMm - walkedMm, endMm - walkedMm, "current")
    .filter((hazard) => hazard.kind === "ZOMBIE")
    .map((hazard) => ({ ...hazard, centerMm: hazard.centerMm + walkedMm, visualArchetype: "zombie-walking" as const }));
  const barriers = getDifficultyHazardsForGeneration(seed, startMm, endMm, "current")
    .filter((hazard) => hazard.kind !== "ZOMBIE");
  return [...zombies, ...barriers].sort((left, right) => left.centerMm - right.centerMm || left.lane - right.lane);
}

export function getPreviousDifficultyHazardsInRange(seed: number, startMm: number, endMm: number): GeneratedHazard[] {
  return getDifficultyHazardsForGeneration(seed, startMm, endMm, "v5");
}

function getDifficultyHazardsForGeneration(seed: number, startMm: number, endMm: number, generation: DifficultyRulesGeneration): GeneratedHazard[] {
  if (endMm < SAFE_START_MM || endMm < startMm) return [];
  const firstIndex = Math.max(0, Math.floor((startMm - FIRST_ENCOUNTER_MM - 2_500) / ENCOUNTER_SPACING_MM));
  const lastIndex = Math.max(firstIndex, Math.ceil((endMm - FIRST_ENCOUNTER_MM + 2_500) / ENCOUNTER_SPACING_MM));
  const hazards: GeneratedHazard[] = [];
  for (let encounterIndex = firstIndex; encounterIndex <= lastIndex; encounterIndex += 1) {
    for (const hazard of hazardsForEncounter(seed, encounterIndex, 400, generation === "current" || generation === "v6")) {
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

export function runDifficultySimulation(
  seed: number,
  inputs: readonly DifficultyInput[],
  difficulty: Difficulty,
  speedPercent = DIFFICULTY_SPEED_PERCENT[difficulty],
  generation: DifficultyRulesGeneration = "current",
): SimulationResult | null {
  if (inputs.length < 1 || inputs.length > MAX_TICKS) return null;
  let state = generation === "current" || generation === "v6" ? createDifficultyGameState() : createGameState();
  for (const input of inputs) {
    if (state.terminalReason) return null;
    if (!Number.isInteger(input.targetXmm) || input.targetXmm < -ROAD_HALF_WIDTH_MM || input.targetXmm > ROAD_HALF_WIDTH_MM) return null;
    state = advanceDifficultyGameState(state, seed, input, difficulty, speedPercent, generation);
  }
  if (!state.terminalReason || state.tick !== inputs.length) return null;
  return { ...state, durationTicks: state.tick, distanceCm: Math.floor(state.distanceMm / 10), crowdCount: 6 + 3 * Math.floor(state.distanceMm / 250_000) };
}

/** Replays the former continuous-v2 contract without applying v3 damage rules. */
export function runContinuousV2Simulation(seed: number, inputs: readonly ContinuousV2Input[]): SimulationResult | null {
  if (inputs.length < 1 || inputs.length > MAX_TICKS) return null;
  let state = createGameState();
  for (const input of inputs) {
    if (state.terminalReason || !Number.isInteger(input.targetXmm) || input.targetXmm < -ROAD_HALF_WIDTH_MM || input.targetXmm > ROAD_HALF_WIDTH_MM) return null;
    state = advanceContinuousV2GameState(state, seed, input);
  }
  if (!state.terminalReason || state.tick !== inputs.length) return null;
  return { ...state, durationTicks: state.tick, distanceCm: Math.floor(state.distanceMm / 10), crowdCount: 6 + 3 * Math.floor(state.distanceMm / 250_000) };
}

function advanceContinuousV2GameState(previous: GameState, seed: number, input: ContinuousV2Input): GameState {
  if (previous.terminalReason) return previous;
  const state = { ...previous, lastContactHazardId: null };
  const previousXmm = state.xMm;
  state.targetXmm = clampInteger(input.targetXmm, -ROAD_HALF_WIDTH_MM, ROAD_HALF_WIDTH_MM);
  state.xMm += clampInteger(state.targetXmm - state.xMm, -CONTINUOUS_MOVE_PER_TICK_MM, CONTINUOUS_MOVE_PER_TICK_MM);
  state.lanePositionMilli = 1_000 + Math.round(state.xMm / 2.4);
  state.lane = Math.max(0, Math.min(2, Math.round(state.lanePositionMilli / LANE_STEP)));
  if (input.jump && state.jumpUntilTick <= state.tick) { state.jumpStartTick = state.tick; state.jumpUntilTick = state.tick + 24; }
  state.sprinting = input.sprint;
  const tier = Math.floor(state.distanceMm / 250_000);
  const base = 6_500 + Math.min(3_500, tier * 250);
  const speed = state.stumbleUntilTick > state.tick ? Math.floor((base + (state.sprinting && state.stamina > 0 ? 2_000 : 0)) / 2) : base + (state.sprinting && state.stamina > 0 ? 2_000 : 0);
  const horde = 5_900 + Math.min(5_100, tier * 300);
  const previousDistanceMm = state.distanceMm;
  const withRemainder = state.distanceRemainder + speed;
  state.distanceMm += Math.floor(withRemainder / TICK_RATE);
  state.distanceRemainder = withRemainder % TICK_RATE;
  state.hordeGapMm += Math.trunc((speed - horde) / TICK_RATE);
  updateStamina(state, state.sprinting && state.stamina > 0);
  applyContinuousHazardContact(state, seed, previousXmm, previousDistanceMm);
  state.tick += 1;
  if (state.hordeGapMm <= 0) { state.hordeGapMm = 0; state.terminalReason = "CAUGHT"; }
  else if (state.tick >= MAX_TICKS) state.terminalReason = "TIME_LIMIT";
  return state;
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

function hazardsForEncounter(seed: number, encounterIndex: number, lowHalfLengthMm: number, jumpableOnly = false): GeneratedHazard[] {
  const centerMm = FIRST_ENCOUNTER_MM + encounterIndex * ENCOUNTER_SPACING_MM;
  const random = hash32(seed ^ Math.imul(encounterIndex + 1, 0x9e3779b1));
  const safeLane = (random % 3) as 0 | 1 | 2;
  const blocked = ([0, 1, 2] as const).filter((lane) => lane !== safeLane);
  const variant = (random >>> 8) % 4;
  const count = variant === 0 ? 1 : 2;
  return blocked.slice(0, count).map((lane, index) => {
    const legacyKind: HazardKind = variant === 2 && index === 1 ? "LOW" : variant === 3 && index === 0 ? "SOLID" : "ZOMBIE";
    const kind: HazardKind = jumpableOnly && legacyKind === "SOLID" ? "LOW" : legacyKind;
    return {
      id: `enc-${encounterIndex}-${lane}-${kind.toLowerCase()}`,
      kind,
      lane,
      centerMm,
      halfLengthMm: kind === "SOLID" ? 1_600 : kind === "LOW" ? lowHalfLengthMm : 450,
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

function applyGestureHazardContact(
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
  state.stamina = Math.max(0, state.stamina - 25);
  state.hordeGapMm = Math.max(0, state.hordeGapMm - 4_000);
  state.stumbleUntilTick = state.tick + 24;
  state.contactImmunityUntilTick = state.tick + 45;
  state.boostUntilTick = 0;
  state.boostCooldownUntilTick = state.tick + 120;
  state.sprinting = false;
  state.lastContactHazardId = contacted.id;
}

function applyDifficultyHazardContact(
  state: GameState,
  seed: number,
  previousXmm: number,
  previousDistanceMm: number,
  generation: DifficultyRulesGeneration,
): void {
  const start = previousDistanceMm - PLAYER_HALF_LENGTH_MM - 1_600;
  const end = state.distanceMm + PLAYER_HALF_LENGTH_MM + 1_600;
  const hazards = generation === "current"
    ? getWalkingHazardsInRange(seed, state.tick + 1, start - 2_000, end + 2_000)
    : generation === "v6"
      ? getDifficultyHazardsInRange(seed, start, end)
      : getPreviousDifficultyHazardsInRange(seed, start, end);
  const contacted = hazards.find((hazard) => {
    const hazardXmm = (hazard.lane - 1) * 2_400;
    const hazardHalfWidthMm = hazard.kind === "SOLID" ? 900 : hazard.kind === "LOW" ? 910 : 470;
    if (generation === "current") {
      const previousCenterMm = hazard.centerMm - (hazard.kind === "ZOMBIE" ? ZOMBIE_WALK_MM_PER_TICK : 0);
      return sweptOverlap(
        previousXmm - hazardXmm, state.xMm - hazardXmm,
        previousDistanceMm - previousCenterMm, state.distanceMm - hazard.centerMm,
        PLAYER_HALF_WIDTH_MM + hazardHalfWidthMm, PLAYER_HALF_LENGTH_MM + hazard.halfLengthMm,
      ) && (hazard.kind !== "LOW" || !isJumpClear(state));
    }
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
  state.stamina = Math.max(0, state.stamina - 25);
  if (generation !== "current" && generation !== "v6") state.hordeGapMm = Math.max(0, (state.hordeGapMm ?? INITIAL_HORDE_GAP_MM) - 4_000);
  state.stumbleUntilTick = state.tick + 24;
  state.contactImmunityUntilTick = state.tick + 45;
  state.lastContactHazardId = contacted.id;
}

/** The forward and lateral intervals must intersect at the same moment in this tick. */
function sweptOverlap(x0: number, x1: number, z0: number, z1: number, halfWidth: number, halfLength: number): boolean {
  const x = axisOverlapInterval(x0, x1, halfWidth);
  const z = axisOverlapInterval(z0, z1, halfLength);
  return x !== null && z !== null && Math.max(x[0], z[0]) <= Math.min(x[1], z[1]);
}

function axisOverlapInterval(start: number, end: number, radius: number): [number, number] | null {
  const delta = end - start;
  if (delta === 0) return Math.abs(start) <= radius ? [0, 1] : null;
  const a = (-radius - start) / delta;
  const b = (radius - start) / delta;
  const entry = Math.max(0, Math.min(a, b));
  const exit = Math.min(1, Math.max(a, b));
  return entry <= exit ? [entry, exit] : null;
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
    const overlapsForward = state.distanceMm + PLAYER_HALF_LENGTH_MM >= hazard.centerMm - hazard.halfLengthMm && previousDistanceMm - PLAYER_HALF_LENGTH_MM <= hazard.centerMm + hazard.halfLengthMm;
    const startDelta = previousXmm - hazardXmm;
    const endDelta = state.xMm - hazardXmm;
    const expandedHalfWidth = PLAYER_HALF_WIDTH_MM + hazardHalfWidthMm;
    return overlapsForward && Math.min(startDelta, endDelta) <= expandedHalfWidth && Math.max(startDelta, endDelta) >= -expandedHalfWidth && (hazard.kind !== "LOW" || !isJumpClear(state));
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
