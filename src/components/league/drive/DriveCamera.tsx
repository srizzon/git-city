"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { DriveCameraMode } from "@/lib/league-city/drive/telemetry";
import { BOOST, CAMERA, M_TO_UNIT, STEER } from "@/lib/league-city/drive/tuning";
import type { CarApi } from "./Car";

// Chase camera: springs behind the car with a little lag, widens the FOV
// with speed and boost, shakes on hard turns and impacts (never under
// "reduce motion"). Top-down: high above, following. On enter it eases from
// wherever the orbit camera was.

const ENTER = 1.4; // seconds of the ease from the orbit camera

const _fwd = new THREE.Vector3();
const _want = new THREE.Vector3();
const _look = new THREE.Vector3();
const _pos = new THREE.Vector3();
const _aim = new THREE.Vector3();

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function DriveCamera({
  mode,
  car,
  impact,
}: {
  mode: DriveCameraMode;
  car: React.MutableRefObject<CarApi | null>;
  /** Latest hit strength (0…1) and when it happened (performance.now ms). */
  impact: React.MutableRefObject<{ strength: number; at: number }>;
}) {
  const get = useThree((s) => s.get);
  const start = useRef<{ pos: THREE.Vector3; look: THREE.Vector3; fov: number } | null>(null);
  const t = useRef(0);
  const spring = useRef({ pos: new THREE.Vector3(), look: new THREE.Vector3(), ready: false });
  const calm = useRef(reducedMotion());

  useEffect(() => {
    const camera = get().camera as THREE.PerspectiveCamera;
    const dir = camera.getWorldDirection(new THREE.Vector3());
    start.current = { pos: camera.position.clone(), look: camera.position.clone().addScaledVector(dir, 200), fov: camera.fov };
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => (calm.current = mq.matches);
    mq.addEventListener("change", on);
    const fov = camera.fov;
    return () => {
      mq.removeEventListener("change", on);
      camera.fov = fov;
      camera.updateProjectionMatrix();
    };
  }, [get]);

  useFrame((three, dt) => {
    const camera = three.camera as THREE.PerspectiveCamera;
    const c = car.current;
    const s0 = start.current;
    if (!c || !s0) return;
    const g = c.group;
    const st = c.state;

    // Heading only: the camera doesn't roll or pitch with the car.
    _fwd.set(0, 0, 1).applyQuaternion(g.quaternion);
    _fwd.y = 0;
    if (_fwd.lengthSq() < 1e-4) _fwd.set(0, 0, 1);
    _fwd.normalize();

    if (mode === "chase") {
      _want.copy(g.position).addScaledVector(_fwd, -CAMERA.distance * M_TO_UNIT);
      _want.y = g.position.y + CAMERA.height * M_TO_UNIT;
      _look.copy(g.position).addScaledVector(_fwd, 6);
      _look.y += 3;
    } else {
      _want.copy(g.position).addScaledVector(_fwd, -10);
      _want.y = g.position.y + CAMERA.topDownHeight * M_TO_UNIT;
      _look.copy(g.position);
    }

    const sp = spring.current;
    if (!sp.ready) {
      sp.pos.copy(_want);
      sp.look.copy(_look);
      sp.ready = true;
    }
    const k = 1 - Math.exp(-CAMERA.follow * dt);
    sp.pos.lerp(_want, k);
    sp.look.lerp(_look, Math.min(1, k * 2));

    // Ease in from the orbit camera.
    t.current = Math.min(1, t.current + dt / ENTER);
    const e = t.current < 0.5 ? 4 * t.current ** 3 : 1 - (-2 * t.current + 2) ** 3 / 2;
    _pos.lerpVectors(s0.pos, sp.pos, e);
    _aim.lerpVectors(s0.look, sp.look, e);

    // Shake: hard turns at speed, and hits.
    if (!calm.current && mode === "chase") {
      const turn = Math.min(1, Math.max(0, st.slip - 0.2)) * Math.min(1, Math.abs(st.speed) / STEER.topSpeed);
      const since = (performance.now() - impact.current.at) / 1000;
      const hit = since < 0.4 ? impact.current.strength * (1 - since / 0.4) : 0;
      const amp = turn * 0.25 + hit * 1.6;
      if (amp > 0.01) {
        const tt = performance.now() / 1000;
        _pos.x += Math.sin(tt * 47) * amp;
        _pos.y += Math.sin(tt * 61 + 1) * amp * 0.6;
        _pos.z += Math.sin(tt * 53 + 2) * amp;
      }
    }

    camera.position.copy(_pos);
    camera.lookAt(_aim);

    // FOV widens with speed and boost.
    const speedT = Math.min(1, Math.abs(st.speed) / BOOST.topSpeed);
    const target = mode === "chase" ? CAMERA.fov + (CAMERA.fovBoost - CAMERA.fov) * (st.boosting ? 1 : speedT * 0.5) : CAMERA.fov;
    const fov = THREE.MathUtils.lerp(s0.fov, THREE.MathUtils.lerp(camera.fov, target, 1 - Math.exp(-4 * dt)), e);
    if (Math.abs(fov - camera.fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  });

  return null;
}
