import assert from "node:assert/strict";
import test from "node:test";
import { decodeContinuousInputs, encodeContinuousInputs, parseFinishPayload } from "../lib/game-api.ts";

test("continuous input encoding survives an exact server round trip", () => {
  const inputs = [
    { targetXmm: -2400, jump: false, sprint: false },
    { targetXmm: 730, jump: true, sprint: false },
    { targetXmm: 2400, jump: false, sprint: true },
  ];
  const encoded = encodeContinuousInputs(inputs);
  assert.deepEqual(decodeContinuousInputs(encoded, inputs.length), inputs);
  assert.equal(decodeContinuousInputs(encoded, inputs.length + 1), null);
});

test("continuous finish rejects malformed and out-of-range inputs", () => {
  const valid = {
    schema_version: "2.0.0",
    submission_id: "123e4567-e89b-42d3-a456-426614174000",
    final_tick: 1,
    terminal_reason: "CAUGHT",
    input_b64: encodeContinuousInputs([{ targetXmm: 0, jump: false, sprint: false }]),
  };
  assert.ok(parseFinishPayload(valid));
  assert.equal(parseFinishPayload({ ...valid, final_tick: 2 }), null);
  assert.equal(parseFinishPayload({ ...valid, input_b64: "////" }), null);
  assert.equal(parseFinishPayload({ ...valid, extra: true }), null);
});
