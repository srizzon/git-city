"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { CityBuilding } from "@/lib/github";

// You honked at a building: a light shell around it blinks three times.

const DURATION = 1.2;

export default function HonkFlash({ building, at }: { building: CityBuilding; at: number }) {
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const mesh = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const m = mat.current;
    const g = mesh.current;
    if (!m || !g) return;
    const t = (performance.now() - at) / 1000;
    g.visible = t < DURATION;
    // Three blinks, fading out.
    m.opacity = t < DURATION ? Math.max(0, Math.sin((t / DURATION) * Math.PI * 6)) * 0.35 * (1 - t / DURATION) : 0;
  });
  const [x, , z] = building.position;
  return (
    <mesh ref={mesh} position={[x, building.height / 2, z]}>
      <boxGeometry args={[building.width + 3, building.height + 3, building.depth + 3]} />
      <meshBasicMaterial ref={mat} color="#fff6b0" transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
    </mesh>
  );
}
