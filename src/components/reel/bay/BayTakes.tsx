"use client";

import { Suspense, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import CarModel from "@/components/league/drive/CarModel";
import { Bursts, FIRE, Missile, type VoxelBursts } from "@/components/league/drive/Voxels";
import { VoxelCrown } from "@/components/league/drive/CrownMode";
import RubbleFlags from "@/components/league/RubbleFlags";
import { rampGeometry } from "@/components/league/LeagueToys";
import { VehicleMesh } from "@/components/RaidSequence3D";
import BossPreview from "@/components/BossPreview";
import LeagueCrown3D from "@/components/LeagueCrown3D";
import type { CityBuilding } from "@/lib/github";
import { M_TO_UNIT, TURBO, WHEEL } from "@/lib/league-city/drive/tuning";
import { WHEELS } from "@/lib/league-city/drive/vehicle";
import { RAMP_BIG } from "@/lib/league-city/ramp";
import type { SmashStore } from "@/lib/league-city/smash";
import { beatOf, type FilmClock } from "@trailer-kit/clock";
import { cutAt, type Reel, type ReelCut } from "@/lib/reel/film";

// Gameplay takes in the home city, staged on a real downtown avenue and
// played off the film's clock: cars cruising, drifting, boosting, firing a
// missile, jumping a ramp, grabbing the crown, ramming a tower that then
// comes down floor by floor (the game's own smash store, the attacker's
// flag on the rubble), the fly-mode vehicle threading the towers, and the
// boss over the skyline. Each take places its actors and the camera as a
// function of time; particles only move while the film does.
//
//   car-cruise  a car down the avenue, the camera low behind it
//   car-drift   the car throws its tail out across the avenue, smoke and turbo sparks
//   car-boost   cruising, then the boost kicks: flame, the lens punches out
//   car-missile one car fires on another ahead: the hit, the flip
//   car-ramp    up a big ramp in the middle of the avenue and into the air
//   crown-grab  the crown in its beam of light on the avenue; the car drives
//               through it and it floats over the car
//   car-ram     the car cuts into a tower's corner (params.login), then the
//               tower comes down; params.by plants their flag on the rubble
//   tower-fall  a tower (params.login) coming down, from low and wide
//   fly-canyon  the fly-mode vehicle down the avenue between the towers, then up
//   boss        the boss over the skyline, from the street looking up
//
// The car and fly takes take params.cam, the angle on the subject: chase, side, front, wheel
// (low by the rear wheel), top, drone (high behind), pass (fixed, it goes by), orbit, below.
//   league-crown round a tower (params.login) wearing the week's town crown on its roof

export const BAY_TAKES = ["car-cruise", "car-drift", "car-boost", "car-missile", "car-ramp", "crown-grab", "car-ram", "tower-fall", "fly-canyon", "boss", "league-crown"] as const;
export const isTake = (kind: string) => (BAY_TAKES as readonly string[]).includes(kind);

/** A downtown avenue between ~230-unit towers (found on the layout): where the takes happen. */
export const CANYON = { from: [-184, 194] as [number, number], to: [-462, 238] as [number, number] };

/** The boss stands this far down the avenue, this high: it fills the sky past the last towers. */
const BOSS_S = 650;
const BOSS_Y = 620;
const SMOKE = ["#d9d6de", "#bdb9c4", "#ece9ef", "#a7a2b0"];
const DEBRIS = ["#1c2233", "#2a3147", "#ffd76a", "#ffe9a8", "#8fa3c7", "#3a4462"];
const GOLD = "#ffcf33";
const smooth = (u: number) => u * u * (3 - 2 * u);
const clamp01 = (u: number) => Math.min(1, Math.max(0, u));

/** A road as a frame: s along it from `from`, l to its left; yaw faces down it (the cars' convention: 0 faces +z). */
function frameOf(road: { from: [number, number]; to: [number, number] }) {
  const [fx, fz] = road.from;
  const L = Math.hypot(road.to[0] - fx, road.to[1] - fz);
  const ux = (road.to[0] - fx) / L;
  const uz = (road.to[1] - fz) / L;
  return {
    L,
    ux,
    uz,
    yaw: Math.atan2(ux, uz),
    at: (s: number, l = 0): [number, number] => [fx + ux * s - uz * l, fz + uz * s + ux * l],
  };
}

/** Where a building stands in the road's frame. */
function along(f: ReturnType<typeof frameOf>, x: number, z: number, from: [number, number]) {
  const rx = x - from[0];
  const rz = z - from[1];
  return { s: rx * f.ux + rz * f.uz, l: -rx * f.uz + rz * f.ux };
}

const _pos = new THREE.Vector3();
const _look = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _spin = new THREE.Quaternion();
const _ax = new THREE.Vector3(1, 0, 0);
const _ay = new THREE.Vector3(0, 1, 0);

export interface BayTakesProps {
  clock: FilmClock;
  reel: Reel;
  store: SmashStore | null;
  /** The city's buildings by login (lowercase). */
  byLogin: ReadonlyMap<string, CityBuilding>;
}

export default function BayTakes({ clock, reel, store, byLogin }: BayTakesProps) {
  const car0 = useRef<THREE.Group>(null);
  const car1 = useRef<THREE.Group>(null);
  const wheels0 = useRef<(THREE.Object3D | null)[]>([]);
  const wheels1 = useRef<(THREE.Object3D | null)[]>([]);
  const missile = useRef<THREE.Group>(null);
  const plane = useRef<THREE.Group>(null);
  const crown = useRef<THREE.Group>(null);
  const beam = useRef<THREE.Mesh>(null);
  const ramp = useRef<THREE.Mesh>(null);
  const boss = useRef<THREE.Group>(null);
  const bursts = useRef<VoxelBursts | null>(null);
  const st = useRef({ last: -1, spin: [0, 0], shake: 0 });
  const rampGeo = useMemo(() => rampGeometry(RAMP_BIG), []);
  const hasBoss = reel.cuts.some((c) => c.kind === "boss");
  const crowned = useMemo(() => {
    const cut = reel.cuts.find((c) => c.kind === "league-crown" && typeof c.params.login === "string");
    return cut ? (byLogin.get((cut.params.login as string).toLowerCase()) ?? null) : null;
  }, [reel, byLogin]);
  const crownGroup = useRef<THREE.Group>(null);

  useFrame((three, delta) => {
    const camera = three.camera as THREE.PerspectiveCamera;
    const cars = [car0, car1];
    const wheels = [wheels0, wheels1];
    const beat = Math.max(0, beatOf(clock));
    const prev = st.current.last;
    st.current.last = beat;
    const fx = beat !== prev ? bursts.current : null;
    const dt = Math.min(delta, 0.05);
    const { cut, t } = cutAt(reel, beat);
    const crossed = (at: number) => prev - cut.from < at && t >= at;
    for (const c of cars) if (c.current) c.current.visible = false;
    for (const r of [missile, plane, crown, beam, ramp]) if (r.current) r.current.visible = false;
    if (boss.current) boss.current.visible = cut.kind === "boss";
    if (crownGroup.current) crownGroup.current.visible = cut.kind === "league-crown";
    if (!isTake(cut.kind)) return;
    st.current.shake = Math.max(0, st.current.shake - dt * 2.2);

    const p = cut.params;
    const road = frameOf(CANYON);

    /** Places car k at road position (s, l), facing down the road plus `turn`, wheels turning at `speed`. */
    const car = (k: number, s: number, l: number, speed: number, o: { y?: number; turn?: number; pitch?: number; roll?: number } = {}) => {
      const g = cars[k].current;
      if (!g) return [0, 0] as [number, number];
      const [x, z] = road.at(s, l);
      g.visible = true;
      g.position.set(x, o.y ?? 0, z);
      g.rotation.set(o.pitch ?? 0, road.yaw + (o.turn ?? 0), o.roll ?? 0, "YXZ");
      st.current.spin[k] += (speed * dt) / (WHEEL.radius * M_TO_UNIT);
      WHEELS.forEach((w, i) => {
        const wo = wheels[k].current[i];
        if (!wo) return;
        wo.position.set(w.x * M_TO_UNIT, (WHEEL.connectionY - WHEEL.restLength) * M_TO_UNIT, w.z * M_TO_UNIT);
        _q.setFromAxisAngle(_ay, w.x < 0 ? Math.PI : 0);
        _spin.setFromAxisAngle(_ax, st.current.spin[k] * (w.x < 0 ? -1 : 1));
        wo.quaternion.copy(_q).multiply(_spin);
      });
      return [x, z] as [number, number];
    };
    /** The camera at road (s, l, height), looking at road (s, l, height). */
    const cam = (s: number, l: number, h: number, ls: number, ll: number, lh: number, fov: number) => {
      const [x, z] = road.at(s, l);
      const [lx, lz] = road.at(ls, ll);
      _pos.set(x, h, z);
      _look.set(lx, lh, lz);
      camera.fov = fov;
    };
    const mode = typeof p.cam === "string" ? p.cam : null;
    const span = cut.to - cut.from;
    /**
     * The angle the spec picked (params.cam) on a subject at road (s, l, height y); false when
     * none was picked, and the take keeps its own camera. `sMid`: where the subject is mid-take,
     * for the fixed "pass" camera it goes by.
     */
    const angle = (s: number, l: number, y: number, sMid: number): boolean => {
      const away = l >= 0 ? -6 : 6;
      switch (mode) {
        case "chase":
          cam(s - 16, l * 0.5, y + 4.5, s + 30, l, y + 4, 52);
          return true;
        case "side":
          // Three-quarters from the road's edge, a little behind: the avenue is too narrow to stand off square.
          cam(s - 8, away, y + 3.2, s + 3, l, y + 1.2, 60);
          return true;
        case "front":
          cam(s + 18, l * 0.5, y + 3, s, l, y + 1.5, 48);
          return true;
        case "wheel":
          cam(s - 2.5, l + (away > 0 ? 3.4 : -3.4), y + 0.6, s + 25, l, y + 1.2, 62);
          return true;
        case "top":
          cam(s - 4, l, y + 55, s + 4, l, y, 45);
          return true;
        case "drone":
          cam(s - 42, l * 0.5, y + 34, s + 14, l, y, 50);
          return true;
        case "pass":
          // Fixed on the road's edge mid-way: the subject comes at the lens, goes by, and away.
          cam(sMid, away, y > 5 ? y - 6 : 1.8, s, l, y + 1.2, 56);
          return true;
        case "orbit": {
          const a = -1.2 + (2.4 * t) / Math.max(0.5, span);
          cam(s + 11 * Math.cos(a), Math.max(-6, Math.min(6, l + 11 * Math.sin(a))), y + 3, s, l, y + 1.2, 50);
          return true;
        }
        case "below":
          cam(s + 14, l, Math.max(1.5, y - 30), s, l, y, 62);
          return true;
        default:
          return false;
      }
    };
    const rearSmoke = (s: number, l: number, turn: number, colors: string[] | null) => {
      if (!fx) return;
      for (const w of [WHEELS[2], WHEELS[3]]) {
        const yaw = road.yaw + turn;
        const lx = w.x * M_TO_UNIT;
        const lz = w.z * M_TO_UNIT;
        const [cx, cz] = road.at(s, l);
        const px = cx + lx * Math.cos(yaw) + lz * Math.sin(yaw);
        const pz = cz - lx * Math.sin(yaw) + lz * Math.cos(yaw);
        fx.burst(px, 0.6, pz, { count: 1, speed: 2.5, colors: SMOKE, size: 1, life: 1.1, gravity: -1.2, flat: 0.6 });
        if (colors) fx.burst(px, 0.4, pz, { count: 1, speed: 4, colors, size: 0.4, life: 0.22, gravity: 20 });
      }
    };
    const flame = (s: number, l: number, y: number) => {
      const [x, z] = road.at(s - 5, l);
      fx?.burst(x, y + 1.2, z, { count: 3, speed: 4, colors: [TURBO.colors[1], "#ffffff", TURBO.colors[3]], size: 1, life: 0.3, gravity: 0 });
    };
    /** Knocks a tower down: every floor off over `secs` from `at` into the take, `by` on the rubble. */
    const fall = (i: number, at: number, secs: number, by: string | undefined) => {
      if (!store || !fx || t < at) return;
      const tg = store.targets[i];
      const due = Math.min(tg.floors, Math.ceil(((t - at) / secs) * tg.floors));
      const cols = store.rowsOf(i).map((_, c) => c);
      let taken = tg.floors - Math.max(...store.rowsOf(i));
      while (taken < due && store.standing(i) > 0) {
        store.hitColumns(i, cols, 1, Date.now(), by);
        taken++;
        if (taken < tg.floors * 0.66) fx.burst(tg.x, 3, tg.z, { count: 16, speed: 36, colors: DEBRIS, size: Math.min(3, tg.floorH * 0.45), life: 0.8 });
      }
      st.current.shake = Math.max(st.current.shake, 0.45);
    };
    const target = () => (store && typeof p.login === "string" ? store.index.get(p.login.toLowerCase()) : undefined);
    const by = typeof p.by === "string" ? p.by : undefined;

    switch (cut.kind) {
      case "car-cruise": {
        const s = 20 + 45 * t;
        car(0, s, 0, 45);
        if (!angle(s, 0, 0, 20 + 45 * span * 0.5)) cam(s - 16, 4, 4.5, s + 30, 0, 6, 52);
        break;
      }
      case "car-drift": {
        // Across the avenue sideways: the tail swings out and back over two seconds.
        const s = 40 + 55 * t;
        const v = clamp01((t - 0.4) / 2);
        const slip = 1.05 * Math.sin(Math.PI * v);
        const l = 4 * Math.sin(Math.PI * v) - 1;
        car(0, s, l, 55, { turn: -slip, roll: 0.05 * slip });
        if (slip > 0.15) rearSmoke(s, l, -slip, [TURBO.colors[v < 0.35 ? 1 : v < 0.7 ? 2 : 3]]);
        // Low ahead of the car on the road's edge, looking back: it slides toward the lens showing its flank.
        if (!angle(s, l, 0, 40 + 55 * span * 0.5)) cam(s + 17, -5, 2, s, l, 1.6, 48);
        break;
      }
      case "car-boost": {
        const hit = 0.8;
        const u = Math.max(0, t - hit);
        const s = 30 + 45 * t + 0.5 * 90 * u * u;
        car(0, s, 0, 45 + 90 * u, { pitch: t >= hit ? -0.05 * Math.exp(-u * 6) : 0 });
        if (t >= hit) flame(s, 0, 0);
        if (crossed(hit)) st.current.shake = 0.7;
        const lag = t < hit ? 0 : 18 * (1 - Math.exp(-u * 5)) * Math.exp(-u * 1.2);
        if (!angle(s, 0, 0, 30 + 45 * span * 0.5))
          cam(s - 17 - lag, 3, 4.5, s + 30, 0, 3.5, 50 + 26 * (t < hit ? 0 : Math.exp(-u * 1.5) * (1 - Math.exp(-u * 12))));
        break;
      }
      case "car-missile": {
        const fire = 1;
        const hit = 1.8;
        const sb = 30 + 48 * t;
        const so = sb + 24;
        car(1, sb, 4, 48);
        if (t < hit) car(0, so, -3, 48);
        if (t >= fire && t < hit && missile.current) {
          const u = (t - fire) / (hit - fire);
          const [mx, mz] = road.at(sb + 5 + (so - sb - 5) * u, 4 + (-3 - 4) * u);
          const [tx, tz] = road.at(so, -3);
          missile.current.visible = true;
          missile.current.position.set(mx, 2.2 + 1.5 * Math.sin(Math.PI * u), mz);
          missile.current.lookAt(tx, 1.5, tz);
          fx?.burst(mx, 2.2, mz, { count: 2, speed: 2, colors: SMOKE, size: 0.9, life: 0.7, gravity: -2 });
        }
        if (t >= hit) {
          // Blown up and over: up, forward, tumbling, down on its roof.
          const u = t - hit;
          const air = Math.min(u, 0.85);
          const y = Math.max(0, 30 * air - 35 * air * air);
          const spin = air / 0.85;
          car(0, 30 + 48 * hit + 24 + 28 * air, -3 + 4 * air, 0, { y, pitch: -Math.PI * spin, turn: 0.6 * spin, roll: 0.9 * spin });
          if (crossed(hit)) {
            const [hx, hz] = road.at(30 + 48 * hit + 24, -3);
            fx?.burst(hx, 2, hz, { count: 70, speed: 40, colors: FIRE, size: 2.4, life: 1 });
            fx?.burst(hx, 2, hz, { count: 25, speed: 18, colors: ["#2a2a30", "#3a3a44"], size: 2, life: 1.4, gravity: -4 });
            st.current.shake = 1.2;
          }
        }
        // High behind the shooter: it sits low in the frame, the street and the target ahead of it.
        if (!angle((sb + so) / 2, 0, 0, 30 + 48 * 1.8 + 12)) cam(sb - 20, 3, 10, so + 14, -2, 1.5, 46);
        break;
      }
      case "car-ramp": {
        const rs = road.L * 0.55;
        const foot = rs - RAMP_BIG.length / 2;
        const lip = rs + RAMP_BIG.length / 2;
        const slope = RAMP_BIG.height / RAMP_BIG.length;
        const v = 95;
        const s = foot - v * 0.45 + v * t;
        let y = 0;
        let pitch = 0;
        if (s >= foot && s < lip) {
          y = (s - foot) * slope;
          pitch = -Math.atan(slope);
        } else if (s >= lip) {
          const air = (s - lip) / v;
          const vy = v * slope;
          y = Math.max(0, RAMP_BIG.height + vy * air - 0.5 * 55 * air * air);
          pitch = -Math.atan((vy - 55 * air) / v) * 0.8;
        }
        if (ramp.current) {
          const [x, z] = road.at(rs, 0);
          ramp.current.visible = true;
          ramp.current.position.set(x, 0, z);
          ramp.current.rotation.set(0, road.yaw + Math.PI, 0);
        }
        car(0, s, 0, v, { y, pitch });
        flame(s, 0, y);
        // Behind the car, low, falling back a little as it leaves the ramp: the ramp, the lift-off, the arc.
        const back = 16 + 10 * smooth(clamp01((s - lip) / 60));
        if (!angle(s, 0, y, lip)) cam(s - back, 2, 3 + y * 0.6, s + 30, 0, 3 + y * 0.9, 56);
        break;
      }
      case "crown-grab": {
        const cs = road.L * 0.6;
        const s = cs - 45 * 1.4 + 45 * t;
        const [cx, cz] = road.at(cs, 0);
        const got = s >= cs;
        car(0, s, 0, 45);
        if (crown.current) {
          crown.current.visible = true;
          const [hx, hz] = road.at(s, 0);
          if (got) crown.current.position.set(hx, 9 + 0.4 * Math.sin(t * 4), hz);
          else crown.current.position.set(cx, 4 + 0.6 * Math.sin(t * 3), cz);
          crown.current.rotation.y = t * 1.6;
        }
        if (beam.current) {
          const [hx, hz] = got ? road.at(s, 0) : [cx, cz];
          beam.current.visible = true;
          beam.current.position.set(hx, 60, hz);
          beam.current.scale.set(got ? 0.6 : 1, 1, got ? 0.6 : 1);
        }
        if (crossed(1.4)) {
          fx?.burst(cx, 5, cz, { count: 40, speed: 20, colors: [GOLD, "#fff2b0", "#ff4f7a"], size: 0.8, life: 0.8 });
          st.current.shake = 0.4;
        }
        if (!angle(s, 0, 0, cs)) cam(Math.min(s, cs) - 22 + 8 * smooth(clamp01(t - 1.4)), 10, 7, Math.max(s, cs - 10) + 6, 0, 5, 48);
        break;
      }
      case "car-ram": {
        const i = target();
        if (i === undefined || !store) break;
        const tg = store.targets[i];
        const b = along(road, tg.x, tg.z, CANYON.from);
        // Up the avenue and into the tower's near corner, then through it while it comes down.
        const hitAt = 1.3;
        const v = 60;
        const s = b.s - v * hitAt + v * t;
        const side = Math.sign(b.l) || 1;
        const l = side * Math.min(Math.abs(b.l) - tg.w / 2 + 3, 12 * smooth(clamp01((t - 0.6) / 0.7)));
        car(0, s, l, v, { turn: -side * 0.35 * smooth(clamp01((t - 0.6) / 0.7)) });
        if (crossed(hitAt)) {
          const [hx, hz] = road.at(s, l);
          fx?.burst(hx, 4, hz, { count: 40, speed: 30, colors: FIRE, size: 1.8, life: 0.8 });
          st.current.shake = 1.2;
        }
        fall(i, hitAt, 1.6, by);
        // Behind the car up to the hit (the car, the tower's foot ahead), then the camera stops and
        // tilts up the tower as it comes down.
        const H = tg.floors * tg.floorH;
        const cs = Math.min(s, b.s - v * 0.15) - 22;
        const up = smooth(clamp01((t - hitAt) / 0.6));
        cam(cs, -side * 2, 5 + 25 * up, b.s, b.l * (0.5 + 0.5 * up), 4 + H * (0.4 - 0.2 * smooth(clamp01((t - hitAt - 0.6) / 1.2))) * up, 60);
        break;
      }
      case "tower-fall": {
        const i = target();
        if (i === undefined || !store) break;
        const tg = store.targets[i];
        const b = along(road, tg.x, tg.z, CANYON.from);
        const at = 0.4;
        if (crossed(at)) {
          fx?.burst(tg.x, 6, tg.z, { count: 70, speed: 55, colors: FIRE, size: 3.2, life: 0.8 });
          st.current.shake = 1.4;
        }
        fall(i, at, 1.4, by);
        const H = tg.floors * tg.floorH;
        // Up the avenue from the tower, on the road, low: the tower falls into its dust.
        cam(b.s + 75, -Math.sign(b.l || 1) * 4, 6, b.s, b.l, H * (0.5 - 0.3 * smooth(clamp01((t - at) / 1.6))), 60);
        break;
      }
      case "fly-canyon": {
        // Threading the towers at speed, banking through the avenue's slight bend, then pulling up.
        const s = 10 + 85 * t;
        const climb = smooth(clamp01((t - 2.2) / 1.2));
        const y = 55 + 140 * climb;
        if (plane.current) {
          const [x, z] = road.at(s, 3 * Math.sin(t * 1.3));
          plane.current.visible = true;
          plane.current.position.set(x, y, z);
          plane.current.rotation.set(-0.5 * climb, road.yaw + Math.PI, 0.35 * Math.sin(t * 1.3), "YXZ");
        }
        if (!angle(s, 0, y, 10 + 85 * span * 0.5)) cam(s - 26, 0, y + 8 - 20 * climb, s + 30, 0, y + 30 * climb, 55);
        break;
      }
      case "league-crown": {
        if (!crowned) break;
        // Round the roof, a little above it, closing in: the gold crown turning over the tower.
        const h = crowned.height;
        const a = 0.4 + 0.35 * t;
        const d = 330 - 70 * smooth(clamp01(t / 3.5));
        _pos.set(crowned.position[0] + Math.sin(a) * d, h + 110, crowned.position[2] + Math.cos(a) * d);
        _look.set(crowned.position[0], h + 10, crowned.position[2]);
        camera.fov = 50;
        break;
      }
      case "boss": {
        // From the street, the camera rises and tilts up to the boss over the end of the avenue.
        const u = smooth(clamp01(t / 2.8));
        cam(10 + 40 * u, 0, 6 + 140 * u, BOSS_S, 0, 120 + (BOSS_Y - 120) * u, 55);
        const fog = three.scene.fog as THREE.Fog | null;
        if (fog) {
          fog.near *= 4;
          fog.far *= 4;
          camera.far = Math.max(camera.far, fog.far * 1.25);
        }
        break;
      }
    }

    const k = st.current.shake;
    if (k > 0) {
      const n = performance.now() / 1000;
      _pos.x += Math.sin(n * 71) * 1.5 * k;
      _pos.y += Math.cos(n * 53) * 1.2 * k;
    }
    camera.near = 0.5;
    camera.updateProjectionMatrix();
    camera.position.copy(_pos);
    camera.lookAt(_look);
    camera.updateMatrixWorld();
  });

  const bossAt = useMemo(() => {
    const [x, z] = frameOf(CANYON).at(BOSS_S, 0);
    return [x, BOSS_Y - 150, z] as [number, number, number];
  }, []);

  return (
    <>
      <group ref={car0} visible={false}>
        <Suspense fallback={null}>
          <CarModel color="#e07a4f" wheelRefs={wheels0} />
        </Suspense>
      </group>
      <group ref={car1} visible={false}>
        <Suspense fallback={null}>
          <CarModel color="#4f8fe0" wheelRefs={wheels1} />
        </Suspense>
      </group>
      <group ref={missile} visible={false}>
        <Missile />
      </group>
      <group ref={plane} visible={false} scale={1.4}>
        <VehicleMesh type="airplane" />
      </group>
      <group ref={crown} visible={false} scale={1.4}>
        <VoxelCrown />
      </group>
      <mesh ref={beam} visible={false}>
        <boxGeometry args={[3, 120, 3]} />
        <meshBasicMaterial color={GOLD} transparent opacity={0.22} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
      <mesh ref={ramp} geometry={rampGeo} visible={false}>
        <meshStandardMaterial color="#2a3147" emissive="#c8e64a" emissiveIntensity={0.15} />
      </mesh>
      {hasBoss && (
        <group ref={boss} visible={false}>
          <BossPreview variant="duck" phase={1} position={bossAt} scale={15} />
        </group>
      )}
      {crowned && (
        <group ref={crownGroup} position={crowned.position} visible={false}>
          <LeagueCrown3D width={crowned.width} height={crowned.height} depth={crowned.depth} />
        </group>
      )}
      {store && <RubbleFlags store={store} />}
      <Bursts ref={bursts} />
    </>
  );
}

/** Logins the takes knock down (their buildings go in the city's smash store). */
export function smashLogins(cuts: readonly ReelCut[]): string[] {
  return [...new Set(cuts.filter((c) => (c.kind === "car-ram" || c.kind === "tower-fall") && typeof c.params.login === "string").map((c) => (c.params.login as string).toLowerCase()))];
}
