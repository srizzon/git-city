"use client";

import { memo, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

// ─── Fireworks ──────────────────────────────────────────────
// Spread across the entire city, not just downtown

const LAUNCHER_COUNT = 12;
const PARTICLES_PER_BURST = 30;
const FIREWORK_COUNT = LAUNCHER_COUNT * PARTICLES_PER_BURST;

const FIREWORK_COLORS = [
  new THREE.Color(3, 0.4, 0.4),
  new THREE.Color(0.4, 3, 0.4),
  new THREE.Color(0.4, 0.6, 3),
  new THREE.Color(3, 3, 0.4),
  new THREE.Color(3, 0.4, 3),
  new THREE.Color(0.4, 3, 3),
  new THREE.Color(3, 2, 0.4),
  new THREE.Color(2, 0.4, 3),
];

interface LauncherState {
  phase: number;
  timer: number;
  originX: number;
  originZ: number;
  burstY: number;
  colorIndex: number;
}

function randomLauncherPos(radius: number) {
  const angle = Math.random() * Math.PI * 2;
  const r = Math.random() * radius;
  return { x: Math.cos(angle) * r, z: Math.sin(angle) * r };
}

const Fireworks = memo(function Fireworks({ cityRadius }: { cityRadius: number }) {
  const pointsRef = useRef<THREE.Points>(null);
  const frameCount = useRef(0);

  const { positions, colors, launchers, velocities } = useMemo(() => {
    const pos = new Float32Array(FIREWORK_COUNT * 3);
    const col = new Float32Array(FIREWORK_COUNT * 3);
    const vel = new Float32Array(FIREWORK_COUNT * 3);

    const ls: LauncherState[] = [];
    for (let i = 0; i < LAUNCHER_COUNT; i++) {
      const p = randomLauncherPos(cityRadius);
      ls.push({
        phase: 0,
        timer: i * 0.25,
        originX: p.x,
        originZ: p.z,
        burstY: 500 + Math.random() * 400,
        colorIndex: i % FIREWORK_COLORS.length,
      });

      for (let j = 0; j < PARTICLES_PER_BURST; j++) {
        const idx = (i * PARTICLES_PER_BURST + j) * 3;
        pos[idx] = ls[i].originX;
        pos[idx + 1] = 200;
        pos[idx + 2] = ls[i].originZ;
        col[idx] = 4;
        col[idx + 1] = 4;
        col[idx + 2] = 3;
      }
    }

    return { positions: pos, colors: col, velocities: vel, launchers: ls };
  }, [cityRadius]);

  useFrame((_, delta) => {
    if (!pointsRef.current) return;
    frameCount.current++;
    if (frameCount.current % 2 !== 0) return;

    const dt = Math.min(delta * 2, 0.1);
    const posAttr = pointsRef.current.geometry.attributes.position;
    const colAttr = pointsRef.current.geometry.attributes.color;
    const posArr = posAttr.array as Float32Array;
    const colArr = colAttr.array as Float32Array;

    for (let i = 0; i < LAUNCHER_COUNT; i++) {
      const l = launchers[i];
      l.timer += dt;
      const base = i * PARTICLES_PER_BURST;

      if (l.phase === 0) {
        const trailY = 200 + Math.min(l.timer * 300, l.burstY - 200);
        for (let p = 0; p < PARTICLES_PER_BURST; p++) {
          const idx = (base + p) * 3;
          posArr[idx] = l.originX + (Math.random() - 0.5) * 2;
          posArr[idx + 1] = trailY;
          posArr[idx + 2] = l.originZ + (Math.random() - 0.5) * 2;
          colArr[idx] = 4;
          colArr[idx + 1] = 4;
          colArr[idx + 2] = 3;
        }
        if (trailY >= l.burstY) {
          l.phase = 1;
          l.timer = 0;
          const c = FIREWORK_COLORS[l.colorIndex];
          for (let p = 0; p < PARTICLES_PER_BURST; p++) {
            const idx3 = (base + p) * 3;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const speed = 60 + Math.random() * 100;
            velocities[idx3] = Math.sin(phi) * Math.cos(theta) * speed;
            velocities[idx3 + 1] = Math.sin(phi) * Math.sin(theta) * speed;
            velocities[idx3 + 2] = Math.cos(phi) * speed;
            colArr[idx3] = c.r;
            colArr[idx3 + 1] = c.g;
            colArr[idx3 + 2] = c.b;
          }
        }
      } else if (l.phase === 1) {
        for (let p = 0; p < PARTICLES_PER_BURST; p++) {
          const idx = (base + p) * 3;
          posArr[idx] += velocities[idx] * dt;
          posArr[idx + 1] += velocities[idx + 1] * dt;
          posArr[idx + 2] += velocities[idx + 2] * dt;
          velocities[idx + 1] -= 40 * dt;
          velocities[idx] *= 0.98;
          velocities[idx + 1] *= 0.98;
          velocities[idx + 2] *= 0.98;
        }
        if (l.timer > 2.5) {
          l.phase = 2;
          l.timer = 0;
        }
      } else {
        if (l.timer > 0.3) {
          l.phase = 0;
          l.timer = 0;
          l.burstY = 500 + Math.random() * 400;
          l.colorIndex = Math.floor(Math.random() * FIREWORK_COLORS.length);
          const p = randomLauncherPos(cityRadius);
          l.originX = p.x;
          l.originZ = p.z;
          for (let j = 0; j < PARTICLES_PER_BURST; j++) {
            const idx = (base + j) * 3;
            posArr[idx] = l.originX;
            posArr[idx + 1] = 200;
            posArr[idx + 2] = l.originZ;
            colArr[idx] = 4;
            colArr[idx + 1] = 4;
            colArr[idx + 2] = 3;
          }
        } else {
          for (let p = 0; p < PARTICLES_PER_BURST; p++) {
            const idx = (base + p) * 3;
            posArr[idx + 1] -= 60 * dt;
            colArr[idx] *= 0.9;
            colArr[idx + 1] *= 0.9;
            colArr[idx + 2] *= 0.9;
          }
        }
      }
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={8}
        vertexColors
        transparent
        opacity={1}
        depthWrite={false}
        depthTest={false}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
});

// ─── Confetti ───────────────────────────────────────────────
// Follows camera so it's visible everywhere you look

const CONFETTI_COUNT = 400;
const CONFETTI_SPREAD = 500;
const CONFETTI_CEIL = 700;

const CONFETTI_COLORS = [
  new THREE.Color(1.5, 0.3, 0.3),
  new THREE.Color(0.3, 1.5, 0.3),
  new THREE.Color(0.3, 0.5, 1.5),
  new THREE.Color(1.5, 1.5, 0.3),
  new THREE.Color(1.5, 0.3, 1.5),
  new THREE.Color(0.3, 1.5, 1.5),
  new THREE.Color(1.5, 0.8, 0.3),
];

const Confetti = memo(function Confetti() {
  const pointsRef = useRef<THREE.Points>(null);
  const frameCount = useRef(0);
  const { camera } = useThree();

  const { positions, colors, driftPhases, fallSpeeds } = useMemo(() => {
    const pos = new Float32Array(CONFETTI_COUNT * 3);
    const col = new Float32Array(CONFETTI_COUNT * 3);
    const phases = new Float32Array(CONFETTI_COUNT);
    const speeds = new Float32Array(CONFETTI_COUNT);

    for (let i = 0; i < CONFETTI_COUNT; i++) {
      pos[i * 3] = (Math.random() - 0.5) * CONFETTI_SPREAD;
      pos[i * 3 + 1] = 300 + Math.random() * CONFETTI_CEIL;
      pos[i * 3 + 2] = (Math.random() - 0.5) * CONFETTI_SPREAD;
      phases[i] = Math.random() * Math.PI * 2;
      speeds[i] = 15 + Math.random() * 25;

      const c = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }

    return { positions: pos, colors: col, driftPhases: phases, fallSpeeds: speeds };
  }, []);

  useFrame((state, delta) => {
    if (!pointsRef.current) return;
    frameCount.current++;
    if (frameCount.current % 2 !== 0) return;

    const dt = Math.min(delta * 2, 0.1);
    const t = state.clock.elapsedTime;
    const posAttr = pointsRef.current.geometry.attributes.position;
    const arr = posAttr.array as Float32Array;

    const camX = camera.position.x;
    const camZ = camera.position.z;

    for (let i = 0; i < CONFETTI_COUNT; i++) {
      const idx = i * 3;
      arr[idx + 1] -= fallSpeeds[i] * dt;
      arr[idx] += Math.sin(t * 0.8 + driftPhases[i]) * 0.8;
      arr[idx + 2] += Math.cos(t * 0.6 + driftPhases[i] * 1.3) * 0.6;

      if (arr[idx + 1] < -10) {
        arr[idx] = camX + (Math.random() - 0.5) * CONFETTI_SPREAD;
        arr[idx + 1] = CONFETTI_CEIL + Math.random() * 100;
        arr[idx + 2] = camZ + (Math.random() - 0.5) * CONFETTI_SPREAD;
      }
    }

    posAttr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={5}
        vertexColors
        transparent
        opacity={0.9}
        depthWrite={false}
        depthTest={false}
        sizeAttenuation
      />
    </points>
  );
});

// ─── Combined ───────────────────────────────────────────────

export default memo(function CelebrationEffect({ cityRadius }: { cityRadius: number }) {
  return (
    <>
      <Fireworks cityRadius={cityRadius} />
      <Confetti />
    </>
  );
});
