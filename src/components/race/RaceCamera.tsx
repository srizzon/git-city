"use client";

import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { CarApi } from "@/components/league/drive/Car";
import { M_TO_UNIT } from "@/lib/league-city/drive/tuning";
import { carHeading } from "@/lib/league-city/drive/vehicle";

// The race track's camera, after Art of Rally: high up behind the car at
// about 50°, so the next corner is on screen before you reach it. It turns
// with the car slowly (a quick flick of the wheel doesn't swing the world)
// and looks further ahead the faster you go. "close" is a lower chase view.

export type RaceCameraMode = "high" | "close";

const VIEWS: Record<RaceCameraMode, { back: number; up: number; ahead: number; fov: number }> = {
  high: { back: 18, up: 23, ahead: 9, fov: 50 },
  close: { back: 9, up: 4.2, ahead: 8, fov: 62 },
};
/** How fast the camera turns toward the car's heading (1/s), and follows its position. */
const TURN = 2.2;
const FOLLOW = 7;
/** Extra look-ahead per m/s of speed (s). */
const LEAD = 0.45;

const _pos = new THREE.Vector3();
const _look = new THREE.Vector3();

export default function RaceCamera({ mode, car }: { mode: RaceCameraMode; car: React.MutableRefObject<CarApi | null> }) {
  const get = useThree((s) => s.get);
  const yaw = useRef<number | null>(null);
  const pos = useRef(new THREE.Vector3());
  const look = useRef(new THREE.Vector3());

  useFrame((_, dt) => {
    const camera = get().camera as THREE.PerspectiveCamera;
    const c = car.current;
    if (!c) return;
    const d = Math.min(dt, 0.05);
    const p = c.body.translation();
    const v = c.body.linvel();
    const speed = Math.hypot(v.x, v.z);
    // Point along travel once moving (a drift keeps the view on the line), else the nose.
    const want = speed > 4 ? Math.atan2(v.x, v.z) : carHeading(c.body);
    if (yaw.current === null) yaw.current = want;
    const diff = Math.atan2(Math.sin(want - yaw.current), Math.cos(want - yaw.current));
    yaw.current += diff * Math.min(1, TURN * d);
    const y = yaw.current;
    const view = VIEWS[mode];
    const fx = Math.sin(y);
    const fz = Math.cos(y);
    const ahead = view.ahead + speed * LEAD;
    _pos.set((p.x - fx * view.back) * M_TO_UNIT, (p.y + view.up) * M_TO_UNIT, (p.z - fz * view.back) * M_TO_UNIT);
    _look.set((p.x + fx * ahead) * M_TO_UNIT, p.y * M_TO_UNIT, (p.z + fz * ahead) * M_TO_UNIT);
    const first = pos.current.lengthSq() === 0;
    const k = first ? 1 : Math.min(1, FOLLOW * d);
    pos.current.lerp(_pos, k);
    look.current.lerp(_look, k);
    camera.position.copy(pos.current);
    camera.lookAt(look.current);
    if (Math.abs(camera.fov - view.fov) > 0.1) {
      camera.fov += (view.fov - camera.fov) * Math.min(1, 4 * d);
      camera.updateProjectionMatrix();
    }
  });
  return null;
}
