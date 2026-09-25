"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import CarModel from "@/components/league/drive/CarModel";
import type { CarApi } from "@/components/league/drive/Car";
import { M_TO_UNIT, TURBO } from "@/lib/league-city/drive/tuning";
import { turboLevel } from "@/lib/league-city/drive/vehicle";
import { ghostAt, type GhostRun } from "@/lib/league-city/race/ghost";

// Your best lap as a see-through car driving its line, in step with the lap
// you're on (Trackmania's ghost). And the mini-turbo sparks under your rear
// wheels while a drift charges: blue, orange, purple.

export function Ghost({ run, lapStart, offset, show }: {
  run: React.MutableRefObject<GhostRun | null>;
  /** Server-clock ms the lap under way started, or null. */
  lapStart: () => number | null;
  offset: () => number;
  /** Read every frame: false hides it (in a race). */
  show: () => boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const wheels = useRef<(THREE.Object3D | null)[]>([]);

  // See-through: every material its own copy, so the real cars stay solid.
  useEffect(() => {
    const g = group.current;
    if (!g) return;
    const t = setInterval(() => {
      let done = false;
      g.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || m.userData.ghosted) return;
        const mat = (m.material as THREE.Material).clone();
        mat.transparent = true;
        mat.opacity = 0.38;
        mat.depthWrite = false;
        m.material = mat;
        m.userData.ghosted = true;
        done = true;
      });
      if (done) clearInterval(t);
    }, 200);
    return () => clearInterval(t);
  }, []);

  useFrame(() => {
    const g = group.current;
    const r = run.current;
    const start = lapStart();
    if (!g) return;
    const p = show() && r && start !== null ? ghostAt(r, Date.now() + offset() - start) : null;
    g.visible = !!p;
    if (!p) return;
    g.position.set(p.x * M_TO_UNIT, 0, p.z * M_TO_UNIT);
    g.rotation.set(0, p.yaw, 0);
  });

  return (
    <group ref={group} visible={false}>
      <CarModel color="#ffffff" wheelRefs={wheels} />
    </group>
  );
}

const _p = new THREE.Vector3();

export function DriftSparks({ car }: { car: React.MutableRefObject<CarApi | null> }) {
  const left = useRef<THREE.Mesh>(null);
  const right = useRef<THREE.Mesh>(null);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: TURBO.colors[1], toneMapped: false }), []);
  useEffect(() => () => mat.dispose(), [mat]);
  useFrame((three) => {
    const c = car.current;
    const level = c?.state.drifting ? turboLevel(c.state.driftCharge) : 0;
    [left.current, right.current].forEach((m, i) => {
      if (!m) return;
      m.visible = level > 0;
      const w = c?.wheels[2 + i];
      if (!w || level === 0) return;
      w.getWorldPosition(_p);
      m.position.set(_p.x, 0.6, _p.z);
      const s = 0.8 + 0.5 * Math.abs(Math.sin(three.clock.elapsedTime * 40 + i));
      m.scale.setScalar(s * (0.8 + level * 0.25));
      m.rotation.set(three.clock.elapsedTime * 9, three.clock.elapsedTime * 7, 0);
    });
    if (level > 0) mat.color.set(TURBO.colors[level]);
  });
  return (
    <>
      <mesh ref={left} visible={false} material={mat}>
        <octahedronGeometry args={[0.9, 0]} />
      </mesh>
      <mesh ref={right} visible={false} material={mat}>
        <octahedronGeometry args={[0.9, 0]} />
      </mesh>
    </>
  );
}
