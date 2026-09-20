import assert from "node:assert/strict";
import test from "node:test";
import { advanceLateralDrag, beginLateralDrag } from "../lib/lateral-input.ts";

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
