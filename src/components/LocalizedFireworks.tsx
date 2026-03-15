"use client";

import { memo, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

// Focus the fireworks on a specific location (the winning building)
const PARTICLES_PER_BURST = 40;
const BURSTS_COUNT = 3;
const FIREWORK_COUNT = BURSTS_COUNT * PARTICLES_PER_BURST;

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

interface BurstState {
  phase: number;
  timer: number;
  burstY: number;
  colorIndex: number;
}

interface LocalizedFireworksProps {
  originX: number;
  originY: number;
  originZ: number;
}

export default memo(function LocalizedFireworks({
  originX,
  originY,
  originZ,
}: LocalizedFireworksProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const frameCount = useRef(0);

  const { positions, colors, bursts, velocities } = useMemo(() => {
    const pos = new Float32Array(FIREWORK_COUNT * 3);
    const col = new Float32Array(FIREWORK_COUNT * 3);
    const vel = new Float32Array(FIREWORK_COUNT * 3);

    const bs: BurstState[] = [];
    for (let i = 0; i < BURSTS_COUNT; i++) {
      bs.push({
        phase: 0,
        timer: i * 0.4, // Stagger launches
        burstY: originY + 50 + Math.random() * 80,
        colorIndex: i % FIREWORK_COLORS.length,
      });

      // Initialize all at origin
      for (let j = 0; j < PARTICLES_PER_BURST; j++) {
        const idx = (i * PARTICLES_PER_BURST + j) * 3;
        pos[idx] = originX;
        pos[idx + 1] = originY;
        pos[idx + 2] = originZ;
        col[idx] = 4;
        col[idx + 1] = 4;
        col[idx + 2] = 3;
      }
    }

    return { positions: pos, colors: col, velocities: vel, bursts: bs };
  }, [originX, originY, originZ]);

  useFrame((_, delta) => {
    if (!pointsRef.current) return;
    frameCount.current++;
    if (frameCount.current % 2 !== 0) return;

    const dt = Math.min(delta * 2, 0.1);
    const posAttr = pointsRef.current.geometry.attributes.position;
    const colAttr = pointsRef.current.geometry.attributes.color;
    const posArr = posAttr.array as Float32Array;
    const colArr = colAttr.array as Float32Array;

    for (let i = 0; i < BURSTS_COUNT; i++) {
      const b = bursts[i];
      b.timer += dt;
      const base = i * PARTICLES_PER_BURST;

      if (b.phase === 0) {
        // Launch phase
        const trailY = originY + Math.min(b.timer * 300, b.burstY - originY);
        for (let p = 0; p < PARTICLES_PER_BURST; p++) {
          const idx = (base + p) * 3;
          posArr[idx] = originX + (Math.random() - 0.5);
          posArr[idx + 1] = trailY;
          posArr[idx + 2] = originZ + (Math.random() - 0.5);
          colArr[idx] = 4;
          colArr[idx + 1] = 4;
          colArr[idx + 2] = 3;
        }

        if (trailY >= b.burstY) {
          // Explode
          b.phase = 1;
          b.timer = 0;
          const c = FIREWORK_COLORS[b.colorIndex];
          for (let p = 0; p < PARTICLES_PER_BURST; p++) {
            const idx3 = (base + p) * 3;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            // Compact, fast explosion
            const speed = 40 + Math.random() * 80;
            velocities[idx3] = Math.sin(phi) * Math.cos(theta) * speed;
            velocities[idx3 + 1] = Math.sin(phi) * Math.sin(theta) * speed;
            velocities[idx3 + 2] = Math.cos(phi) * speed;
            colArr[idx3] = c.r;
            colArr[idx3 + 1] = c.g;
            colArr[idx3 + 2] = c.b;
          }
        }
      } else if (b.phase === 1) {
        // Expand and fall phase
        for (let p = 0; p < PARTICLES_PER_BURST; p++) {
          const idx = (base + p) * 3;
          posArr[idx] += velocities[idx] * dt;
          posArr[idx + 1] += velocities[idx + 1] * dt;
          posArr[idx + 2] += velocities[idx + 2] * dt;
          velocities[idx + 1] -= 30 * dt; // Gravity
          velocities[idx] *= 0.96; // Drag
          velocities[idx + 1] *= 0.96;
          velocities[idx + 2] *= 0.96;

          // Fade out slightly
          colArr[idx] *= 0.98;
          colArr[idx + 1] *= 0.98;
          colArr[idx + 2] *= 0.98;
        }
        if (b.timer > 2.0) {
          b.phase = 2; // Dead/Reset phase
          b.timer = 0;
        }
      } else {
        // Resetting to launch again continuously
        if (b.timer > 0.5) {
          b.phase = 0;
          b.timer = 0;
          b.burstY = originY + 50 + Math.random() * 80;
          b.colorIndex = Math.floor(Math.random() * FIREWORK_COLORS.length);
          for (let j = 0; j < PARTICLES_PER_BURST; j++) {
            const idx = (base + j) * 3;
            posArr[idx] = originX;
            posArr[idx + 1] = originY;
            posArr[idx + 2] = originZ;
            colArr[idx] = 4;
            colArr[idx + 1] = 4;
            colArr[idx + 2] = 3;
          }
        } else {
            // keep fading the dead particles
            for (let p = 0; p < PARTICLES_PER_BURST; p++) {
                const idx = (base + p) * 3;
                colArr[idx] *= 0.8;
                colArr[idx + 1] *= 0.8;
                colArr[idx + 2] *= 0.8;
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
