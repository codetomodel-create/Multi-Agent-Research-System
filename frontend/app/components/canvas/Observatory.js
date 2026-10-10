"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";

/**
 * Observatory scene: a slow-drifting starfield, seven agent bodies whose glow
 * and orbit encode pipeline state, and the links between them.
 *
 * Rules this file obeys:
 *  - every vector, colour and matrix used per frame is allocated once at module
 *    scope, never inside useFrame;
 *  - repeated geometry is instanced (one draw call for all orbs, one for links);
 *  - geometries built with `new` are disposed in an effect cleanup; materials
 *    are declared in JSX so R3F owns their lifetime.
 */

// Layout mirrors the pipeline: coordinator, four parallel light agents, writer,
// fact-checker. `stage` maps an agent onto the backend stage that drives it.
export const AGENTS = [
  { id: "coordinator", label: "Coordinator", stage: 0, pos: [-5.2, 0.6, 0] },
  { id: "research", label: "Research", stage: 1, pos: [-1.9, 2.4, -1.1] },
  { id: "competitor", label: "Competitor", stage: 1, pos: [-1.9, 0.8, 1.3] },
  { id: "pricing", label: "Pricing", stage: 1, pos: [-1.9, -0.8, -1.3] },
  { id: "trend", label: "Trends", stage: 1, pos: [-1.9, -2.4, 1.1] },
  { id: "writer", label: "Writer", stage: 2, pos: [1.9, 0.4, 0] },
  { id: "checker", label: "Fact Checker", stage: 3, pos: [5.0, -0.2, 0] },
];

const LINKS = [
  [0, 1], [0, 2], [0, 3], [0, 4],
  [1, 5], [2, 5], [3, 5], [4, 5],
  [5, 6],
];

const STAR_COUNT = { low: 420, medium: 1100, high: 2200 };

// Scratch objects reused every frame.
const dummy = new THREE.Object3D();
const scratchColor = new THREE.Color();
const targetPos = new THREE.Vector3();
const HOME = new THREE.Vector3(0, 0.5, 13);
const ORIGIN = new THREE.Vector3(0, 0, 0);

/** Deterministic LCG — a seeded starfield renders identically across reloads. */
function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function buildStarPositions(count) {
  const random = seededRandom(0x5eed1234);
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const r = 26 + random() * 30;
    const theta = random() * Math.PI * 2;
    const phi = Math.acos(2 * random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.55;
    positions[i * 3 + 2] = r * Math.cos(phi);
  }
  return positions;
}

function orbState(agent, activeStage, status) {
  if (status === "success") return "done";
  if (status === "failed") return agent.stage <= activeStage ? "failed" : "idle";
  if (status === "cancelled") return "idle";
  if (agent.stage < activeStage) return "done";
  if (agent.stage === activeStage) return "running";
  return "queued";
}

function Starfield({ quality, animate, color }) {
  const pointsRef = useRef(null);
  const count = STAR_COUNT[quality] ?? STAR_COUNT.medium;

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(buildStarPositions(count), 3));
    return g;
  }, [count]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((_, delta) => {
    if (!animate || !pointsRef.current) return;
    pointsRef.current.rotation.y += delta * 0.008;
  });

  return (
    <points ref={pointsRef} geometry={geometry} frustumCulled={false}>
      <pointsMaterial
        color={color}
        size={0.16}
        sizeAttenuation
        transparent
        opacity={0.55}
        depthWrite={false}
      />
    </points>
  );
}

function Links({ color, animate }) {
  const materialRef = useRef(null);

  const geometry = useMemo(() => {
    const positions = new Float32Array(LINKS.length * 6);
    LINKS.forEach(([a, b], i) => {
      positions.set(AGENTS[a].pos, i * 6);
      positions.set(AGENTS[b].pos, i * 6 + 3);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return g;
  }, []);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((state) => {
    if (!animate || !materialRef.current) return;
    materialRef.current.opacity = 0.24 + Math.sin(state.clock.elapsedTime * 1.6) * 0.12;
  });

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial ref={materialRef} color={color} transparent opacity={0.3} depthWrite={false} />
    </lineSegments>
  );
}

function Constellation({ activeStage, status, tokens, animate, onPick, quality }) {
  const meshRef = useRef(null);
  const rippleRef = useRef({ index: -1, t: 0 });
  const phases = useMemo(() => AGENTS.map((_, i) => i * 0.9), []);
  const segments = quality === "low" ? 12 : quality === "medium" ? 20 : 32;

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    // Instance colours only change with run state, so they are written here
    // rather than on every frame.
    AGENTS.forEach((agent, i) => {
      const state = orbState(agent, activeStage, status);
      const hex =
        state === "done" ? tokens.accent
          : state === "running" ? tokens.primary
            : state === "failed" ? tokens.danger
              : tokens.dim;
      scratchColor.set(hex);
      mesh.setColorAt(i, scratchColor);
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [activeStage, status, tokens]);

  useFrame((state, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const t = animate ? state.clock.elapsedTime : 0;
    const ripple = rippleRef.current;
    if (ripple.index >= 0) {
      ripple.t = Math.max(0, ripple.t - delta * 2.2);
      if (ripple.t === 0) ripple.index = -1;
    }

    for (let i = 0; i < AGENTS.length; i += 1) {
      const agent = AGENTS[i];
      const s = orbState(agent, activeStage, status);
      const [x, y, z] = agent.pos;

      // Idle drift keeps the scene alive without moving anything meaningfully.
      const drift = animate ? Math.sin(t * 0.55 + phases[i]) * 0.09 : 0;
      const pulse = animate && s === "running" ? 1 + Math.sin(t * 3.2 + phases[i]) * 0.14 : 1;
      const ripplePop = ripple.index === i ? 1 + ripple.t * 0.35 : 1;
      const base = s === "queued" ? 0.34 : 0.46;

      dummy.position.set(x, y + drift, z);
      dummy.scale.setScalar(base * pulse * ripplePop);
      dummy.rotation.y = t * 0.2;
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  const handleClick = (event) => {
    event.stopPropagation();
    const index = event.instanceId;
    if (index == null) return;
    rippleRef.current = { index, t: 1 };
    onPick?.(AGENTS[index]);
  };

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, AGENTS.length]}
      onClick={handleClick}
      frustumCulled={false}
    >
      <sphereGeometry args={[1, segments, segments]} />
      <meshStandardMaterial roughness={0.28} metalness={0.1} toneMapped={false} />
    </instancedMesh>
  );
}

function CameraRig({ animate, tourStep }) {
  const { camera, invalidate } = useThree();

  useEffect(() => {
    camera.position.copy(HOME);
    camera.lookAt(ORIGIN);
    invalidate();
  }, [camera, invalidate]);

  useFrame((state, delta) => {
    // The tour parks the camera beside the named agent; otherwise it breathes
    // gently around its home position.
    if (tourStep >= 0 && tourStep < AGENTS.length) {
      const [x, y, z] = AGENTS[tourStep].pos;
      targetPos.set(x * 0.75, y * 0.6 + 1.1, z + 7.4);
    } else if (animate) {
      const t = state.clock.elapsedTime;
      targetPos.set(Math.sin(t * 0.12) * 1.15, 0.5 + Math.sin(t * 0.17) * 0.42, 13);
    } else {
      targetPos.copy(HOME);
    }

    camera.position.lerp(targetPos, Math.min(1, delta * (tourStep >= 0 ? 2.4 : 0.9)));
    camera.lookAt(ORIGIN);
  });

  return null;
}

export default function Observatory({
  activeStage = -1,
  status = "idle",
  tokens,
  animate = true,
  quality = "medium",
  tourStep = -1,
  onPick,
}) {
  return (
    <>
      <color attach="background" args={[tokens.bg]} />
      <fog attach="fog" args={[tokens.bg, 16, 44]} />

      <ambientLight intensity={0.55} />
      <pointLight position={[6, 5, 8]} intensity={45} distance={40} color={tokens.primary} />
      <pointLight position={[-7, -4, 5]} intensity={30} distance={38} color={tokens.secondary} />

      <Starfield quality={quality} animate={animate} color={tokens.star} />
      <Links color={status === "success" ? tokens.accent : tokens.primary} animate={animate} />
      <Constellation
        activeStage={activeStage}
        status={status}
        tokens={tokens}
        animate={animate}
        quality={quality}
        onPick={onPick}
      />
      <CameraRig animate={animate} tourStep={tourStep} />
    </>
  );
}
