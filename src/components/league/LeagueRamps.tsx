"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { rotToRadians } from "@/lib/league-city/grid";
import { rampCorners } from "@/lib/league-city/ramp";
import type { CityObject } from "@/lib/league-city/types";

// Ramps: one instanced procedural wedge, orange deck with darker sides.

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _one = new THREE.Vector3(1, 1, 1);
const _up = new THREE.Vector3(0, 1, 0);

export function rampGeometry(): THREE.BufferGeometry {
  const [a, b, c, d, e, f] = rampCorners();
  // Deck (quad c-d-e-f), back face (a-b-f-e), two side triangles, bottom.
  const tris = [
    d, c, f, d, f, e, // deck
    b, a, e, b, e, f, // back wall
    a, d, e, // west side
    c, b, f, // east side
    a, b, c, a, c, d, // bottom
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(tris.flat(), 3));
  // Deck is orange, walls and bottom darker (vertex colors, 6 deck vertices first).
  const deck = new THREE.Color("#e08a2e");
  const wall = new THREE.Color("#7a4a2a");
  const colors: number[] = [];
  for (let i = 0; i < tris.length; i++) colors.push(...(i < 6 ? deck : wall).toArray());
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

export default function LeagueRamps({ objects }: { objects: CityObject[] }) {
  const ramps = useMemo(() => objects.filter((o) => o.item_type === "ramp" && o.px !== null && o.pz !== null), [objects]);
  const geo = useMemo(() => rampGeometry(), []);
  useEffect(() => () => geo.dispose(), [geo]);
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    ramps.forEach((o, i) => {
      _q.setFromAxisAngle(_up, rotToRadians(o.rot));
      _p.set(o.px!, 0, o.pz!);
      mesh.setMatrixAt(i, _m.compose(_p, _q, _one));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [ramps]);
  if (ramps.length === 0) return null;
  return (
    <instancedMesh key={ramps.length} ref={ref} args={[geo, undefined, ramps.length]}>
      <meshStandardMaterial vertexColors roughness={0.8} emissive="#3a2008" emissiveIntensity={0.4} />
    </instancedMesh>
  );
}
