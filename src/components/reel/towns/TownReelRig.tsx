"use client";

import { Suspense, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import CarModel from "@/components/league/drive/CarModel";
import { Bursts, FIRE, type VoxelBursts } from "@/components/league/drive/Voxels";
import { M_TO_UNIT, WHEEL } from "@/lib/league-city/drive/tuning";
import { WHEELS } from "@/lib/league-city/drive/vehicle";
import { LOT } from "@/lib/league-city/grid";
import type { CityObject } from "@/lib/league-city/types";
import type { SmashStore } from "@/lib/league-city/smash";
import { beatOf, type FilmClock } from "@trailer-kit/clock";
import { shotFor } from "@trailer-kit/film";
import { cutAt, type Reel, type ReelCut } from "@/lib/reel/film";
import { placeBalloon } from "@/components/reel/ReelOverlay";

// One town's camera and car in a towns reel (from the mrscripty reel). It
// plays its own town's cuts off the shared clock and holds still while
// another town is on screen. Buildings fall through the same smash store
// the game draws, floor after floor with the attacker's name on them, so the
// rubble flies their flag. Every cut shows one building, framed by its height.
//
//   tower        close on a tower, rising up it to its roof        params: login
//   collapse     low and wide: a car out of the street into its foot,
//                the tower coming down on the lens                 params: login, by
//   flag         in on the attacker's flag in the rubble           params: login, by
//   montage-hit  steep over a victim sinking into its dust; the
//                cut's `i` picks the i-th tallest of `victims`     params: victims, i, by
//   intact       round a building nobody has touched               params: login
//   circle       on round it, slower                               params: login
//   pull-off     pulling off it                                    params: login

export const TOWN_SCENES = ["tower", "collapse", "flag", "montage-hit", "intact", "circle", "pull-off"] as const;

const DEBRIS = ["#1c2233", "#2a3147", "#ffd76a", "#ffe9a8", "#8fa3c7", "#3a4462"];
const CAR_COLOR = "#e07a4f";
const SPEED = 80;
/** The car hits the tower's foot this long into a collapse; it comes down over FALL_SLOW. */
const RAM_AT = 0.15;
const FALL_SLOW = 1.2;
/** A montage fall: this long into its cut, all its floors in FALL_FAST. */
const HIT_AT = 0.05;
const FALL_FAST = 0.4;

const _pos = new THREE.Vector3();
const _pin = new THREE.Vector3();
const _look = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _spin = new THREE.Quaternion();
const _axisX = new THREE.Vector3(1, 0, 0);
const _axisY = new THREE.Vector3(0, 1, 0);
const smooth = (u: number) => u * u * (3 - 2 * u);

type Target = { i: number; x: number; z: number; w: number; d: number; floors: number; floorH: number };

function targetOf(store: SmashStore, login: unknown): Target | null {
  if (typeof login !== "string") return null;
  const i = store.index.get(login.toLowerCase());
  if (i === undefined) return null;
  const t = store.targets[i];
  return { i, x: t.x, z: t.z, w: t.w, d: t.d, floors: t.floors, floorH: t.floorH };
}

/** The side of a building's lot the street is on, as a unit vector. */
function streetSide(objects: readonly CityObject[], x: number, z: number): [number, number] {
  const roads = new Set(objects.filter((o) => o.item_type === "road").map((o) => `${o.x},${o.z}`));
  const lx = Math.round(x / LOT);
  const lz = Math.round(z / LOT);
  for (const [dx, dz] of [[0, 1], [1, 0], [-1, 0], [0, -1]] as [number, number][]) if (roads.has(`${lx + dx},${lz + dz}`)) return [dx, dz];
  return [0, 1];
}

export interface TownReelRigProps {
  stage: string;
  clock: FilmClock;
  reel: Reel;
  objects: readonly CityObject[];
  store: SmashStore;
  balloon: RefObject<HTMLDivElement | null>;
}

export default function TownReelRig({ stage, clock, reel, objects, store, balloon }: TownReelRigProps) {
  const car = useRef<THREE.Group>(null);
  const wheels = useRef<(THREE.Object3D | null)[]>([]);
  const bursts = useRef<VoxelBursts | null>(null);
  const st = useRef({ last: -1, spin: 0, shake: 0 });
  const cutOf = useMemo(() => new Map(reel.cuts.filter((c) => c.stage === stage).map((c) => [c.from, c])), [reel, stage]);
  // Worked out once per building / per cut, on first use.
  const streets = useRef(new Map<number, [number, number]>());
  const victims = useRef(new Map<ReelCut, Target | null>());
  const pose = (x: number, z: number, yaw: number, speed: number, dt: number) => {
    const g = car.current;
    if (!g) return;
    g.visible = true;
    g.position.set(x, 0, z);
    g.rotation.set(0, yaw, 0);
    st.current.spin += (speed * dt) / (WHEEL.radius * M_TO_UNIT);
    WHEELS.forEach((w, i) => {
      const o = wheels.current[i];
      if (!o) return;
      o.position.set(w.x * M_TO_UNIT, (WHEEL.connectionY - WHEEL.restLength) * M_TO_UNIT, w.z * M_TO_UNIT);
      _q.setFromAxisAngle(_axisY, w.x < 0 ? Math.PI : 0);
      _spin.setFromAxisAngle(_axisX, st.current.spin * (w.x < 0 ? -1 : 1));
      o.quaternion.copy(_q).multiply(_spin);
    });
  };

  useFrame((three, delta) => {
    const dt = Math.min(delta, 0.05);
    const beat = beatOf(clock);
    const prev = st.current.last;
    st.current.last = beat;
    const fx = beat !== prev;
    const { shot, t } = shotFor(reel.shots, stage, Math.max(0, beat), 1);
    const cut = cutOf.get(shot.start);
    if (!cut) return;
    const p = cut.params;
    const by = typeof p.by === "string" ? p.by : undefined;
    const streetOf = (b: Target) => {
      if (!streets.current.has(b.i)) streets.current.set(b.i, streetSide(objects, b.x, b.z));
      return streets.current.get(b.i)!;
    };
    const victimOf = (c: ReelCut) => {
      if (!victims.current.has(c)) {
        const list = (Array.isArray(c.params.victims) ? c.params.victims : [])
          .map((l) => targetOf(store, l))
          .filter((x): x is Target => !!x)
          .sort((a, b) => b.floors * b.floorH - a.floors * a.floorH);
        const i = typeof c.params.i === "number" ? c.params.i : 0;
        victims.current.set(c, list.length ? list[i % list.length] : null);
      }
      return victims.current.get(c)!;
    };
    /** All of a building's floors down over `secs` from `at` into the cut, `by`'s name on the rubble. */
    const fall = (b: Target, t: number, at: number, secs: number, blast: boolean) => {
      if (!fx || t < at) return;
      if (blast) {
        bursts.current?.burst(b.x, 6, b.z, { count: 70, speed: 55, colors: FIRE, size: 3.2, life: 0.8 });
        st.current.shake = 1.4;
      }
      const due = Math.min(b.floors, Math.ceil(((t - at) / secs) * b.floors));
      const cols = store.rowsOf(b.i).map((_, c) => c);
      let taken = b.floors - Math.max(...store.rowsOf(b.i));
      while (taken < due && store.standing(b.i) > 0) {
        store.hitColumns(b.i, cols, 1, Date.now(), by);
        taken++;
        // Short-lived, and none in the last third of a slow fall: the dust is down by the next cut.
        if (taken < b.floors * 0.66 || secs < 1) bursts.current?.burst(b.x, 3, b.z, { count: 16, speed: 36, colors: DEBRIS, size: Math.min(3, b.floorH * 0.45), life: 0.8 });
      }
      st.current.shake = Math.max(st.current.shake, 0.45);
    };
    const crossed = (s: number) => prev - shot.start < s && t >= s;
    if (car.current) car.current.visible = false;
    st.current.shake = Math.max(0, st.current.shake - dt * 2.5);
    let lens = 45;
    const H = (b: Target) => b.floors * b.floorH;
    const b = cut.kind === "montage-hit" ? victimOf(cut) : targetOf(store, p.login);
    if (!b) return;

    if (cut.kind === "tower") {
      const h = H(b);
      const u = smooth(Math.min(1, t / 1.7));
      const y = h * (0.35 + 0.55 * u);
      _pos.set(b.x + h * 0.55, y, b.z + h * 0.55);
      _look.set(b.x, y + h * 0.12, b.z);
      lens = 50;
    } else if (cut.kind === "collapse") {
      const h = H(b);
      const [ax, az] = streetOf(b);
      const runIn = LOT + 40;
      const s = Math.min(runIn + 30, SPEED * (t + (runIn - b.d / 2) / SPEED - RAM_AT));
      pose(b.x + ax * (runIn - s), b.z + az * (runIn - s), Math.atan2(-ax, -az), SPEED, dt);
      fall(b, t, RAM_AT, FALL_SLOW, crossed(RAM_AT));
      const push = smooth(Math.min(1, t / 1.6));
      _pos.set(b.x + ax * h * 0.9 + az * h * 0.35, 8 + h * 0.05, b.z + az * h * 0.9 - ax * h * 0.35);
      _look.set(b.x, h * (0.55 - 0.2 * push), b.z);
      lens = 55;
    } else if (cut.kind === "flag") {
      // Picked on its own (or the fall still settling): snap it to rubble with the flag in it.
      if (store.standing(b.i) > 0 || (by && store.demolishedBy.get(b.i) !== by)) {
        store.setRows(b.i, store.rowsOf(b.i).map(() => 0), Date.now(), undefined, false);
        if (by) store.setBy(b.i, by);
      }
      // The whole flag as the game plants it, from a little above so the cloth reads against the rubble.
      const fxp = b.x - b.w * 0.3 + 6;
      const k = 1 - 0.15 * smooth(Math.min(1, t / 1.5));
      _pos.set(fxp + 18 * streetOf(b)[0], 36, b.z + 70 * k);
      _look.set(fxp, 7, b.z);
      lens = 40;
    } else if (cut.kind === "montage-hit") {
      fall(b, t, HIT_AT, FALL_FAST, crossed(HIT_AT));
      const h = H(b);
      const a = 0.8 + shot.start * 1.7;
      const d = h * 0.45 + 40;
      _pos.set(b.x + Math.sin(a) * d, h * 1.5 + 90, b.z + Math.cos(a) * d);
      _look.set(b.x, h * 0.25, b.z);
    } else if (cut.kind === "intact" || cut.kind === "circle" || cut.kind === "pull-off") {
      // Looking a little down at the roof, so the engine keeps drawing its items.
      const h = H(b);
      const turn = cut.kind === "intact" ? 0.4 + 0.5 * smooth(Math.min(1, t / 2.5)) : cut.kind === "circle" ? 0.9 + 0.08 * t : 1.2 + 0.05 * t;
      const dist = cut.kind === "pull-off" ? h * (1.6 + 0.5 * smooth(Math.min(1, t / 3))) : h * 1.5;
      _pos.set(b.x + Math.sin(turn) * dist, h * 1.3, b.z + Math.cos(turn) * dist);
      _look.set(b.x, h * 0.75, b.z);
    } else return;

    const k = st.current.shake;
    if (k > 0) {
      const n = performance.now() / 1000;
      _pos.x += Math.sin(n * 71) * 2 * k;
      _pos.y += Math.cos(n * 53) * 1.5 * k;
    }
    const camera = three.camera as THREE.PerspectiveCamera;
    if (camera.fov !== lens) {
      camera.fov = lens;
      camera.updateProjectionMatrix();
    }
    camera.position.copy(_pos);
    camera.lookAt(_look);
    camera.updateMatrixWorld();

    // The balloon over its building, written only by the town on screen.
    const now = cutAt(reel, Math.max(0, beat));
    if (now.cut.stage !== stage) return;
    const bi = reel.balloons.findIndex((x) => beat >= x.from && (beat < x.to || (beat < x.to + 0.4 && now.cut.from < x.to)));
    const ball = reel.balloons[bi];
    const over = ball && ball.target !== "example" ? targetOf(store, ball.target.login) : null;
    if (!ball || !over) return placeBalloon(balloon.current, -1, null);
    _pin.set(over.x, H(over), over.z).project(camera);
    const roof = { x: (_pin.x + 1) / 2, y: (1 - _pin.y) / 2 };
    _pin.set(over.x, H(over) + 6, over.z).project(camera);
    placeBalloon(balloon.current, bi, {
      left: ((_pin.x + 1) / 2) * 100,
      top: ((1 - _pin.y) / 2) * 100,
      opacity: Math.min(1, (beat - ball.from) / 0.2) * Math.max(0, Math.min(1, 1 - (beat - ball.to) / 0.4)),
      badges: ball.badges.map((x) => x.at),
      t: beat,
      roof,
    });
  });

  return (
    <>
      <group ref={car} visible={false}>
        <Suspense fallback={null}>
          <CarModel color={CAR_COLOR} wheelRefs={wheels} />
        </Suspense>
      </group>
      <Bursts ref={bursts} />
    </>
  );
}
