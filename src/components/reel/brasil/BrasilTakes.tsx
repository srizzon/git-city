"use client";

import { Suspense, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import CarModel from "@/components/league/drive/CarModel";
import { Bursts, type VoxelBursts } from "@/components/league/drive/Voxels";
import { M_TO_UNIT, TURBO, WHEEL } from "@/lib/league-city/drive/tuning";
import { WHEELS } from "@/lib/league-city/drive/vehicle";
import { courseOf, getLiveSpot } from "@/lib/drift/spots";
import type { LiveSpot } from "@/lib/drift/spots/types";
import type { TrackSample } from "@/lib/league-city/race/track";
import { beatOf, type FilmClock } from "@trailer-kit/clock";
import { cutAt, type Reel } from "@/lib/reel/film";
import { BRASIL_TAKES } from "@/lib/reel/scenes";

// Drift takes on the Brasil map's own track (Interlagos cut down to a drift
// course, lib/drift/spots/brasil), played off the film's clock: a car runs
// the racing line at drift speed, its tail out in proportion to how hard the
// line bends, smoke and turbo sparks off the rear wheels.
//
//   track-drift  the chase camera, low behind; its heading lags, so the car slides across the lens
//   track-top    from high above and a little behind, turning with the car
//   track-wide   high over the car's part of the track, slowly turning, the car drifting through the bends
//
// params.from: where on the lap the take starts (m from the line; default the S do Senna).

export const isBrasilTake = (kind: string) => (BRASIL_TAKES as readonly string[]).includes(kind);

const COURSE = courseOf(getLiveSpot("brasil") as LiveSpot);
const SMOKE = ["#d9d6de", "#bdb9c4", "#ece9ef", "#a7a2b0"];
/** Drift speed (m/s) and the S do Senna (m from the line). */
const SPEED = 24;
const SENNA = 45;
const U = M_TO_UNIT;
const _q = new THREE.Quaternion();
const _spin = new THREE.Quaternion();
const _ax = new THREE.Vector3(1, 0, 0);
const _ay = new THREE.Vector3(0, 1, 0);

/** The line at `s` m (wrapping round the lap), interpolated between samples. */
function lineAt(s: number): TrackSample {
  const { samples, length } = COURSE.track;
  const d = ((s % length) + length) % length;
  let lo = 0;
  let hi = samples.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].s <= d) lo = mid;
    else hi = mid;
  }
  const a = samples[lo];
  const b = samples[hi];
  const f = Math.min(1, Math.max(0, (d - a.s) / Math.max(1e-6, b.s - a.s)));
  return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, s: d, tx: a.tx + (b.tx - a.tx) * f, tz: a.tz + (b.tz - a.tz) * f, k: a.k + (b.k - a.k) * f };
}

/** How far the tail is out (radians, positive: the car points left of its line), from the bend just ahead. */
function slipAt(s: number) {
  let k = 0;
  for (let i = 0; i < 6; i++) k += lineAt(s + i * 2).k;
  k /= 6;
  return Math.max(-0.95, Math.min(0.95, k * 14));
}

export default function BrasilTakes({ clock, reel }: { clock: FilmClock; reel: Reel }) {
  const car = useRef<THREE.Group>(null);
  const wheels = useRef<(THREE.Object3D | null)[]>([]);
  const bursts = useRef<VoxelBursts | null>(null);
  const st = useRef({ last: -1, spin: 0 });
  const center = useMemo(() => {
    const xs = COURSE.track.samples.map((p) => p.x);
    const zs = COURSE.track.samples.map((p) => p.z);
    return { x: ((Math.min(...xs) + Math.max(...xs)) / 2) * U, z: ((Math.min(...zs) + Math.max(...zs)) / 2) * U, r: Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) * U };
  }, []);

  useFrame((three, delta) => {
    const camera = three.camera as THREE.PerspectiveCamera;
    const beat = Math.max(0, beatOf(clock));
    const prev = st.current.last;
    st.current.last = beat;
    const fx = beat !== prev ? bursts.current : null;
    const dt = Math.min(delta, 0.05);
    const { cut, t } = cutAt(reel, beat);
    if (car.current) car.current.visible = false;
    if (!isBrasilTake(cut.kind)) return;

    const s0 = typeof cut.params.from === "number" ? cut.params.from : SENNA;
    const s = s0 + SPEED * t;
    const p = lineAt(s);
    const heading = Math.atan2(p.tx, p.tz);
    const slip = slipAt(s);
    const yaw = heading + slip;
    const x = p.x * U;
    const z = p.z * U;
    const g = car.current;
    if (g) {
      g.visible = true;
      g.position.set(x, 0, z);
      g.rotation.set(0, yaw, -0.05 * slip, "YXZ");
      st.current.spin += (SPEED * U * dt) / (WHEEL.radius * M_TO_UNIT);
      WHEELS.forEach((w, i) => {
        const o = wheels.current[i];
        if (!o) return;
        o.position.set(w.x * M_TO_UNIT, (WHEEL.connectionY - WHEEL.restLength) * M_TO_UNIT, w.z * M_TO_UNIT);
        _q.setFromAxisAngle(_ay, w.x < 0 ? Math.PI : 0);
        _spin.setFromAxisAngle(_ax, st.current.spin * (w.x < 0 ? -1 : 1));
        o.quaternion.copy(_q).multiply(_spin);
      });
    }
    if (Math.abs(slip) > 0.2 && fx) {
      const v = Math.min(1, Math.abs(slip) / 0.95);
      for (const w of [WHEELS[2], WHEELS[3]]) {
        const lx = w.x * M_TO_UNIT;
        const lz = w.z * M_TO_UNIT;
        const px = x + lx * Math.cos(yaw) + lz * Math.sin(yaw);
        const pz = z - lx * Math.sin(yaw) + lz * Math.cos(yaw);
        fx.burst(px, 0.6, pz, { count: 1, speed: 2.5, colors: SMOKE, size: 1.1 + 0.6 * v, life: 1.2, gravity: -1.2, flat: 0.6 });
        fx.burst(px, 0.4, pz, { count: 1, speed: 4, colors: [TURBO.colors[v < 0.4 ? 1 : v < 0.75 ? 2 : 3]], size: 0.45, life: 0.22, gravity: 20 });
      }
    }

    const pos = new THREE.Vector3();
    const look = new THREE.Vector3();
    if (cut.kind === "track-drift") {
      // The camera's heading lags a quarter second behind the car's, so a drift slides it across the lens.
      const lag = lineAt(s - SPEED * 0.28);
      const lh = Math.atan2(lag.tx, lag.tz);
      pos.set(x - Math.sin(lh) * 15, 4.5, z - Math.cos(lh) * 15);
      look.set(x + Math.sin(lh) * 10, 2.2, z + Math.cos(lh) * 10);
      camera.fov = 52;
    } else if (cut.kind === "track-top") {
      pos.set(x - Math.sin(heading) * 18, 70, z - Math.cos(heading) * 18);
      look.set(x + Math.sin(heading) * 8, 0, z + Math.cos(heading) * 8);
      camera.fov = 46;
    } else {
      // High over the car's side of the track, turning slowly: the car drifting through a run of bends.
      const a = 0.6 + 0.12 * t;
      const d = center.r * 0.22;
      pos.set(x + Math.sin(a) * d, d * 0.95, z + Math.cos(a) * d);
      look.set(x, 0, z);
      camera.fov = 45;
    }
    // The map's haze, pushed out to the track.
    const h = pos.distanceTo(look);
    const fog = three.scene.fog as THREE.Fog | null;
    if (fog) {
      fog.near = Math.max(400, h * 4);
      fog.far = Math.max(2500, h * 12);
    }
    camera.near = 0.5;
    camera.far = 400000;
    camera.updateProjectionMatrix();
    camera.position.copy(pos);
    camera.lookAt(look);
    camera.updateMatrixWorld();
  });

  return (
    <>
      <group ref={car} visible={false}>
        <Suspense fallback={null}>
          <CarModel color="#e07a4f" wheelRefs={wheels} />
        </Suspense>
      </group>
      <Bursts ref={bursts} />
    </>
  );
}
