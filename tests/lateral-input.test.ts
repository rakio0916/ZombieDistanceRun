import assert from "node:assert/strict";
import test from "node:test";
import { advanceLateralDrag, beginLateralDrag, isJumpTap } from "../lib/lateral-input.ts";

test("lateral drag keeps the tap dead zone out of the target", () => {
  const start = beginLateralDrag(7, 100, 200, 0, 1_000);
  const withinDeadZone = advanceLateralDrag(start, 108, 200, 280, 2_400);
  assert.equal(withinDeadZone.targetXmm, null);

  const firstDrag = advanceLateralDrag(withinDeadZone.drag, 109, 200, 4_800, 2_400);
  assert.equal(firstDrag.drag.moved, true);
  assert.equal(firstDrag.targetXmm, 0);

  const accumulated = advanceLateralDrag(firstDrag.drag, 114, 200, 4_800, 2_400);
  assert.equal(accumulated.targetXmm, 10);
});

test("lateral drag discards edge overshoot so reversal responds immediately", () => {
  const start = beginLateralDrag(7, 0, 0, 0, 1_000);
  const atRightEdge = advanceLateralDrag(start, 200, 0, 280, 2_400);
  assert.equal(atRightEdge.targetXmm, 2_400);

  const reverse = advanceLateralDrag(atRightEdge.drag, 190, 0, 280, 2_400);
  assert.ok(reverse.targetXmm !== null && reverse.targetXmm < 2_400);
});

test("a short tap with vertical finger wobble queues a jump without lateral motion", () => {
  const start = beginLateralDrag(7, 100, 200, 0, 1_000);
  const wobble = advanceLateralDrag(start, 105, 214, 280, 2_400);
  assert.equal(wobble.drag.moved, false);
  assert.equal(wobble.targetXmm, null);
  assert.equal(isJumpTap(wobble.drag, 105, 214, 1_260), true);
});

test("horizontal drags and long or distant touches cannot become jumps", () => {
  const start = beginLateralDrag(7, 100, 200, 0, 1_000);
  const horizontal = advanceLateralDrag(start, 112, 202, 280, 2_400);
  assert.equal(horizontal.drag.moved, true);
  assert.equal(isJumpTap(horizontal.drag, 112, 202, 1_100), false);
  assert.equal(isJumpTap(start, 100, 200, 1_301), false);
  assert.equal(isJumpTap(start, 100, 221, 1_100), false);
});
