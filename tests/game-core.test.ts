import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceGameState,
  advanceContinuousGameState,
  advanceDifficultyGameState,
  createGameState,
  getDifficultyHazardsInRange,
  getHazardsInRange,
  HAZARD_LOOKAHEAD_MM,
  SAFE_START_MM,
  type GameEvent,
  type GameState,
  type GeneratedHazard,
} from "../lib/game-core.ts";

test("the first 80m has no collidable hazards", () => {
  assert.deepEqual(getHazardsInRange(1234, 0, SAFE_START_MM - 1), []);
});

test("a sliding 60m window never contains more than four zombies", () => {
  for (let start = 0; start < 5_000_000; start += 1_000) {
    const zombies = getHazardsInRange(88231, start, start + HAZARD_LOOKAHEAD_MM)
      .filter((hazard) => hazard.kind === "ZOMBIE");
    assert.ok(zombies.length <= 4, `${start}mm window contained ${zombies.length}`);
  }
});

test("lane movement reaches an adjacent lane in 12 ticks", () => {
  let state = createGameState();
  const event: GameEvent = { seq: 0, tick: 0, action: "LANE_LEFT" };
  for (let tick = 0; tick < 12; tick += 1) {
    state = advanceGameState(state, 42, tick === 0 ? [event] : []);
  }
  assert.equal(state.lane, 0);
  assert.equal(state.lanePositionMilli, 0);
});

test("visible zombie contact reduces gap even during a jump", () => {
  const seed = 42;
  const zombie = getHazardsInRange(seed, SAFE_START_MM, 200_000)
    .find((hazard) => hazard.kind === "ZOMBIE");
  assert.ok(zombie);
  const state = stateAtHazardEntry(createGameState(), zombie, 100);
  state.jumpStartTick = 90;
  state.jumpUntilTick = 114;
  const next = advanceGameState(state, seed, []);
  assert.equal(next.lastContactHazardId, zombie.id);
  assert.ok(next.hordeGapMm < state.hordeGapMm - 3_900);
});

test("a low obstacle is cleared only during the effective jump phase", () => {
  const found = findHazard("LOW");
  const state = stateAtHazardEntry(createGameState(), found.hazard, 100);
  state.jumpStartTick = 90;
  state.jumpUntilTick = 114;
  const next = advanceGameState(state, found.seed, []);
  assert.equal(next.lastContactHazardId, null);
  assert.ok(next.hordeGapMm >= state.hordeGapMm);
});

test("hazard generation is deterministic", () => {
  assert.deepEqual(
    getHazardsInRange(20260918, 80_000, 800_000),
    getHazardsInRange(20260918, 80_000, 800_000),
  );
});

test("continuous movement reaches any target and stops there", () => {
  let state = createGameState();
  for (let tick = 0; tick < 4; tick += 1) {
    state = advanceContinuousGameState(state, 42, { targetXmm: 730, jump: false, boost: false });
  }
  assert.equal(state.xMm, 730);
  state = advanceContinuousGameState(state, 42, { targetXmm: 730, jump: false, boost: false });
  assert.equal(state.xMm, 730);
});

test("continuous collision detects lateral entry while overlapping a hazard", () => {
  const seed = 42;
  const zombie = getHazardsInRange(seed, SAFE_START_MM, 200_000).find((hazard) => hazard.kind === "ZOMBIE");
  assert.ok(zombie);
  const hazardX = (zombie.lane - 1) * 2_400;
  const state = {
    ...createGameState(),
    tick: 100,
    xMm: hazardX - 1_100,
    targetXmm: hazardX - 900,
    distanceMm: zombie.centerMm,
    hordeGapMm: 12_000,
  };
  const next = advanceContinuousGameState(state, seed, { targetXmm: hazardX - 900, jump: false, boost: false });
  assert.equal(next.lastContactHazardId, zombie.id);
  assert.equal(next.stamina, 75);
});

test("four effective collisions exhaust stamina and end the run", () => {
  const seed = 42;
  const zombie = getHazardsInRange(seed, SAFE_START_MM, 200_000).find((hazard) => hazard.kind === "ZOMBIE");
  assert.ok(zombie);
  let state = createGameState();
  for (let index = 0; index < 4; index += 1) {
    state = { ...state, tick: 100 + index * 50, xMm: (zombie.lane - 1) * 2_400, targetXmm: (zombie.lane - 1) * 2_400, distanceMm: zombie.centerMm, hordeGapMm: 12_000, contactImmunityUntilTick: 0 };
    state = advanceContinuousGameState(state, seed, { targetXmm: state.xMm, jump: false, boost: false });
  }
  assert.equal(state.stamina, 0);
  assert.equal(state.terminalReason, "EXHAUSTED");
});

test("boost costs ten stamina once and lasts sixty ticks", () => {
  let state = createGameState();
  state = advanceContinuousGameState(state, 42, { targetXmm: 0, jump: false, boost: true });
  assert.equal(state.stamina, 90);
  assert.ok(state.boostUntilTick > state.tick);
  state = advanceContinuousGameState(state, 42, { targetXmm: 0, jump: false, boost: true });
  assert.equal(state.stamina, 90);
  state = { ...state, tick: 60, boostUntilTick: 60 };
  state = advanceContinuousGameState(state, 42, { targetXmm: 0, jump: false, boost: true });
  assert.equal(state.stamina, 90);
  assert.equal(state.boostCooldownUntilTick, 120);
});

test("difficulty changes only the forward speed", () => {
  const input = { targetXmm: 0, jump: false };
  const beginner = advanceDifficultyGameState(createGameState(), 42, input, "beginner");
  const intermediate = advanceDifficultyGameState(createGameState(), 42, input, "intermediate");
  const advanced = advanceDifficultyGameState(createGameState(), 42, input, "advanced");
  assert.equal(beginner.distanceMm, 184);
  assert.equal(intermediate.distanceMm, 216);
  assert.equal(advanced.distanceMm, 260);
  assert.equal(beginner.stamina, 100);
  assert.equal(intermediate.stamina, 100);
  assert.equal(advanced.stamina, 100);
});

test("difficulty catalog uses the enlarged low obstacle footprint", () => {
  const found = findHazard("LOW");
  const legacy = getHazardsInRange(found.seed, SAFE_START_MM, 300_000)
    .find((item) => item.id === found.hazard.id);
  const difficulty = getDifficultyHazardsInRange(found.seed, SAFE_START_MM, 300_000)
    .find((item) => item.id === found.hazard.id);
  assert.equal(legacy?.halfLengthMm, 550);
  assert.equal(difficulty?.halfLengthMm, 400);
});

function stateAtHazardEntry(state: GameState, hazard: GeneratedHazard, tick: number): GameState {
  return {
    ...state,
    tick,
    lane: hazard.lane,
    lanePositionMilli: hazard.lane * 1_000,
    distanceMm: hazard.centerMm - hazard.halfLengthMm - 501,
    hordeGapMm: 12_000,
  };
}

function findHazard(kind: GeneratedHazard["kind"]): { seed: number; hazard: GeneratedHazard } {
  for (let seed = 0; seed < 1_000; seed += 1) {
    const hazard = getHazardsInRange(seed, SAFE_START_MM, 300_000).find((item) => item.kind === kind);
    if (hazard) return { seed, hazard };
  }
  throw new Error(`No ${kind} hazard found`);
}
