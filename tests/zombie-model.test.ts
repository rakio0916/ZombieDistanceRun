import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { animateZombie, makeZombie, ZOMBIE_VISUAL_RELEASE_ID } from "../app/zombie-model.ts";

test("urban decayed zombie keeps its threatening silhouette inside the gameplay footprint", () => {
  const zombie = makeZombie(THREE, 0, false);
  zombie.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(zombie);
  const size = bounds.getSize(new THREE.Vector3());
  assert.equal(zombie.userData.zombieVisualRelease, ZOMBIE_VISUAL_RELEASE_ID);
  assert.ok(bounds.min.y >= -0.02, `feet should stay on the road: ${bounds.min.y}`);
  assert.ok(size.x <= 0.94, `zombie width should stay within the 940mm collider: ${size.x}`);
  assert.ok(size.z <= 0.9, `zombie depth should stay within the 900mm collider: ${size.z}`);
  assert.ok(size.y >= 1.85 && size.y <= 2.05, `zombie height should remain human-readable: ${size.y}`);
});

test("urban decayed zombie exposes the approved face and clothing cues", () => {
  const dark = makeZombie(THREE, 0, false);
  const rust = makeZombie(THREE, 1, false);
  const names = new Set<string>();
  let triangleCount = 0;
  dark.traverse((child) => {
    names.add(child.name);
    if (!("isMesh" in child) || !child.isMesh) return;
    const geometry = child.geometry as THREE.BufferGeometry;
    triangleCount += geometry.index ? geometry.index.count / 3 : geometry.getAttribute("position").count / 3;
  });
  for (const required of [
    "ZombieEyeSocketL",
    "ZombieEyeSocketR",
    "ZombieBrokenJaw",
    "ZombieCollapsedNose",
    "ZombieMouth",
    "ZombieTooth0",
    "ZombieCheekDecay",
    "ZombieTornTorso",
    "ZombieArmLClaw0",
  ]) {
    assert.ok(names.has(required), `missing approved horror cue: ${required}`);
  }
  assert.ok(triangleCount <= 12_000, `triangle budget exceeded: ${triangleCount}`);
  const darkClothes = findMaterialColor(dark, "ZombieClothes");
  const rustClothes = findMaterialColor(rust, "ZombieClothes");
  assert.notEqual(darkClothes, rustClothes);
});

test("threat animation changes pose without root translation", () => {
  const zombie = makeZombie(THREE, 0, false);
  const before = zombie.position.clone();
  const head = zombie.userData.head as THREE.Object3D;
  const arm = zombie.userData.leftArm as THREE.Object3D;
  const headBefore = head.rotation.y;
  const armBefore = arm.rotation.x;
  animateZombie(zombie, 0.7);
  assert.deepEqual(zombie.position.toArray(), before.toArray());
  assert.notEqual(head.rotation.y, headBefore);
  assert.notEqual(arm.rotation.x, armBefore);
});

function findMaterialColor(root: THREE.Object3D, materialName: string) {
  let color = -1;
  root.traverse((child) => {
    if (color >= 0 || !("isMesh" in child) || !child.isMesh) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    const material = materials.find((candidate) => candidate.name === materialName) as THREE.MeshStandardMaterial | undefined;
    if (material) color = material.color.getHex();
  });
  return color;
}
