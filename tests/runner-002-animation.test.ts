import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

type Accessor = { bufferView: number; byteOffset?: number; componentType: number; count: number; type: string };
type BufferView = { byteOffset?: number; byteLength: number; byteStride?: number };
type Animation = {
  name: string;
  channels: { sampler: number; target: { node: number; path: string } }[];
  samplers: { input: number; output: number; interpolation?: string }[];
};
type Document = {
  accessors: Accessor[];
  bufferViews: BufferView[];
  nodes: { name: string }[];
  animations: Animation[];
};

const assetUrl = new URL("../public/game/characters/runner_002/v6/CH_runner_002_Web_v6.glb", import.meta.url);
const manifestUrl = new URL("../public/game/characters/runner_002/v6/CH_runner_002_Web_v6.asset.json", import.meta.url);
const glb = readFileSync(assetUrl);
const manifest = JSON.parse(readFileSync(manifestUrl, "utf8")) as {
  release_status: string;
  web_glb: { sha256: string; size_bytes: number };
};
assert.equal(glb.toString("ascii", 0, 4), "glTF");
const jsonLength = glb.readUInt32LE(12);
const document = JSON.parse(glb.toString("utf8", 20, 20 + jsonLength)) as Document;
const binStart = 20 + jsonLength + 8;

function samples(index: number): number[][] {
  const accessor = document.accessors[index];
  const view = document.bufferViews[accessor.bufferView];
  const componentCounts: Record<string, number> = { SCALAR: 1, VEC3: 3, VEC4: 4 };
  const components = componentCounts[accessor.type];
  assert.equal(accessor.componentType, 5126);
  assert.ok(components);
  const stride = view.byteStride ?? components * 4;
  const start = binStart + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  return Array.from({ length: accessor.count }, (_, row) =>
    Array.from({ length: components }, (_, col) => glb.readFloatLE(start + row * stride + col * 4)));
}

function changes(values: number[][], path: string): boolean {
  const initial = values[0];
  return values.slice(1).some((value) => {
    if (path === "rotation") {
      const dot = Math.abs(initial.reduce((sum, item, index) => sum + item * value[index], 0));
      return dot < 1 - 1e-6;
    }
    return value.some((item, index) => Math.abs(item - initial[index]) > 1e-4);
  });
}

function movingNodes(clipName: string): string[] {
  const clip = document.animations.find((item) => item.name === clipName);
  assert.ok(clip, `Missing ${clipName}`);
  return clip.channels.flatMap((channel) => {
    const sampler = clip.samplers[channel.sampler];
    const times = samples(sampler.input).map((item) => item[0]);
    assert.ok(times.length > 1 && times.every((time, index) => index === 0 || time >= times[index - 1]));
    return changes(samples(sampler.output), channel.target.path)
      ? [document.nodes[channel.target.node].name]
      : [];
  });
}

test("runner_002 v6 is a new draft with an exact asset hash", () => {
  assert.equal(manifest.release_status, "draft");
  assert.equal(manifest.web_glb.size_bytes, glb.length);
  assert.equal(manifest.web_glb.sha256, createHash("sha256").update(glb).digest("hex"));
  assert.deepEqual(new Set(document.animations.map((clip) => clip.name)),
    new Set(["Web_Idle", "Run_03", "Web_Jump", "Web_Stumble", "Web_Caught"]));
});

test("runner_002 v6 runs with moving arms and legs", () => {
  const moving = new Set(movingNodes("Run_03"));
  for (const name of ["LeftUpperLeg", "RightUpperLeg", "LeftLowerLeg", "RightLowerLeg",
    "LeftUpperArm", "RightUpperArm", "LeftLowerArm", "RightLowerArm"]) {
    assert.ok(moving.has(name), `Run does not move ${name}`);
  }
});

test("runner_002 v6 keeps movement in all five clips", () => {
  for (const clip of ["Web_Idle", "Web_Jump", "Web_Stumble", "Web_Caught"]) {
    assert.ok(movingNodes(clip).length > 0, `${clip} is static`);
  }
});
