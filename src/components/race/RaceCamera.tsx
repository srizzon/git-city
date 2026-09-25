"use client";

import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { CarApi } from "@/components/league/drive/Car";
import { M_TO_UNIT } from "@/lib/league-city/drive/tuning";
import { carHeading } from "@/lib/league-city/drive/vehicle";
import { TRACK, arcDelta, locate, pointAt, type Track } from "@/lib/league-city/race/track";
import { TRIAL } from "@/lib/league-city/race/trial";

// The race track's camera, after Art of Rally: high up behind the car at
// about 50°, so the next corner is on screen before you reach it. It turns
// with the car slowly (a quick flick of the wheel doesn't swing the world)
// and looks further ahead the faster you go. "close" is a lower chase view.
//
// Around the run it shoots like a broadcast: a slow orbit of the grid on the
// title, a flyover from high above the whole circuit down to behind the car,
// and after the finish trackside cameras that pan with the car going by and
// zoom to keep it the same size, cutting to the next one ahead.

export type RaceCameraMode = "high" | "close";
export type RaceShot = "title" | "intro" | "follow" | "tv";

const VIEWS: Record<RaceCameraMode, { back: number; up: number; ahead: number; fov: number }> = {
  high: { back: 18, up: 23, ahead: 9, fov: 50 },
  close: { back: 9, up: 4.2, ahead: 8, fov: 62 },
};
/** How fast the camera turns toward the car's heading (1/s), and follows its position. */
const TURN = 2.2;
const FOLLOW = 7;
/** Extra look-ahead per m/s of speed (s). */
const LEAD = 0.45;
/** Title orbit: radius and height (m), speed (rad/s). */
const ORBIT = { r: 26, up: 9, speed: 0.12 };
/** Trackside cameras: this far ahead of the car (m), off the centerline, low or high. */
const TV = { ahead: 34, lateral: 10, low: 1.8, high: 8, passed: 10, frame: 4.5 };

const U = M_TO_UNIT;
const _pos = new THREE.Vector3();
const _look = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _right = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

const ease = (t: number) => t * t * (3 - 2 * t);

interface TvCam {
  x: number;
  y: number;
  z: number;
  s: number;
  at: number;
}

export default function RaceCamera({
  mode,
  car,
  track,
  shot,
  shotAt,
  frameLeft,
}: {
  mode: RaceCameraMode;
  car: React.MutableRefObject<CarApi | null>;
  track: Track;
  shot: RaceShot;
  /** When the shot began (performance.now). */
  shotAt: number;
  /** Keep the car in the left third (the results sit on the right). */
  frameLeft: boolean;
}) {
  const get = useThree((s) => s.get);
  const yaw = useRef<number | null>(null);
  const pos = useRef(new THREE.Vector3());
  const look = useRef(new THREE.Vector3());
  const tv = useRef<TvCam | null>(null);
  const tvCount = useRef(0);
  const shift = useRef(0);

  // The whole circuit from above: its middle, and a height that fits it in view.
  const overview = useMemo(() => {
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (const p of track.samples) {
      x0 = Math.min(x0, p.x);
      x1 = Math.max(x1, p.x);
      z0 = Math.min(z0, p.z);
      z1 = Math.max(z1, p.z);
    }
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const span = Math.max(x1 - x0, z1 - z0);
    return { cx, cz, up: span * 0.95, back: span * 0.35 };
  }, [track]);
  const grid = useMemo(() => pointAt(track, -6), [track]);

  useFrame((_, dt) => {
    const camera = get().camera as THREE.PerspectiveCamera;
    const c = car.current;
    if (!c) return;
    const d = Math.min(dt, 0.05);
    const now = performance.now();
    const p = c.body.translation();
    const v = c.body.linvel();
    const speed = Math.hypot(v.x, v.z);
    const view = VIEWS[mode];

    // The follow pose, always: the flyover lands on it and hands over without a jump.
    const want = speed > 4 ? Math.atan2(v.x, v.z) : carHeading(c.body);
    if (yaw.current === null || shot !== "follow") yaw.current = want;
    const diff = Math.atan2(Math.sin(want - yaw.current), Math.cos(want - yaw.current));
    yaw.current += diff * Math.min(1, TURN * d);
    const y = yaw.current;
    const fx = Math.sin(y);
    const fz = Math.cos(y);
    const ahead = view.ahead + speed * LEAD;
    _pos.set((p.x - fx * view.back) * U, (p.y + view.up) * U, (p.z - fz * view.back) * U);
    _look.set((p.x + fx * ahead) * U, p.y * U, (p.z + fz * ahead) * U);
    let fov = view.fov + (c.state.turboLeft > 0 ? 6 : 0);
    let k = pos.current.lengthSq() === 0 ? 1 : Math.min(1, FOLLOW * d);

    if (shot === "title") {
      // A slow circle around the grid and the gantry.
      const a = ((now - shotAt) / 1000) * ORBIT.speed + Math.atan2(grid.tx, grid.tz) + Math.PI * 0.75;
      _pos.set((grid.x + Math.sin(a) * ORBIT.r) * U, ORBIT.up * U, (grid.z + Math.cos(a) * ORBIT.r) * U);
      _look.set(grid.x * U, 2 * U, grid.z * U);
      fov = 45;
      k = 1;
    } else if (shot === "intro") {
      // Hold over the whole circuit, then swoop down behind the car.
      const t = Math.min(1, (now - shotAt) / TRIAL.introMs);
      const drift = t * 20;
      _a.set((overview.cx + drift) * U, overview.up * U, (overview.cz + overview.back) * U);
      _b.set((overview.cx + drift * 0.5) * U, 0, overview.cz * U);
      const w = ease(Math.max(0, (t - 0.3) / 0.7));
      _pos.lerpVectors(_a, _pos, w);
      _look.lerpVectors(_b, _look, w);
      fov = 50 + (view.fov - 50) * w;
      k = 1;
    } else if (shot === "tv") {
      // A camera by the track ahead; the next one once the car has gone by or it held too long.
      const spot = locate(track, p.x, p.z, 60);
      const cam = tv.current;
      const passed = !!cam && !!spot && arcDelta(track, cam.s, spot.s) > TV.passed;
      if (spot && (!cam || passed || now - cam.at > TRIAL.tvShotMs)) {
        const n = tvCount.current++;
        const s = spot.s + TV.ahead * (n === 0 ? 0.8 : 1);
        const q = pointAt(track, s);
        const i = Math.floor(((((s % track.length) + track.length) % track.length) / track.length) * track.samples.length);
        const bend = track.samples[i]?.k ?? 0;
        // Inside of the bend (positive curvature turns left, and left is +lateral); alternate on straights.
        const side = Math.abs(bend) > 0.004 ? Math.sign(bend) : n % 2 ? 1 : -1;
        const off = Math.min(TV.lateral, TRACK.width / 2 + TRACK.runoff - 1);
        tv.current = {
          x: q.x + q.tz * off * side,
          z: q.z - q.tx * off * side,
          y: n % 2 === 0 ? TV.low : TV.high,
          s,
          at: now,
        };
      }
      const t = tv.current;
      if (t) {
        _pos.set(t.x * U, t.y * U, t.z * U);
        _look.set(p.x * U, (p.y + 0.6) * U, p.z * U);
        // Zoom to keep the car about the same size in frame.
        const dist = Math.hypot(t.x - p.x, t.y - p.y, t.z - p.z);
        fov = THREE.MathUtils.clamp((2 * Math.atan(TV.frame / Math.max(1, dist)) * 180) / Math.PI, 14, 55);
        // A cut: the position jumps, the aim follows smoothly after the first frame.
        if (pos.current.distanceToSquared(_pos) > 1) {
          pos.current.copy(_pos);
          look.current.copy(_look);
          camera.fov = fov;
          camera.updateProjectionMatrix();
        }
        k = Math.min(1, 10 * d);
      }
    }

    pos.current.lerp(_pos, shot === "tv" ? 1 : k);
    look.current.lerp(_look, k);
    camera.position.copy(pos.current);
    // Slide the aim right so the car sits in the left third.
    shift.current += ((frameLeft ? 1 : 0) - shift.current) * Math.min(1, 2.5 * d);
    _a.copy(look.current);
    if (shift.current > 0.001) {
      _right.subVectors(look.current, pos.current).cross(UP).normalize();
      const dist = pos.current.distanceTo(look.current);
      const halfW = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * dist * camera.aspect;
      _a.addScaledVector(_right, halfW * 0.33 * shift.current);
    }
    camera.lookAt(_a);
    if (Math.abs(camera.fov - fov) > 0.05) {
      camera.fov += (fov - camera.fov) * (shot === "follow" ? Math.min(1, 3 * d) : Math.min(1, 6 * d));
      camera.updateProjectionMatrix();
    }
    if (shot !== "tv") tvCount.current = 0;
    if (shot !== "tv") tv.current = null;
  });
  return null;
}
