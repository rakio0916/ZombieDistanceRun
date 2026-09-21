import assert from "node:assert/strict";
import test from "node:test";
import {
  blendCharacterWeights,
  getJumpPhase,
  isJumpPoseActive,
  jumpClipTime,
  jumpRootHeight,
  selectCharacterClip,
  terminalLandingHeight,
  visibleFrameDelta,
} from "../lib/character-animation.ts";

test("jump pose ends at the grounded phase 24 boundary", () => {
  assert.equal(getJumpPhase(123, 100), 23);
  assert.equal(isJumpPoseActive(23), true);
  assert.equal(isJumpPoseActive(24), false);
  assert.equal(isJumpPoseActive(25), false);
  assert.ok(jumpRootHeight(23) > 0);
  assert.equal(jumpRootHeight(24), 0);
  assert.equal(jumpClipTime(0.8, 24), 0.8);
});

test("a new jump identity remains active even if phase 24 was not rendered", () => {
  const oldPhase = getJumpPhase(123, 100);
  const newPhase = getJumpPhase(125, 124);
  assert.equal(oldPhase, 23);
  assert.equal(newPhase, 1);
  assert.equal(isJumpPoseActive(newPhase), true);
  assert.equal(jumpClipTime(0.8, newPhase), 0.8 / 24);
});

test("terminal and stumble states keep priority over the jump pose", () => {
  const base = { tick: 10, jumpStartTick: 5, running: true };
  assert.equal(selectCharacterClip({ ...base, terminalReason: "EXHAUSTED", stumbleUntilTick: 0 }), "Web_Caught");
  assert.equal(selectCharacterClip({ ...base, terminalReason: null, stumbleUntilTick: 20 }), "Web_Stumble");
  assert.equal(selectCharacterClip({ ...base, terminalReason: null, stumbleUntilTick: 0 }), "Web_Jump");
});

test("terminal landing reaches ground without changing the Core phase", () => {
  assert.equal(terminalLandingHeight(0.92, 0), 0.92);
  assert.equal(terminalLandingHeight(0.92, 0.05), 0.46);
  assert.equal(terminalLandingHeight(0.92, 0.1), 0);
  assert.equal(terminalLandingHeight(0.92, 2), 0);
});

test("visible animation time includes 15fps deltas and excludes hidden gaps", () => {
  assert.ok(Math.abs(visibleFrameDelta(1_000, 1_066.667, true) - 0.066667) < 1e-9);
  assert.equal(visibleFrameDelta(1_000, 8_000, false), 0);
  assert.equal(visibleFrameDelta(null, 8_000, true), 0);
  assert.equal(visibleFrameDelta(1_000, 1_500, true), 0.5);
});

test("interrupted character fades keep total pose weight and current contribution", () => {
  const first = blendCharacterWeights([1, 0, 0], 1, 0.4);
  assert.deepEqual(first, [0.6, 0.4, 0]);
  const interrupted = blendCharacterWeights(first, 2, 0);
  assert.deepEqual(interrupted, first);
  const mid = blendCharacterWeights(first, 2, 0.5);
  assert.ok(Math.abs(mid.reduce((sum, weight) => sum + weight, 0) - 1) < 1e-10);
  assert.deepEqual(blendCharacterWeights(first, 2, 1), [0, 0, 1]);
});
