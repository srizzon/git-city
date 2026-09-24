"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface Props {
  width: number;
  height: number;
  depth: number;
}

// ─── League crown ────────────────────────────────────────────
// Weekly league champion overlay: a voxel crown floating above the roof,
// drawn like the raid tag (an overlay, not an item), so it never touches the
// loadout. Sits higher than crown-zone items so both can show at once.

// Crown voxels on a 5-wide grid: [x, y] cells (y up). Band + three points.
const CELLS: [number, number][] = [
  [0, 0], [1, 0], [2, 0], [3, 0], [4, 0],
  [0, 1], [1, 1], [2, 1], [3, 1], [4, 1],
  [0, 2], [2, 2], [4, 2],
  [0, 3], [2, 3], [4, 3],
  [2, 4],
];
const GEMS: [number, number][] = [[1, 1], [3, 1]];

export default function LeagueCrown3D({ width, height, depth }: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const size = Math.max(10, Math.min(width, depth) * 0.9);
  const cell = size / 5;
  const baseY = height + 18 + cell * 2;

  const gold = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#ffd24a",
        emissive: "#ffb800",
        emissiveIntensity: 1.6,
        toneMapped: false,
      }),
    [],
  );
  const gem = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#ff3b6b",
        emissive: "#ff1f55",
        emissiveIntensity: 1.8,
        toneMapped: false,
      }),
    [],
  );
  const box = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);

  useFrame(({ clock }) => {
    const g = groupRef.current;
    if (!g) return;
    const t = clock.getElapsedTime();
    g.rotation.y = t * 0.6;
    g.position.y = baseY + Math.sin(t * 1.6) * cell * 0.4;
  });

  return (
    <group ref={groupRef} position={[0, baseY, 0]}>
      {CELLS.map(([x, y]) => {
        const isGem = GEMS.some(([gx, gy]) => gx === x && gy === y);
        return (
          <mesh
            key={`${x}-${y}`}
            geometry={box}
            material={isGem ? gem : gold}
            position={[(x - 2) * cell, (y - 2) * cell, 0]}
            scale={[cell, cell, cell * 1.4]}
          />
        );
      })}
    </group>
  );
}
