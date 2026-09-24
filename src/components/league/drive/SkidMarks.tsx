"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { CarApi } from "./Car";

// Tire marks: a 256-slot ring of flat instanced quads, laid under the rear
// wheels while they slip. The oldest mark is reused first.

const SLOTS = 256;
const SLIP = 0.15;
const STEP = 1.6; // city units between marks

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(0.8, 1, 2.2);
const _flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
const _hidden = new THREE.Matrix4().makeScale(0, 0, 0);

export default function SkidMarks({ car }: { car: React.MutableRefObject<CarApi | null> }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const next = useRef(0);
  const last = useRef([new THREE.Vector3(Infinity, 0, 0), new THREE.Vector3(Infinity, 0, 0)]);
  const geo = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  useEffect(() => () => geo.dispose(), [geo]);

  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    for (let i = 0; i < SLOTS; i++) mesh.setMatrixAt(i, _hidden);
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  useFrame(() => {
    const c = car.current;
    const mesh = ref.current;
    if (!c || !mesh || c.state.slip < SLIP) return;
    let changed = false;
    for (let k = 0; k < 2; k++) {
      const i = 2 + k; // rear wheels
      const wheel = c.wheels[i];
      if (!wheel || !c.controller.wheelIsInContact(i)) continue;
      wheel.getWorldPosition(_p);
      _p.y = 0.15 + next.current * 0.0004; // later marks sit a hair higher: no z-fighting
      if (_p.distanceTo(last.current[k]) < STEP) continue;
      last.current[k].copy(_p);
      _q.copy(c.group.quaternion).multiply(_flat);
      mesh.setMatrixAt(next.current, _m.compose(_p, _q, _s));
      next.current = (next.current + 1) % SLOTS;
      changed = true;
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
