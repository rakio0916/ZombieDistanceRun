import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceGameState,
  createGameState,
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
