"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { FxSources } from "./fx";

// Tire marks: a 256-slot ring of flat instanced quads, laid under every car's
// rear wheels while they slip. The oldest mark is reused first.

const SLOTS = 256;
const SLIP = 0.15;
const STEP = 1.6; // city units between marks

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(0.8, 1, 2.2);
const _flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
const _hidden = new THREE.Matrix4().makeScale(0, 0, 0);

export default function SkidMarks({ sources }: { sources: FxSources }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const next = useRef(0);
  // Last mark per car and wheel, so marks are spaced along each track.
  const last = useRef(new Map<string, [THREE.Vector3, THREE.Vector3]>());
  const geo = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  useEffect(() => () => geo.dispose(), [geo]);

  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    for (let i = 0; i < SLOTS; i++) mesh.setMatrixAt(i, _hidden);
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    let changed = false;
    for (const [key, c] of sources.current) {
      if (c.slip < SLIP || !c.grounded) continue;
      let prev = last.current.get(key);
      if (!prev) {
        prev = [new THREE.Vector3(Infinity, 0, 0), new THREE.Vector3(Infinity, 0, 0)];
        last.current.set(key, prev);
      }
      for (let k = 0; k < 2; k++) {
        const wheel = c.rearWheels[k];
        if (!wheel) continue;
        wheel.getWorldPosition(_p);
        _p.y = 0.15 + next.current * 0.0004; // later marks sit a hair higher: no z-fighting
        if (_p.distanceTo(prev[k]) < STEP) continue;
        prev[k].copy(_p);
        _q.copy(c.group.quaternion).multiply(_flat);
        mesh.setMatrixAt(next.current, _m.compose(_p, _q, _s));
        next.current = (next.current + 1) % SLOTS;
        changed = true;
      }
    }
    if (changed) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  });

  return (
    <instancedMesh ref={ref} args={[geo, undefined, SLOTS]} frustumCulled={false} renderOrder={2}>
      <meshBasicMaterial color="#0a0a0c" transparent opacity={0.55} depthWrite={false} />
    </instancedMesh>
  );
}
