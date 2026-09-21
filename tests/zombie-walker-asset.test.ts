import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ZOMBIE_ASSET_URL, ZOMBIE_WALK_CLIPS } from "../app/zombie-asset.ts";

test("walking zombie is a self-contained skinned GLB with both actions", () => {
  const bytes = readFileSync(`public${ZOMBIE_ASSET_URL}`);
  const manifest = JSON.parse(readFileSync("assets/zombie-walker-v1.build.json", "utf8"));
  assert.equal(manifest.size_bytes, bytes.length);
  assert.equal(manifest.sha256, createHash("sha256").update(bytes).digest("hex").toUpperCase());
  assert.equal(bytes.toString("ascii", 0, 4), "glTF");
  assert.ok(bytes.length < 6_000_000, `asset too large: ${bytes.length}`);
  const jsonLength = bytes.readUInt32LE(12);
  assert.equal(bytes.toString("ascii", 16, 20), "JSON");
  const gltf = JSON.parse(bytes.toString("utf8", 20, 20 + jsonLength));
  assert.ok(gltf.skins?.length > 0);
  assert.ok(gltf.skins[0].joints.length >= 16);
  assert.ok(gltf.meshes?.length > 0);
  assert.ok(gltf.images?.length >= 4);
  assert.ok(gltf.images.every((image: { uri?: string }) => !image.uri));
  for (const clip of ZOMBIE_WALK_CLIPS) {
    const animation = gltf.animations.find((item: { name: string }) => item.name === clip);
    assert.ok(animation, `missing ${clip}`);
    assert.ok(animation.channels.length >= 10);
  }
});
