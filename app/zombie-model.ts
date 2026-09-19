import type { Group, Mesh, Object3D } from "three";

export const ZOMBIE_VISUAL_RELEASE_ID = "zdr-urban-decayed-v1";

type ZombiePart = Object3D & { rotation: { x: number; y: number; z: number } };

export function makeZombie(THREE: typeof import("three"), variantSeed: number, transparent: boolean): Group {
  const variant = Math.abs(Math.trunc(variantSeed)) % 2;
  const group = new THREE.Group();
  group.name = `UrbanDecayedZombie_${variant === 0 ? "Dark" : "Rust"}`;
  group.userData.zombieVisualRelease = ZOMBIE_VISUAL_RELEASE_ID;
  group.userData.phase = variantSeed * 1.7;
  group.userData.baseTilt = variant === 0 ? -0.045 : 0.055;
  const visualRoot = new THREE.Group();
  visualRoot.name = "ZombieVisualRoot";
  visualRoot.position.y = 0.205;
  visualRoot.scale.set(0.78, 0.84, 0.9);

  const skin = new THREE.MeshStandardMaterial({
    name: "ZombieSkin",
    color: variant === 0 ? 0x68705f : 0x77715f,
    roughness: 0.98,
    metalness: 0,
    transparent,
  });
  const decay = new THREE.MeshStandardMaterial({
    name: "ZombieDecay",
    color: variant === 0 ? 0x394238 : 0x4a4035,
    roughness: 1,
    transparent,
  });
  const clothes = new THREE.MeshStandardMaterial({
    name: "ZombieClothes",
    color: variant === 0 ? 0x24282c : 0x64362e,
    roughness: 1,
    transparent,
  });
  const trousers = new THREE.MeshStandardMaterial({
    name: "ZombieTrousers",
    color: variant === 0 ? 0x202326 : 0x292727,
    roughness: 1,
    transparent,
  });
  const socket = new THREE.MeshStandardMaterial({
    name: "ZombieEyeSocket",
    color: 0x090b0c,
    roughness: 1,
    transparent,
  });
  const eye = new THREE.MeshStandardMaterial({
    name: "ZombieEyeGlint",
    color: 0xb45a20,
    emissive: 0x5c2108,
    emissiveIntensity: 0.9,
    roughness: 0.62,
    transparent,
  });
  const teeth = new THREE.MeshStandardMaterial({
    name: "ZombieTeeth",
    color: 0xb9aa82,
    roughness: 0.92,
    transparent,
  });

  const torsoRoot = new THREE.Group();
  torsoRoot.name = "ZombieTorsoRoot";
  torsoRoot.position.y = 1.1;
  torsoRoot.rotation.z = variant === 0 ? -0.055 : 0.07;
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.58, 3, 8), clothes);
  torso.name = "ZombieTornTorso";
  torso.scale.set(1.03, 1, 0.78);
  torsoRoot.add(torso);
  const chestHole = new THREE.Mesh(new THREE.CircleGeometry(0.105, 8), socket);
  chestHole.name = "ZombieChestHole";
  chestHole.position.set(variant === 0 ? 0.11 : -0.1, 0.04, 0.257);
  chestHole.scale.set(0.72, 1.18, 1);
  torsoRoot.add(chestHole);
  addRaggedHem(THREE, torsoRoot, clothes, variant);

  const headRoot = new THREE.Group();
  headRoot.name = "ZombieHeadRoot";
  headRoot.position.set(variant === 0 ? -0.035 : 0.045, 1.79, 0.02);
  headRoot.rotation.z = variant === 0 ? -0.16 : 0.19;
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.245, 2), skin);
  head.name = "ZombieSkull";
  head.scale.set(0.9, 1.05, 0.86);
  headRoot.add(head);

  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.275, 0.135, 0.16), skin);
  jaw.name = "ZombieBrokenJaw";
  jaw.position.set(variant === 0 ? 0.018 : -0.015, -0.145, 0.085);
  jaw.rotation.z = variant === 0 ? -0.09 : 0.075;
  headRoot.add(jaw);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.12, 4), decay);
  nose.name = "ZombieCollapsedNose";
  nose.position.set(0, -0.02, 0.225);
  nose.rotation.x = Math.PI / 2;
  nose.rotation.z = Math.PI / 4;
  headRoot.add(nose);

  const leftSocket = makeFaceDisc(THREE, socket, 0.073, 0.052, "ZombieEyeSocketL");
  const rightSocket = makeFaceDisc(THREE, socket, 0.073, 0.052, "ZombieEyeSocketR");
  leftSocket.position.set(-0.078, 0.046, 0.205);
  rightSocket.position.set(0.078, 0.046, 0.205);
  headRoot.add(leftSocket, rightSocket);
  const leftBrow = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.035, 0.032), socket);
  const rightBrow = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.035, 0.032), socket);
  leftBrow.name = "ZombieBrowL";
  rightBrow.name = "ZombieBrowR";
  leftBrow.position.set(-0.073, 0.112, 0.217);
  rightBrow.position.set(0.073, 0.112, 0.217);
  leftBrow.rotation.z = -0.2;
  rightBrow.rotation.z = 0.2;
  headRoot.add(leftBrow, rightBrow);
  const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.021, 7, 5), eye);
  const rightEye = new THREE.Mesh(new THREE.SphereGeometry(0.021, 7, 5), eye);
  leftEye.name = "ZombieEyeGlintL";
  rightEye.name = "ZombieEyeGlintR";
  leftEye.position.set(-0.078, 0.04, 0.238);
  rightEye.position.set(0.078, 0.04, 0.238);
  headRoot.add(leftEye, rightEye);

  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.165, 0.065, 0.024), socket);
  mouth.name = "ZombieMouth";
  mouth.position.set(0.016, -0.095, 0.218);
  mouth.rotation.z = variant === 0 ? -0.08 : 0.07;
  headRoot.add(mouth);
  for (let index = 0; index < 4; index += 1) {
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.022, index % 2 ? 0.032 : 0.026, 0.018), teeth);
    tooth.name = `ZombieTooth${index}`;
    tooth.position.set(-0.055 + index * 0.038, index % 2 ? -0.081 : -0.11, 0.236);
    tooth.rotation.z = (index - 1.5) * 0.05;
    headRoot.add(tooth);
  }
  const templeDecay = makeFaceDisc(THREE, decay, 0.052, 0.032, "ZombieTempleDecay");
  templeDecay.position.set(variant === 0 ? -0.15 : 0.15, 0.105, 0.16);
  const cheekDecay = makeFaceDisc(THREE, decay, 0.062, 0.042, "ZombieCheekDecay");
  cheekDecay.position.set(variant === 0 ? 0.13 : -0.13, -0.052, 0.18);
  cheekDecay.rotation.z = variant === 0 ? -0.28 : 0.28;
  headRoot.add(templeDecay, cheekDecay);

  const leftArm = makeBentArm(THREE, -1, skin, decay, variant);
  const rightArm = makeBentArm(THREE, 1, skin, decay, variant + 1);
  leftArm.position.set(-0.335, 1.42, 0.015);
  rightArm.position.set(0.335, 1.42, 0.015);
  leftArm.rotation.z = -0.17;
  rightArm.rotation.z = 0.19;
  leftArm.rotation.x = -0.38;
  rightArm.rotation.x = -0.28;

  const leftLeg = makeLeg(THREE, -1, trousers, decay, variant);
  const rightLeg = makeLeg(THREE, 1, trousers, decay, variant + 1);
  leftLeg.position.set(-0.17, 0.78, variant === 0 ? -0.03 : 0.04);
  rightLeg.position.set(0.17, 0.78, variant === 0 ? 0.05 : -0.02);
  leftLeg.rotation.z = -0.035;
  rightLeg.rotation.z = 0.055;
  leftLeg.rotation.x = variant === 0 ? -0.08 : 0.04;
  rightLeg.rotation.x = variant === 0 ? 0.05 : -0.07;

  visualRoot.add(torsoRoot, headRoot, leftArm, rightArm, leftLeg, rightLeg);
  group.add(visualRoot);
  group.userData.leftArm = leftArm;
  group.userData.rightArm = rightArm;
  group.userData.head = headRoot;
  group.userData.torso = torsoRoot;
  group.userData.leftLeg = leftLeg;
  group.userData.rightLeg = rightLeg;
  group.traverse((child) => {
    if (!("isMesh" in child) || !child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
  });
  return group;
}

function makeFaceDisc(
  THREE: typeof import("three"),
  material: import("three").Material,
  width: number,
  height: number,
  name: string,
) {
  const disc = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), material);
  disc.name = name;
  disc.scale.set(width, height, 0.018);
  return disc;
}

function addRaggedHem(
  THREE: typeof import("three"),
  parent: Group,
  material: import("three").Material,
  variant: number,
) {
  const positions = [-0.24, -0.12, 0, 0.12, 0.24];
  positions.forEach((x, index) => {
    const length = 0.13 + ((index + variant) % 3) * 0.045;
    const flap = new THREE.Mesh(new THREE.ConeGeometry(0.075, length, 3), material);
    flap.name = `ZombieRag${index}`;
    flap.position.set(x, -0.48 - length * 0.28, 0.01 + (index % 2) * 0.025);
    flap.rotation.z = (index - 2) * 0.08;
    parent.add(flap);
  });
}

function makeBentArm(
  THREE: typeof import("three"),
  side: -1 | 1,
  skin: import("three").Material,
  decay: import("three").Material,
  variant: number,
) {
  const root = new THREE.Group();
  root.name = side < 0 ? "ZombieArmL" : "ZombieArmR";
  const upper = makeCapsule(THREE, skin, 0.09, 0.4, 7);
  upper.name = `${root.name}Upper`;
  upper.position.y = -0.2;
  const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.095, 8, 6), decay);
  elbow.name = `${root.name}ElbowDecay`;
  elbow.position.y = -0.41;
  const forearmRoot = new THREE.Group();
  forearmRoot.position.y = -0.4;
  forearmRoot.rotation.x = -0.55 - (variant % 2) * 0.12;
  forearmRoot.rotation.z = side * 0.07;
  const forearm = makeCapsule(THREE, skin, 0.077, 0.36, 7);
  forearm.name = `${root.name}Forearm`;
  forearm.position.y = -0.18;
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.088, 8, 6), skin);
  hand.name = `${root.name}Hand`;
  hand.scale.set(0.8, 1.15, 0.7);
  hand.position.y = -0.39;
  forearmRoot.add(forearm, hand);
  for (let index = 0; index < 3; index += 1) {
    const finger = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.16 + index * 0.012, 5), decay);
    finger.name = `${root.name}Claw${index}`;
    finger.position.set((index - 1) * 0.035, -0.49 - index * 0.006, 0.035 + index * 0.014);
    finger.rotation.z = (index - 1) * 0.08;
    forearmRoot.add(finger);
  }
  root.add(upper, elbow, forearmRoot);
  return root;
}

function makeLeg(
  THREE: typeof import("three"),
  side: -1 | 1,
  trousers: import("three").Material,
  skin: import("three").Material,
  variant: number,
) {
  const root = new THREE.Group();
  root.name = side < 0 ? "ZombieLegL" : "ZombieLegR";
  const leg = makeCapsule(THREE, trousers, 0.135, 0.76, 7);
  leg.name = `${root.name}Trouser`;
  leg.position.y = -0.38;
  const ankle = makeCapsule(THREE, skin, 0.095, 0.25, 7);
  ankle.name = `${root.name}Ankle`;
  ankle.position.set(0, -0.79, variant % 2 ? 0.025 : -0.02);
  const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.13, 0.35), trousers);
  shoe.name = `${root.name}Shoe`;
  shoe.position.set(0, -0.94, 0.075);
  shoe.rotation.y = side * 0.035;
  root.add(leg, ankle, shoe);
  return root;
}

function makeCapsule(
  THREE: typeof import("three"),
  material: import("three").Material,
  radius: number,
  length: number,
  segments: number,
) {
  return new THREE.Mesh(new THREE.CapsuleGeometry(radius, Math.max(0.01, length - radius * 2), 3, segments), material);
}

export function animateZombie(group: Group, elapsed: number) {
  const phase = Number(group.userData.phase ?? 0);
  const baseTilt = Number(group.userData.baseTilt ?? 0);
  const sway = Math.sin(elapsed * 2.05 + phase);
  const gait = Math.sin(elapsed * 2.05 + phase + Math.PI / 2);
  group.rotation.z = baseTilt + sway * 0.028;
  const leftArm = group.userData.leftArm as ZombiePart | undefined;
  const rightArm = group.userData.rightArm as ZombiePart | undefined;
  const head = group.userData.head as ZombiePart | undefined;
  const torso = group.userData.torso as ZombiePart | undefined;
  const leftLeg = group.userData.leftLeg as ZombiePart | undefined;
  const rightLeg = group.userData.rightLeg as ZombiePart | undefined;
  if (leftArm) leftArm.rotation.x = -0.38 + sway * 0.13;
  if (rightArm) rightArm.rotation.x = -0.28 - sway * 0.11;
  if (head) head.rotation.y = sway * 0.17;
  if (torso) torso.rotation.y = sway * 0.045;
  if (leftLeg) leftLeg.rotation.x += (gait * 0.04 - leftLeg.rotation.x) * 0.08;
  if (rightLeg) rightLeg.rotation.x += (-gait * 0.04 - rightLeg.rotation.x) * 0.08;
}

export function setZombieOpacity(group: Group, opacity: number) {
  group.visible = opacity > 0.001;
  group.traverse((child) => {
    if (!("isMesh" in child) || !child.isMesh) return;
    const mesh = child as Mesh;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      material.transparent = true;
      material.opacity = opacity;
      material.depthWrite = opacity >= 0.98;
    }
  });
}
