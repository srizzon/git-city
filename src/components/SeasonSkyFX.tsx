"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const SKY_RADIUS = 1600;

type SeasonIndex = 0 | 1 | 2 | 3;

interface Props {
  seasonIndex: SeasonIndex;
}

interface SeasonSpec {
  count: number;
  color: string;
  size: number;
  fallSpeed: number;
}

const SEASON_SPECS: Record<SeasonIndex, SeasonSpec> = {
  0: { count: 320, color: "#ffcbe7", size: 4.5, fallSpeed: 7 },
  1: { count: 180, color: "#fff4b3", size: 3.2, fallSpeed: 2 },
  2: { count: 300, color: "#ffb45d", size: 4.2, fallSpeed: 9 },
  3: { count: 420, color: "#d7ecff", size: 3.8, fallSpeed: 12 },
};

function mulberry32(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildParticles(spec: SeasonSpec, seed: number): Float32Array {
  const rng = mulberry32(seed);
  const arr = new Float32Array(spec.count * 3);

  for (let i = 0; i < spec.count; i++) {
    const radius = SKY_RADIUS * (0.1 + rng() * 0.7);
    const theta = rng() * Math.PI * 2;
    const y = 80 + rng() * 700;

    arr[i * 3] = Math.cos(theta) * radius;
    arr[i * 3 + 1] = y;
    arr[i * 3 + 2] = Math.sin(theta) * radius;
  }

  return arr;
}

function SeasonLayer({ season, targetOpacity, seed }: { season: SeasonIndex; targetOpacity: number; seed: number }) {
  const pointsRef = useRef<THREE.Points>(null);
  const spec = SEASON_SPECS[season];
  const positions = useMemo(() => buildParticles(spec, seed), [seed, spec]);

  useFrame((_, delta) => {
    const points = pointsRef.current;
    if (!points) return;

    const attr = points.geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;

    for (let i = 0; i < arr.length; i += 3) {
      arr[i + 1] -= spec.fallSpeed * delta;
      arr[i] += Math.sin((arr[i + 2] + i) * 0.002) * delta * 4;
      if (arr[i + 1] < 20) arr[i + 1] = 700 + Math.random() * 120;
    }

    attr.needsUpdate = true;
    points.rotation.y += delta * 0.01;

    const material = points.material as THREE.PointsMaterial;
    material.opacity += (targetOpacity - material.opacity) * Math.min(1, delta * 3);
  });

  return (
    <points ref={pointsRef} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
          count={positions.length / 3}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        color={spec.color}
        size={spec.size}
        transparent
        opacity={targetOpacity}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

export default function SeasonSkyFX({ seasonIndex }: Props) {
  return (
    <group>
      <SeasonLayer season={0} seed={101} targetOpacity={seasonIndex === 0 ? 1 : 0} />
      <SeasonLayer season={1} seed={201} targetOpacity={seasonIndex === 1 ? 1 : 0} />
      <SeasonLayer season={2} seed={301} targetOpacity={seasonIndex === 2 ? 1 : 0} />
      <SeasonLayer season={3} seed={401} targetOpacity={seasonIndex === 3 ? 1 : 0} />
    </group>
  );
}
