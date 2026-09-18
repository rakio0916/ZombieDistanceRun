"use client";

import { useEffect, useRef } from "react";
import type { AnimationAction, Group, Mesh, Object3D } from "three";
import { getHazardsInRange, type GameState, type GeneratedHazard } from "@/lib/game-core";

type Phase = "ready" | "running" | "saving" | "ended";
type CharacterStatus = "loading" | "ready" | "error";

const CHARACTER_URL = "/game/characters/runner_001/v4/CH_runner_001_Web_v4.glb";
const REQUIRED_CLIPS = ["Web_Idle", "Run_03", "Web_Jump", "Web_Stumble", "Web_Caught"] as const;

export function GameScene({
  game,
  seed,
  phase,
  onCharacterStatus,
  onTargetX,
}: {
  game: GameState;
  seed: number;
  phase: Phase;
  onCharacterStatus: (status: CharacterStatus) => void;
  onTargetX: (targetXmm: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef(game);
  const seedRef = useRef(seed);
  const phaseRef = useRef(phase);
  const gestureRef = useRef<{ pointerId: number; startX: number; originXmm: number } | null>(null);

  useEffect(() => {
    gameRef.current = game;
    seedRef.current = seed;
    phaseRef.current = phase;
  }, [game, seed, phase]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let cleanup = () => {};

    void (async () => {
      const THREE = await import("three");
      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
      if (disposed) return;

      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x151b29);
      scene.fog = new THREE.FogExp2(0x38404c, 0.018);

      const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 150);
      camera.position.set(0, 2.55, 4.45);
      camera.lookAt(0, 1.05, -10);

      scene.add(new THREE.HemisphereLight(0xb8c7df, 0x191921, 2.15));
      const sunset = new THREE.DirectionalLight(0xffb071, 4.8);
      sunset.position.set(-7, 9, 4);
      sunset.castShadow = true;
      sunset.shadow.mapSize.set(1024, 1024);
      sunset.shadow.camera.left = -10;
      sunset.shadow.camera.right = 10;
      sunset.shadow.camera.top = 18;
      sunset.shadow.camera.bottom = -4;
      scene.add(sunset);
      const coolFill = new THREE.DirectionalLight(0x718bc4, 1.7);
      coolFill.position.set(6, 4, -12);
      scene.add(coolFill);

      const world = new THREE.Group();
      scene.add(world);
      addRuinedCity(THREE, world);

      const playerRoot = new THREE.Group();
      scene.add(playerRoot);
      let mixer: import("three").AnimationMixer | null = null;
      const actions = new Map<string, AnimationAction>();
      let activeAction: AnimationAction | null = null;
      let activeClip = "";

      onCharacterStatus("loading");
      new GLTFLoader().load(
        CHARACTER_URL,
        (gltf) => {
          if (disposed) return;
          const missing = REQUIRED_CLIPS.filter((name) => !gltf.animations.some((clip) => clip.name === name));
          if (missing.length > 0) {
            onCharacterStatus("error");
            return;
          }
          const model = gltf.scene;
          normalizeModel(THREE, model);
          model.traverse((child) => {
            if ("isMesh" in child && child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });
          playerRoot.add(model);
          mixer = new THREE.AnimationMixer(model);
          for (const clip of gltf.animations) {
            if (!REQUIRED_CLIPS.includes(clip.name as (typeof REQUIRED_CLIPS)[number])) continue;
            const action = mixer.clipAction(clip);
            if (clip.name === "Web_Jump" || clip.name === "Web_Stumble" || clip.name === "Web_Caught") {
              action.setLoop(THREE.LoopOnce, 1);
              action.clampWhenFinished = true;
            }
            actions.set(clip.name, action);
          }
          onCharacterStatus("ready");
        },
        undefined,
        () => onCharacterStatus("error"),
      );

      const hazardMeshes = new Map<string, Group>();
      const rearLeft = makeZombie(THREE, 0, true);
      const rearRight = makeZombie(THREE, 1, true);
      rearLeft.position.set(-1.75, -0.22, 2.05);
      rearRight.position.set(1.75, -0.22, 2.05);
      rearLeft.rotation.y = Math.PI;
      rearRight.rotation.y = Math.PI;
      scene.add(rearLeft, rearRight);
      setGroupOpacity(rearLeft, 0);
      setGroupOpacity(rearRight, 0);

      const clock = new THREE.Clock();
      let animationFrame = 0;
      let lastWidth = 0;
      let lastHeight = 0;

      let activeJumpStartTick = -1;
      const changeAnimation = (name: string, jumpStartTick: number) => {
        if (name === activeClip && (name !== "Web_Jump" || jumpStartTick === activeJumpStartTick)) return;
        const next = actions.get(name);
        if (!next) return;
        const fade = name === "Web_Caught" ? 0.15 : name === "Web_Stumble" ? 0.08 : 0.1;
        activeAction?.fadeOut(fade);
        next.reset().setEffectiveWeight(1).fadeIn(fade).play();
        activeAction = next;
        activeClip = name;
        activeJumpStartTick = name === "Web_Jump" ? jumpStartTick : -1;
      };

      const draw = () => {
        if (disposed) return;
        const rect = canvas.getBoundingClientRect();
        const width = Math.max(1, Math.floor(rect.width));
        const height = Math.max(1, Math.floor(rect.height));
        if (width !== lastWidth || height !== lastHeight) {
          renderer.setSize(width, height, false);
          camera.aspect = width / height;
          camera.fov = height > width ? 54 : 57;
          camera.updateProjectionMatrix();
          lastWidth = width;
          lastHeight = height;
        }

        const current = gameRef.current;
        const delta = Math.min(clock.getDelta(), 0.05);
        const elapsed = clock.elapsedTime;
        const jumping = current.jumpStartTick >= 0 && current.tick - current.jumpStartTick <= 24;
        const stumbling = current.stumbleUntilTick > current.tick;
        const desiredClip = current.terminalReason === "CAUGHT"
          ? "Web_Caught"
          : stumbling
            ? "Web_Stumble"
            : jumping
              ? "Web_Jump"
              : phaseRef.current === "running"
                ? "Run_03"
                : "Web_Idle";
        changeAnimation(desiredClip, current.jumpStartTick);
        mixer?.update(delta);
        if (desiredClip === "Web_Jump" && activeAction) {
          const phase = Math.max(0, Math.min(24, current.tick - current.jumpStartTick));
          activeAction.time = (phase / 24) * activeAction.getClip().duration;
        }

        const laneX = current.xMm / 1_000;
        playerRoot.position.x = laneX;
        const jumpPhase = current.jumpStartTick < 0 ? -1 : current.tick - current.jumpStartTick;
        playerRoot.position.y = jumpPhase >= 0 && jumpPhase <= 24
          ? Math.sin((jumpPhase / 24) * Math.PI) * 0.92
          : 0;
        playerRoot.rotation.z += ((stumbling ? -0.22 : (laneX - playerRoot.position.x) * -0.08) - playerRoot.rotation.z) * 0.2;

        camera.position.x += (playerRoot.position.x * 0.12 - camera.position.x) * 0.06;
        camera.lookAt(playerRoot.position.x * 0.08, 1.05, -10);
        world.position.z = (current.distanceMm / 1_000) % 40;
        syncHazards(THREE, scene, hazardMeshes, seedRef.current, current.distanceMm, elapsed);
        syncRearHorde(rearLeft, rearRight, current.hordeGapMm, elapsed);

        renderer.render(scene, camera);
        animationFrame = window.requestAnimationFrame(draw);
      };
      draw();

      cleanup = () => {
        window.cancelAnimationFrame(animationFrame);
        mixer?.stopAllAction();
        for (const mesh of hazardMeshes.values()) disposeObject(mesh);
        disposeObject(world);
        disposeObject(playerRoot);
        disposeObject(rearLeft);
        disposeObject(rearRight);
        renderer.dispose();
      };
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, [onCharacterStatus]);

  return (
    <canvas
      ref={canvasRef}
      className="zdr-canvas"
      aria-label="人物3Dが荒廃した市街地で前方ゾンビの隙間を走り抜けるゲーム画面"
      onPointerDown={(event) => {
        if (gestureRef.current) return;
        gestureRef.current = { pointerId: event.pointerId, startX: event.clientX, originXmm: gameRef.current.xMm };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const gesture = gestureRef.current;
        if (!gesture || gesture.pointerId !== event.pointerId) return;
        const travelPx = Math.max(120, Math.min(event.currentTarget.clientWidth, event.currentTarget.clientHeight) * 0.7);
        onTargetX(gesture.originXmm + ((event.clientX - gesture.startX) / travelPx) * 4_800);
      }}
      onPointerUp={(event) => { if (gestureRef.current?.pointerId === event.pointerId) { onTargetX(gameRef.current.xMm); gestureRef.current = null; } }}
      onPointerCancel={(event) => { if (gestureRef.current?.pointerId === event.pointerId) { onTargetX(gameRef.current.xMm); gestureRef.current = null; } }}
      onLostPointerCapture={() => { onTargetX(gameRef.current.xMm); gestureRef.current = null; }}
    />
  );
}

function addRuinedCity(THREE: typeof import("three"), world: Group) {
  const roadMaterial = new THREE.MeshStandardMaterial({ color: 0x303541, roughness: 0.98, metalness: 0.02 });
  const road = new THREE.Mesh(new THREE.PlaneGeometry(9, 230), roadMaterial);
  road.rotation.x = -Math.PI / 2;
  road.position.z = -92;
  road.receiveShadow = true;
  world.add(road);

  const sidewalkMaterial = new THREE.MeshStandardMaterial({ color: 0x59575a, roughness: 1 });
  for (const x of [-5.5, 5.5]) {
    const sidewalk = new THREE.Mesh(new THREE.BoxGeometry(2, 0.18, 230), sidewalkMaterial);
    sidewalk.position.set(x, 0.02, -92);
    sidewalk.receiveShadow = true;
    world.add(sidewalk);
  }

  const stripeMaterial = new THREE.MeshStandardMaterial({ color: 0xb7b0a4, roughness: 0.95 });
  const stripeGeometry = new THREE.BoxGeometry(0.07, 0.018, 2.6);
  const stripes = new THREE.InstancedMesh(stripeGeometry, stripeMaterial, 80);
  const matrix = new THREE.Matrix4();
  let stripeIndex = 0;
  for (const x of [-1.2, 1.2]) {
    for (let z = 4; z > -196; z -= 5) {
      matrix.makeTranslation(x, 0.02, z);
      stripes.setMatrixAt(stripeIndex, matrix);
      stripeIndex += 1;
    }
  }
  stripes.count = stripeIndex;
  stripes.receiveShadow = true;
  world.add(stripes);

  const facadeMaterials = [
    new THREE.MeshStandardMaterial({ color: 0x343640, roughness: 0.92 }),
    new THREE.MeshStandardMaterial({ color: 0x48434a, roughness: 0.96 }),
    new THREE.MeshStandardMaterial({ color: 0x303740, roughness: 0.9 }),
  ];
  const windowMaterial = new THREE.MeshStandardMaterial({ color: 0x101824, roughness: 0.45, metalness: 0.12 });
  const rubbleMaterial = new THREE.MeshStandardMaterial({ color: 0x57555a, roughness: 1 });

  for (let segment = 0; segment < 5; segment += 1) {
    const baseZ = -segment * 40;
    for (const side of [-1, 1]) {
      for (let index = 0; index < 3; index += 1) {
        const height = 8 + ((segment * 3 + index * 2 + (side > 0 ? 1 : 0)) % 5) * 1.5;
        const width = 4.2 + (index % 2) * 1.4;
        const building = new THREE.Mesh(
          new THREE.BoxGeometry(width, height, 8.5),
          facadeMaterials[(segment + index + (side > 0 ? 1 : 0)) % facadeMaterials.length],
        );
        building.position.set(side * (7.2 + index * 0.35), height / 2 - 0.08, baseZ - 5 - index * 11.5);
        building.castShadow = true;
        building.receiveShadow = true;
        world.add(building);

        for (let floor = 1; floor < Math.floor(height / 2); floor += 1) {
          const window = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.58, 0.72), windowMaterial);
          window.position.set(building.position.x - side * (width / 2 + 0.006), floor * 1.8, building.position.z);
          window.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
          world.add(window);
        }
      }
    }
  }

  const rubbleGeometry = new THREE.DodecahedronGeometry(0.18, 0);
  const rubble = new THREE.InstancedMesh(rubbleGeometry, rubbleMaterial, 90);
  for (let index = 0; index < 90; index += 1) {
    const side = index % 2 === 0 ? -1 : 1;
    const x = side * (3.9 + ((index * 7) % 18) / 10);
    const z = 2 - ((index * 23) % 198);
    const scale = 0.45 + ((index * 11) % 8) / 10;
    matrix.compose(
      new THREE.Vector3(x, 0.08, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(index * 0.31, index * 0.17, index * 0.23)),
      new THREE.Vector3(scale, scale * 0.55, scale),
    );
    rubble.setMatrixAt(index, matrix);
  }
  rubble.castShadow = true;
  rubble.receiveShadow = true;
  world.add(rubble);

  for (let segment = 0; segment < 5; segment += 1) {
    addWreckedCar(THREE, world, segment % 2 === 0 ? -4.6 : 4.6, -18 - segment * 40, segment);
    for (const side of [-1, 1]) addStreetLamp(THREE, world, side * 4.35, -8 - segment * 40, side);
    const roadside = makeZombie(THREE, segment % 2, false);
    roadside.scale.setScalar(0.82);
    roadside.position.set(segment % 2 === 0 ? -5.1 : 5.1, 0.15, -30 - segment * 40);
    roadside.rotation.y = segment % 2 === 0 ? -1.2 : 1.2;
    world.add(roadside);
  }
}

function addWreckedCar(THREE: typeof import("three"), parent: Group, x: number, z: number, variant: number) {
  const car = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: variant % 2 ? 0x4d5960 : 0x6b403d, roughness: 0.78, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x121820, roughness: 0.35, metalness: 0.15 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.58, 3.4), bodyMaterial);
  body.position.y = 0.55;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.58, 1.65), dark);
  cabin.position.set(0, 1.04, -0.15);
  car.add(body, cabin);
  for (const wheelX of [-0.96, 0.96]) {
    for (const wheelZ of [-1.08, 1.08]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.18, 12), dark);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wheelX, 0.34, wheelZ);
      car.add(wheel);
    }
  }
  car.position.set(x, 0, z);
  car.rotation.y = (variant % 3 - 1) * 0.18;
  car.rotation.z = variant % 2 ? 0.035 : -0.04;
  car.traverse((child) => { if ("isMesh" in child && child.isMesh) { child.castShadow = true; child.receiveShadow = true; } });
  parent.add(car);
}

function addStreetLamp(THREE: typeof import("three"), parent: Group, x: number, z: number, side: number) {
  const material = new THREE.MeshStandardMaterial({ color: 0x292d33, roughness: 0.7, metalness: 0.55 });
  const group = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.08, 5.3, 8), material);
  pole.position.y = 2.65;
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.15, 8), material);
  arm.rotation.z = Math.PI / 2;
  arm.position.set(-side * 0.5, 5.15, 0);
  group.add(pole, arm);
  group.position.set(x, 0, z);
  group.rotation.z = side * 0.018;
  parent.add(group);
}

function makeZombie(THREE: typeof import("three"), variant: number, transparent: boolean): Group {
  const group = new THREE.Group();
  group.userData.phase = variant * 1.7;
  const skin = new THREE.MeshStandardMaterial({ color: variant % 2 ? 0x7f8571 : 0x737f78, roughness: 0.96, transparent });
  const clothes = new THREE.MeshStandardMaterial({ color: variant % 2 ? 0x4a3c3c : 0x384551, roughness: 1, transparent });
  const dark = new THREE.MeshStandardMaterial({ color: 0x25282c, roughness: 0.96, transparent });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.62, 4, 10), clothes);
  torso.position.y = 1.12;
  torso.rotation.z = variant % 2 ? 0.08 : -0.06;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.255, 14, 10), skin);
  head.scale.set(0.9, 1.06, 0.9);
  head.position.set(variant % 2 ? 0.05 : -0.04, 1.82, 0);
  head.rotation.z = variant % 2 ? 0.2 : -0.18;
  const leftArm = makeLimb(THREE, skin, 0.13, 0.88);
  const rightArm = makeLimb(THREE, skin, 0.13, 0.88);
  leftArm.position.set(-0.43, 1.3, -0.24);
  rightArm.position.set(0.43, 1.3, -0.24);
  leftArm.rotation.x = 1.02;
  rightArm.rotation.x = 0.84;
  leftArm.rotation.z = -0.28;
  rightArm.rotation.z = 0.24;
  const leftLeg = makeLimb(THREE, dark, 0.16, 0.92);
  const rightLeg = makeLimb(THREE, dark, 0.16, 0.92);
  leftLeg.position.set(-0.19, 0.46, 0);
  rightLeg.position.set(0.19, 0.46, 0.05);
  leftLeg.rotation.z = 0.04;
  rightLeg.rotation.z = -0.08;
  group.add(torso, head, leftArm, rightArm, leftLeg, rightLeg);
  group.userData.leftArm = leftArm;
  group.userData.rightArm = rightArm;
  group.userData.head = head;
  group.traverse((child) => { if ("isMesh" in child && child.isMesh) { child.castShadow = true; child.receiveShadow = true; } });
  return group;
}

function makeLimb(THREE: typeof import("three"), material: import("three").Material, radius: number, length: number) {
  return new THREE.Mesh(new THREE.CapsuleGeometry(radius, length - radius * 2, 4, 8), material);
}

function makeHazard(THREE: typeof import("three"), hazard: GeneratedHazard): Group {
  if (hazard.kind === "ZOMBIE") return makeZombie(THREE, hazard.lane + hazard.centerMm / 72_000, false);
  const group = new THREE.Group();
  if (hazard.kind === "SOLID") {
    addWreckedCar(THREE, group, 0, 0, Math.floor(hazard.centerMm / 72_000));
  } else {
    const concrete = new THREE.MeshStandardMaterial({ color: 0x9c978d, roughness: 0.98 });
    const stripe = new THREE.MeshStandardMaterial({ color: 0xb85842, roughness: 0.92 });
    const barrier = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.52, 0.5), concrete);
    barrier.position.y = 0.28;
    const marker = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.12, 0.515), stripe);
    marker.position.set(0, 0.33, 0);
    group.add(barrier, marker);
  }
  group.traverse((child) => { if ("isMesh" in child && child.isMesh) { child.castShadow = true; child.receiveShadow = true; } });
  return group;
}

function syncHazards(
  THREE: typeof import("three"),
  scene: import("three").Scene,
  meshes: Map<string, Group>,
  seed: number,
  distanceMm: number,
  elapsed: number,
) {
  const hazards = getHazardsInRange(seed, distanceMm - 3_000, distanceMm + 60_000);
  const visibleIds = new Set(hazards.map((hazard) => hazard.id));
  for (const hazard of hazards) {
    let mesh = meshes.get(hazard.id);
    if (!mesh) {
      mesh = makeHazard(THREE, hazard);
      meshes.set(hazard.id, mesh);
      scene.add(mesh);
    }
    mesh.position.set((hazard.lane - 1) * 2.4, 0, -(hazard.centerMm - distanceMm) / 1_000);
    if (hazard.kind === "ZOMBIE") animateZombie(mesh, elapsed);
  }
  for (const [id, mesh] of meshes) {
    if (!visibleIds.has(id)) {
      scene.remove(mesh);
      disposeObject(mesh);
      meshes.delete(id);
    }
  }
}

function animateZombie(group: Group, elapsed: number) {
  const phase = Number(group.userData.phase ?? 0);
  const leftArm = group.userData.leftArm as Object3D | undefined;
  const rightArm = group.userData.rightArm as Object3D | undefined;
  const head = group.userData.head as Object3D | undefined;
  const sway = Math.sin(elapsed * 2.1 + phase);
  group.rotation.z = sway * 0.035;
  if (leftArm) leftArm.rotation.x = 0.92 + sway * 0.16;
  if (rightArm) rightArm.rotation.x = 0.86 - sway * 0.14;
  if (head) head.rotation.y = sway * 0.14;
}

function syncRearHorde(left: Group, right: Group, gapMm: number, elapsed: number) {
  const proximity = Math.max(0, Math.min(1, (6_000 - gapMm) / 6_000));
  const opacity = proximity < 0.04 ? 0 : Math.min(0.86, proximity * 1.1);
  setGroupOpacity(left, opacity);
  setGroupOpacity(right, opacity);
  left.position.z = 2.6 - proximity * 0.8;
  right.position.z = 2.65 - proximity * 0.82;
  left.position.y = -0.36 + proximity * 0.28;
  right.position.y = -0.36 + proximity * 0.28;
  animateZombie(left, elapsed);
  animateZombie(right, elapsed + 0.8);
}

function setGroupOpacity(group: Group, opacity: number) {
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

function normalizeModel(THREE: typeof import("three"), model: Object3D) {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const scale = size.y > 0 ? 1.82 / size.y : 1;
  model.scale.setScalar(scale);
  const normalized = new THREE.Box3().setFromObject(model);
  const center = normalized.getCenter(new THREE.Vector3());
  model.position.set(-center.x, -normalized.min.y, -center.z);
  model.rotation.y = Math.PI;
}

function disposeObject(root: Object3D) {
  root.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) material?.dispose();
  });
}
