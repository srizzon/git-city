"use client";

import { Suspense, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import CarModel from "@/components/league/drive/CarModel";
import { Bursts, FIRE, Missile, type VoxelBursts } from "@/components/league/drive/Voxels";
import { M_TO_UNIT, TURBO, WHEEL } from "@/lib/league-city/drive/tuning";
import { WHEELS } from "@/lib/league-city/drive/vehicle";
import { LANE } from "@/lib/league-city/intro";
import { RAMP_BIG } from "@/lib/league-city/ramp";
import type { SmashStore } from "@/lib/league-city/smash";
import LeagueCrown3D from "@/components/LeagueCrown3D";
import TownMonument, { type MonumentTown } from "@/components/towns/TownMonument";
import {
  BEAT,
  BOOST_HIT,
  CORNER_HIT,
  DRIFT_ARC,
  DRIFT_IN,
  DRIFT_LEAD,
  REV_LAUNCH,
  MISSILE_HIT,
  momentOf,
  BLASTS,
  LOT,
  shotFor as teaserShotFor,
  type SmashRun,
  type Stage,
} from "@/lib/trailer/towns/teaser";
import { beatOf, type FilmClock } from "@trailer-kit/clock";

// One town's camera and car for the Towns teaser (lib/trailer/towns/teaser): it reads the
// shared clock every frame and plays whichever of this town's shots is under
// way, or holds the next one on its first frame while the other town is on
// screen. The smashing goes through the same store the game draws.

const DEBRIS = ["#1c2233", "#2a3147", "#ffd76a", "#ffe9a8", "#8fa3c7", "#3a4462"];
const CHUNK = ["#141a2a"];

/** Arrival: the car crosses under the arch this long into the shot (s). */
const CROSS = 1.0;
const ARRIVAL_SPEED = 55;
const INVADE_SPEED = 62;
/** The long lens on the wheel from across the street, and how wide it opens for the launch. */
const REV_DIST = 24;
const REV_FOV = 11;
const REV_WIDE = 30;
const BASE_FOV = 50;
const REV_ACCEL = 150;
const SMOKE = ["#d9d6de", "#bdb9c4", "#ece9ef", "#a7a2b0"];
/** Drift: corner radius and speed (units). */
const DRIFT_R = 30;
const DRIFT_SPEED = 55;
/** Jump take: the big ramp on Claude's avenue (world z), the boosted speed, when the car reaches the ramp's foot (s), gravity. */
const RAMP_Z = -11 * LOT;
const JUMP_SPEED = 95;
const JUMP_FOOT = 0.45;
const JUMP_G = 55;
/** Boost take: the pad on Codex's avenue (world z), cruising speed and the kick (units/s, units/s²). */
const BOOST_PAD_Z = -6 * LOT;
const BOOST_CRUISE = 45;
const BOOST_KICK = 90;
/** Missile take: both cars' speed, and the flip (launch speed, gravity, time in the air). */
const MISSILE_SPEED = 48;
const FLIP_UP = 30;
const FLIP_G = 70;
const FLIP_AIR = 0.85;
/** Implosion: one floor off every column this often (s). */
const FLOOR_EVERY = 0.025;
/** The monument, scaled to the town (its plaza size is far bigger), its height, and how far in front of the mascot it stands. */
const MONUMENT_SIZE = 0.16;
const MONUMENT_H = 100;
const MONUMENT_AHEAD = 150;

const _pos = new THREE.Vector3();
const _look = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _spin = new THREE.Quaternion();
const _axisX = new THREE.Vector3(1, 0, 0);
const _axisY = new THREE.Vector3(0, 1, 0);

const smooth = (u: number) => u * u * (3 - 2 * u);

/**
 * The drift path at t: up the main street (x0, north), round a corner of
 * DRIFT_R (dir 1 right, −1 left), then down the cross street. `slip` is how
 * far the tail swings out; `v` is the progress round the corner (0 to 1).
 */
function driftAt(t: number, x0: number, zTurn: number, dir: number, R = DRIFT_R, lead = DRIFT_IN) {
  const arcEnd = lead + DRIFT_ARC;
  let x: number, z: number, heading: number;
  if (t < lead) {
    x = x0;
    z = zTurn + DRIFT_SPEED * (lead - t);
    heading = Math.PI;
  } else if (t < arcEnd) {
    const phi = ((t - lead) / DRIFT_ARC) * (Math.PI / 2);
    x = x0 + dir * (R - R * Math.cos(phi));
    z = zTurn - R * Math.sin(phi);
    heading = Math.PI - dir * phi;
  } else {
    x = x0 + dir * (R + DRIFT_SPEED * (t - arcEnd));
    z = zTurn - R;
    heading = Math.PI - (dir * Math.PI) / 2;
  }
  const v = (t - lead) / DRIFT_ARC;
  const slip =
    0.75 *
    smooth(Math.min(1, Math.max(0, v / 0.22))) *
    (1 - smooth(Math.min(1, Math.max(0, (v - 0.85) / 0.45))));
  return { x, z, heading, slip, v };
}

export default function TownsRig({
  stage,
  clock,
  h,
  gateZ,
  revZ,
  run,
  store,
  homeColor,
  rivalColor,
  attacker,
  shotFor = teaserShotFor,
  blasts = BLASTS,
  hero,
  mascot,
  monument = null,
  riseFrom = 0,
  ramHit = 5,
}: {
  stage: Stage;
  clock: FilmClock;
  h: number;
  /** World z of the portal. */
  gateZ: number;
  /** Where the burnout car waits on the main street (a plain stretch of road). */
  revZ: number;
  run: SmashRun | null;
  store: SmashStore;
  /** This town's side: the arrival car. */
  homeColor: string;
  /** The other side: the car that breaks this town. */
  rivalColor: string;
  /** Planted on the rubble when the tower falls. */
  attacker: string;
  /** The film's shot under way at a beat (the teaser's by default). */
  shotFor?: typeof teaserShotFor;
  /** The film's flash beats (the teaser's by default). */
  blasts?: readonly number[];
  /** The building the floor, grow and crown shots are about (a login). */
  hero?: string;
  /** Where the giant mascot stands (world x, z). */
  mascot?: [number, number];
  /** The town the monument shot shows winning, if any. */
  monument?: MonumentTown | null;
  /** Rise: the share of its floors every building starts from. */
  riseFrom?: number;
  /** Ram: the car reaches the tower this many beats into the take. */
  ramHit?: number;
}) {
  const camera = useThree((s) => s.camera);
  const home = useRef<THREE.Group>(null);
  const rival = useRef<THREE.Group>(null);
  const homeWheels = useRef<(THREE.Object3D | null)[]>([]);
  const rivalWheels = useRef<(THREE.Object3D | null)[]>([]);
  const bursts = useRef<VoxelBursts | null>(null);
  const missile = useRef<THREE.Group>(null);
  const st = useRef({ last: -1, shake: 0, spin: 0, amp: 1 });
  const crown = useRef<THREE.Group>(null);
  const monumentRef = useRef<THREE.Group>(null);
  const heroIndex = useMemo(() => (hero ? store.index.get(hero.toLowerCase()) : undefined), [hero, store]);

  // The tower is the run's last (tallest) building.
  const tower = useMemo(
    () => (run ? store.index.get(run.buildings[run.buildings.length - 1].loginLower) : undefined),
    [run, store],
  );
  const cityZ = ((-2 * h + 1) * LOT) / 2;
  const width = (2 * h + 1) * LOT;
  const side = run && run.x > 0 ? -1 : 1;

  const pose = (
    g: THREE.Group | null,
    wheels: (THREE.Object3D | null)[],
    x: number,
    z: number,
    speed: number,
    dt: number,
    /** How fast the wheels turn (units/s), when it isn't the car's speed (a burnout). */
    wheelSpeed = speed,
    /** Body bounce (units) and squat (radians). */
    bob = 0,
    squat = 0,
    /** Heading: π faces north (−z), 0 faces south (+z). */
    yaw = Math.PI,
  ) => {
    if (!g) return;
    g.visible = true;
    g.position.set(x, bob, z);
    g.rotation.set(squat, yaw, 0);
    st.current.spin += (wheelSpeed * dt) / (WHEEL.radius * M_TO_UNIT);
    WHEELS.forEach((w, i) => {
      const o = wheels[i];
      if (!o) return;
      o.position.set(
        w.x * M_TO_UNIT,
        (WHEEL.connectionY - WHEEL.restLength) * M_TO_UNIT,
        w.z * M_TO_UNIT,
      );
      _q.setFromAxisAngle(_axisY, w.x < 0 ? Math.PI : 0);
      _spin.setFromAxisAngle(_axisX, st.current.spin * (w.x < 0 ? -1 : 1));
      o.quaternion.copy(_q).multiply(_spin);
    });
  };

  const burst = (x: number, y: number, z: number, floorH: number, big: boolean, chunk = 0.85) => {
    bursts.current?.burst(x, y, z, {
      count: 1,
      speed: 22,
      colors: CHUNK,
      size: floorH * chunk,
      life: 1.6,
      gravity: 60,
    });
    bursts.current?.burst(x, y, z, {
      count: big ? 22 : 8,
      speed: big ? 38 : 24,
      colors: DEBRIS,
      size: Math.min(2.2, floorH * 0.3),
      life: 1.1,
    });
  };

  const smash = (
    x: number,
    z: number,
    r: number,
    rows: number,
    cooldown: number,
    big: boolean,
    chunk = 0.85,
  ) => {
    const hits = store.hitCircle(x, z, r, rows, Date.now(), cooldown, attacker);
    for (const hit of hits)
      burst(hit.x, hit.y, hit.z, store.targets[hit.target].floorH, big, chunk);
    if (hits.length) st.current.shake = Math.max(st.current.shake, big ? 1 : 0.35);
  };

  useFrame((three, delta) => {
    const dt = Math.min(delta, 0.05);
    const beat = beatOf(clock);
    const prev = st.current.last;
    st.current.last = beat;
    const crossed = (b: number) => prev < b && beat >= b;
    // Particles only while the film moves: a paused frame stays as it is.
    const fx = beat !== prev ? bursts.current : null;
    const { shot, t } = shotFor(stage, Math.max(0, beat));
    if (home.current) home.current.visible = false;
    if (rival.current) rival.current.visible = false;
    if (missile.current) missile.current.visible = false;
    if (crown.current) crown.current.visible = false;
    if (monumentRef.current) monumentRef.current.visible = false;
    st.current.shake = Math.max(0, st.current.shake - dt * 2.2);

    st.current.amp = 1;
    let lens = BASE_FOV;
    /** Every building whole but `except` (a take that shows the town up, whatever came before it). */
    const wholeTown = (...except: (number | undefined)[]) => {
      const now = Date.now();
      store.targets.forEach((target, i) => {
        if (except.includes(i)) return;
        store.setRows(i, store.rowsOf(i).map(() => target.floors), now, undefined, false);
      });
    };
    /** Aims right of the subject by `k` of the distance, so it sits left of centre. */
    const leaveRight = (k: number) => {
      const dx = _look.x - _pos.x;
      const dz = _look.z - _pos.z;
      const d = Math.hypot(dx, dz) || 1;
      _look.x += (-dz / d) * d * k;
      _look.z += (dx / d) * d * k;
    };
    if (shot.kind === "rev") {
      // Burnout, seen from the side on a long lens: the car waits on the main
      // street facing the exit, the rear wheel spins up in its own smoke and
      // the body shakes; then it launches to the left of the frame, trailing
      // smoke, and the camera travels with it. The camera looks west, so the
      // sky and the open lots are behind the car, and south is screen left.
      const zPark = revZ;
      const x = -LANE;
      // Facing south (rotation 0), local (x, z) is world (x, z); the east-side rear wheel faces the camera.
      const wheel = WHEELS[2];
      const wx = x + wheel.x * M_TO_UNIT;
      const out = 1;
      const u = Math.max(0, t - REV_LAUNCH);
      const zCar = zPark + 0.5 * REV_ACCEL * u * u;
      const wz = zCar + wheel.z * M_TO_UNIT;
      if (t < REV_LAUNCH) {
        const k = t / REV_LAUNCH;
        pose(
          home.current,
          homeWheels.current,
          x,
          zPark,
          0,
          dt,
          25 + 170 * k * k,
          0.05 * Math.sin(t * 70) * (0.4 + k),
          0.025 * k,
          0,
        );
        fx?.burst(wx, 0.5, wz - 0.9, {
          count: 1,
          speed: 1 + 1.5 * k,
          colors: SMOKE,
          size: 0.28 + 0.27 * k,
          life: 1.0,
          gravity: -1.5,
          flat: 0.6,
        });
        st.current.shake = Math.max(st.current.shake, 0.06 + 0.12 * k);
      } else {
        const speed = REV_ACCEL * u;
        pose(
          home.current,
          homeWheels.current,
          x,
          zCar,
          speed,
          dt,
          speed + 60,
          0,
          -0.04 * Math.max(0, 1 - u * 3),
          0,
        );
        // The smoke trails the wheel as it goes.
        if (u < 0.6)
          fx?.burst(wx, 0.5, wz - 0.9, {
            count: 1,
            speed: 2,
            colors: SMOKE,
            size: 0.45,
            life: 0.8,
            gravity: -1.5,
            flat: 0.6,
          });
        if (u < 0.3) st.current.shake = Math.max(st.current.shake, 0.5 * (1 - u / 0.3));
      }
      // From across the street: the wheel low in the frame, a strip of road
      // under it. After the launch the camera travels with the car, a little
      // slower, pulling back and widening, so it runs off to the left.
      const chase = smooth(Math.min(1, u / 0.35));
      const zRest = zPark + wheel.z * M_TO_UNIT;
      const zCam = zRest - 0.6 + (zCar - zPark) * 0.8;
      _pos.set(wx + out * (REV_DIST + 3 * chase), 1.3 + 1.5 * chase, zCam);
      _look.set(wx, 1.7 + 0.8 * chase, zCam + 0.6);
      lens = REV_FOV + (REV_WIDE - REV_FOV) * chase;
      st.current.amp = 0.22;
    } else if (shot.kind === "revback") {
      // The opening, split screen: each town's car from low behind, both
      // rear wheels spinning in their smoke, then both launch on the hit.
      const zPark = revZ;
      const u = Math.max(0, t - REV_LAUNCH);
      const zCar = zPark - 0.5 * REV_ACCEL * u * u;
      const k = Math.min(1, t / REV_LAUNCH);
      if (t < REV_LAUNCH)
        pose(
          home.current,
          homeWheels.current,
          LANE,
          zPark,
          0,
          dt,
          25 + 170 * k * k,
          0.05 * Math.sin(t * 70) * (0.4 + k),
          -0.03 * k,
        );
      else
        pose(
          home.current,
          homeWheels.current,
          LANE,
          zCar,
          REV_ACCEL * u,
          dt,
          REV_ACCEL * u + 60,
          0,
          0.05 * Math.max(0, 1 - u * 3),
        );
      for (const w of [WHEELS[2], WHEELS[3]]) {
        const wx = LANE - w.x * M_TO_UNIT;
        const wz = (t < REV_LAUNCH ? zPark : zCar) - w.z * M_TO_UNIT;
        if (t < REV_LAUNCH + 0.4)
          fx?.burst(wx, 0.5, wz + 0.8, {
            count: 1,
            speed: 1.5 + 2 * k,
            colors: SMOKE,
            size: 0.5 + 0.5 * k,
            life: 1.1,
            gravity: -1.5,
            flat: 0.6,
          });
      }
      st.current.shake = Math.max(
        st.current.shake,
        t < REV_LAUNCH ? 0.08 + 0.12 * k : 0.5 * Math.max(0, 1 - u / 0.3),
      );
      // Low behind the car; it eases forward a little when the car goes.
      const go = smooth(Math.min(1, u / 0.4));
      _pos.set(LANE, 2.4 + 0.6 * go, zPark + 17 - 3 * go);
      _look.set(LANE, 2.8, zPark - 30);
      lens = 46;
      st.current.amp = 0.3;
    } else if (shot.kind === "cornersmash" && run) {
      // Drifting round a corner into a Codex building: the orange car comes
      // up the main street, slides through a right turn and cuts through the
      // building's corner, then keeps going along its side, the floors
      // bursting over the hood. Seen from the car's own chase camera.
      const i = store.index.get(run.buildings[2].loginLower);
      if (i !== undefined) {
        const b = store.targets[i];
        const px = b.x - b.w / 2 + 7;
        const pz = b.z - b.d / 2 + 7;
        const R = px - LANE;
        const zTurn = pz + R;
        const p = driftAt(t, LANE, zTurn, 1, R);
        const yaw = p.heading - p.slip;
        pose(rival.current, rivalWheels.current, p.x, p.z, DRIFT_SPEED, dt, DRIFT_SPEED, 0, 0, yaw);
        if (rival.current) rival.current.rotation.z = -0.05 * p.slip;
        if (p.slip > 0.15)
          for (const w of [WHEELS[2], WHEELS[3]]) {
            const lx = w.x * M_TO_UNIT;
            const lz = w.z * M_TO_UNIT;
            fx?.burst(
              p.x + lx * Math.cos(yaw) + lz * Math.sin(yaw),
              0.6,
              p.z - lx * Math.sin(yaw) + lz * Math.cos(yaw),
              {
                count: 1,
                speed: 2.5,
                colors: SMOKE,
                size: 0.9,
                life: 1.1,
                gravity: -1.2,
                flat: 0.6,
              },
            );
          }
        if (fx) smash(p.x, p.z, 4, 2, 150, false, 0.35);
        if (crossed(momentOf(shot, CORNER_HIT))) {
          smash(p.x, p.z, 11, 4, 0, true, 0.35);
          fx?.burst(p.x, 4, p.z, { count: 30, speed: 30, colors: FIRE, size: 1.8, life: 0.8 });
          st.current.shake = 1;
        }
        // The chase camera: behind along the direction of travel (so the slide shows), up, looking ahead.
        const fxz = Math.sin(p.heading);
        const fzz = Math.cos(p.heading);
        _pos.set(p.x - fxz * 24, 13, p.z - fzz * 24);
        _look.set(p.x + fxz * 10, 3, p.z + fzz * 10);
        lens = 56;
        st.current.amp = 0.45;
      }
    } else if (shot.kind === "drift" || shot.kind === "topdrift") {
      // Round a corner sideways: the car comes up the main street, throws the
      // tail out and slides through the turn in its own smoke, the
      // mini-turbo sparks going blue, orange, purple, then straightens out
      // down the cross street. "drift": a right turn at the first cross
      // street, the camera low on the outside of the corner. "topdrift": a
      // left turn further up, from the game's top-down camera.
      const top = shot.kind === "topdrift";
      const dir = top ? -1 : 1;
      const zTurn = (top ? -7 : -3) * LOT - 12;
      const x0 = LANE;
      const lead = top ? DRIFT_IN : DRIFT_LEAD;
      const p = driftAt(t, x0, zTurn, dir, DRIFT_R, lead);
      const yaw = p.heading - dir * p.slip;
      pose(home.current, homeWheels.current, p.x, p.z, DRIFT_SPEED, dt, DRIFT_SPEED, 0, 0, yaw);
      if (home.current) home.current.rotation.z = -0.05 * dir * p.slip;
      if (p.slip > 0.15) {
        const colors = [TURBO.colors[p.v < 0.35 ? 1 : p.v < 0.7 ? 2 : 3]];
        for (const w of [WHEELS[2], WHEELS[3]]) {
          const lx = w.x * M_TO_UNIT;
          const lz = w.z * M_TO_UNIT;
          const px = p.x + lx * Math.cos(yaw) + lz * Math.sin(yaw);
          const pz = p.z - lx * Math.sin(yaw) + lz * Math.cos(yaw);
          fx?.burst(px, 0.6, pz, {
            count: 1,
            speed: 2.5,
            colors: SMOKE,
            size: (top ? 1.3 : 0.7) + 0.5 * p.slip,
            life: 1.1,
            gravity: -1.2,
            flat: 0.6,
          });
          fx?.burst(px, 0.4, pz, {
            count: 1,
            speed: 4,
            colors,
            size: top ? 0.8 : 0.35,
            life: 0.22,
            gravity: 20,
          });
        }
        st.current.shake = Math.max(st.current.shake, 0.12);
      }
      if (top) {
        // High above and a little behind, turning with the car's heading (the drive's top camera, closer in).
        const fxz = Math.sin(p.heading);
        const fzz = Math.cos(p.heading);
        _pos.set(p.x - fxz * 16, 68, p.z - fzz * 16);
        _look.set(p.x + fxz * 6, 0, p.z + fzz * 6);
        lens = 46;
        st.current.amp = 0.2;
      } else {
        // The chase camera, close behind at speed (the way the cars left the
        // opening), but slow to turn: when the car throws the drift the
        // camera's heading lags a quarter second, so the car slides sideways
        // across the lens and shows its flank.
        const lag = driftAt(Math.max(0, t - 0.28), x0, zTurn, dir, DRIFT_R, lead);
        const fxz = Math.sin(lag.heading);
        const fzz = Math.cos(lag.heading);
        _pos.set(p.x - fxz * 14, 4.2, p.z - fzz * 14);
        _look.set(p.x + fxz * 10, 2.4, p.z + fzz * 10);
        lens = 52;
        st.current.amp = 0.4;
      }
    } else if (shot.kind === "jump") {
      // Down the avenue on a boost, up the big ramp and into the sky toward
      // the giant mascot, seen from low beside the ramp's lip: the car
      // crosses the frame right to left against the sky.
      const lip = RAMP_Z - RAMP_BIG.length / 2;
      const foot = RAMP_Z + RAMP_BIG.length / 2;
      const zAt = (tt: number) => foot + JUMP_SPEED * (JUMP_FOOT - tt);
      const z = zAt(t);
      let y = 0;
      let pitch = 0;
      const slope = RAMP_BIG.height / RAMP_BIG.length;
      if (z <= foot && z > lip) {
        y = (foot - z) * slope;
        pitch = -Math.atan(slope);
      } else if (z <= lip) {
        const tl = JUMP_FOOT + RAMP_BIG.length / JUMP_SPEED;
        const air = t - tl;
        const vy = JUMP_SPEED * slope;
        y = Math.max(0, RAMP_BIG.height + vy * air - 0.5 * JUMP_G * air * air);
        pitch = -Math.atan((vy - JUMP_G * air) / JUMP_SPEED) * 0.8;
      }
      pose(home.current, homeWheels.current, 0, z, JUMP_SPEED, dt, JUMP_SPEED, y, pitch);
      // The boost flame behind it.
      fx?.burst(0, y + 1.2, z + 5, {
        count: 2,
        speed: 3,
        colors: [TURBO.colors[1], "#ffffff", TURBO.colors[2]],
        size: 0.9,
        life: 0.35,
        gravity: 0,
      });
      // Low beside the lip, looking up and across; the aim follows the car a little.
      _pos.set(-58, 2.5, lip - 6);
      _look.set(0, 12 + y * 0.6, lip - 12 - (lip - z) * 0.6);
      lens = 34;
      st.current.amp = 0.3;
    } else if (shot.kind === "boost") {
      // Over a boost pad on the avenue: the car kicks from cruising to full
      // boost with a flame out the back, the lens opens and the camera
      // falls back, then catches up.
      const hit = BOOST_HIT * BEAT;
      const zAt = (tt: number) =>
        tt < hit
          ? BOOST_PAD_Z + BOOST_CRUISE * (hit - tt)
          : BOOST_PAD_Z - BOOST_CRUISE * (tt - hit) - 0.5 * BOOST_KICK * (tt - hit) ** 2;
      const z = zAt(t);
      const u = Math.max(0, t - hit);
      const speed = t < hit ? BOOST_CRUISE : BOOST_CRUISE + BOOST_KICK * u;
      pose(
        home.current,
        homeWheels.current,
        0,
        z,
        speed,
        dt,
        speed,
        0,
        t >= hit ? -0.05 * Math.exp(-u * 6) : 0,
      );
      if (t >= hit) {
        fx?.burst(0, 1.2, z + 5, {
          count: 3,
          speed: 4,
          colors: [TURBO.colors[1], "#ffffff", TURBO.colors[3]],
          size: 1,
          life: 0.3,
          gravity: 0,
        });
        if (crossed(momentOf(shot, BOOST_HIT))) st.current.shake = 0.7;
      }
      // The camera trails at its own speed: it falls back on the kick, then closes in.
      const lag = t < hit ? 0 : 18 * (1 - Math.exp(-u * 5)) * Math.exp(-u * 1.2);
      _pos.set(4, 4.5, z + 17 + lag);
      _look.set(0, 3.5, z - 30);
      lens = 50 + 26 * (t < hit ? 0 : Math.exp(-u * 1.5) * (1 - Math.exp(-u * 12)));
      st.current.amp = 0.5;
    } else if (shot.kind === "missile" || shot.kind === "missileout") {
      // "missile": this town's car fires on the visitor; "missileout": the
      // visitor fires on this town's car.
      const out = shot.kind === "missileout";
      const shooter = out ? rival.current : home.current;
      const shooterWheels = out ? rivalWheels.current : homeWheels.current;
      const victim = out ? home.current : rival.current;
      const victimWheels = out ? homeWheels.current : rivalWheels.current;
      // The blue car fires on the orange one up the street: a missile with a
      // smoke tail, a fireball on the hit, and the orange car flips through
      // the air. The camera rides behind and beside the shooter.
      const z0 = revZ + 60;
      const zo = z0 - MISSILE_SPEED * t;
      const zb = zo + 22;
      const xo = LANE;
      const xb = -5;
      const fire = 1 * BEAT;
      const hit = MISSILE_HIT * BEAT;
      pose(shooter, shooterWheels, xb, zb, MISSILE_SPEED, dt);
      if (t < fire) pose(victim, victimWheels, xo, zo, MISSILE_SPEED, dt);
      if (t >= fire && t < hit && missile.current) {
        const u = (t - fire) / (hit - fire);
        const sx = xb,
          sz = zb - 5,
          sy = 2.2;
        const mx = sx + (xo - sx) * u;
        const mz = sz + (zo - sz) * u;
        const my = sy + 1.5 * Math.sin(Math.PI * u);
        missile.current.visible = true;
        missile.current.position.set(mx, my, mz);
        missile.current.lookAt(xo, 1.5, zo);
        fx?.burst(mx, my, mz + 1.5, {
          count: 2,
          speed: 2,
          colors: SMOKE,
          size: 0.9,
          life: 0.7,
          gravity: -2,
        });
      }
      if (t < hit) {
        if (t >= fire) pose(victim, victimWheels, xo, zo, MISSILE_SPEED, dt);
      } else {
        // Blown up and over: up, forward, tumbling, down on its roof.
        const u = t - hit;
        const zHit = z0 - MISSILE_SPEED * hit;
        const air = Math.min(u, FLIP_AIR);
        const y = Math.max(0, FLIP_UP * air - 0.5 * FLIP_G * air * air);
        const zf =
          zHit -
          MISSILE_SPEED * 0.6 * air -
          12 * Math.max(0, u - FLIP_AIR) * Math.exp(-(u - FLIP_AIR) * 3);
        pose(victim, victimWheels, xo + 4 * air, zf, 0, dt, 30, y);
        if (victim) {
          const spin = Math.min(u, FLIP_AIR) / FLIP_AIR;
          victim.rotation.set(-Math.PI * spin, Math.PI + 0.6 * spin, 0.9 * spin);
        }
        if (crossed(momentOf(shot, MISSILE_HIT))) {
          fx?.burst(xo, 2, zHit, {
            count: 70,
            speed: 40,
            colors: FIRE,
            size: 2.4,
            life: 1.0,
          });
          fx?.burst(xo, 2, zHit, {
            count: 25,
            speed: 18,
            colors: ["#2a2a30", "#3a3a44"],
            size: 2.8,
            life: 1.6,
            gravity: -6,
          });
          st.current.shake = 1.2;
        }
        if (u < 1.2)
          fx?.burst(xo + 4 * air, y + 1.5, zf, {
            count: 1,
            speed: 3,
            colors: ["#2a2a30", "#4a4a54"],
            size: 1.4,
            life: 1,
            gravity: -5,
          });
      }
      // Low, behind and right of the shooter, moving with both cars.
      _pos.set(xb + 9, 3, zb + 12);
      _look.set(1, 2.2, zo + 4);
      lens = 44;
      st.current.amp = 0.5;
    } else if (shot.kind === "arrival" || shot.kind === "arrivalout") {
      if (shot.kind === "arrivalout") wholeTown();
      // Under the town's arch: its own car coming home, or ("arrivalout") the visitor coming in.
      const z = gateZ + ARRIVAL_SPEED * (CROSS - t);
      if (shot.kind === "arrival") pose(home.current, homeWheels.current, LANE, z, ARRIVAL_SPEED, dt);
      else pose(rival.current, rivalWheels.current, LANE, z, ARRIVAL_SPEED, dt);
      // Low behind the car, pushing in a little, the arch and the town above it.
      const back = 30 - 6 * smooth(Math.min(1, t / 1.4));
      _pos.set(LANE - 5, 6.5, z + back);
      _look.set(LANE, 9, z - 70);
    } else if (shot.kind === "aerial") {
      // Slow orbit, the two towns turned toward each other across the split.
      wholeTown();
      const a = (stage === "claude" ? -0.75 : 0.75) + (stage === "claude" ? 1 : -1) * 0.12 * t;
      const r = width * 0.5;
      _look.set(0, 30, cityZ);
      _pos.set(Math.sin(a) * r, r * 0.38, cityZ + Math.cos(a) * r);
    } else if (shot.kind === "invasion" && run) {
      const z = run.zs[0] + LOT * 0.9 - INVADE_SPEED * t;
      pose(rival.current, rivalWheels.current, run.x, z, INVADE_SPEED, dt);
      if (beat >= shot.start) {
        smash(run.x, z, 3.2, 2, 220, false);
        for (const b of blasts) {
          if (b < shot.start || b >= shot.end || !crossed(b)) continue;
          smash(run.x, z - 6, 24, 7, 0, true);
          fx?.burst(run.x, 6, z - 6, {
            count: 40,
            speed: 46,
            colors: FIRE,
            size: 2.6,
            life: 0.9,
          });
        }
      }
      // A wide, still frame from across the main street at an angle to the
      // first building: the car comes in, rams its base, the bomb goes off
      // and the floors blow out. It creeps in a little.
      const b0 = run.zs[0];
      const push = smooth(Math.min(1, t / 1.6));
      _pos.set(run.x - 112 + 12 * push, 12, b0 + 26 - 6 * push);
      _look.set(run.x, 30, b0 - 10);
      lens = 42;
    } else if (shot.kind === "floor" || shot.kind === "grow" || shot.kind === "crown") {
      // One building and its roof. "floor": the town stands low and a commit
      // slams a band of floors onto this one (the second take picks up where
      // the first left off). "grow": a dev's building gains two bands, a beat
      // apart. "crown": the building stands whole and the week's crown drops
      // onto it. The camera sits above the neighbours' roofs, looking at its top.
      if (heroIndex === undefined) return;
      const b = store.targets[heroIndex];
      if (shot.kind !== "floor") wholeTown(heroIndex);
      const now = Date.now();
      const n = Math.floor(t / BEAT);
      const pop = Math.min(1, (t - n * BEAT) / 0.08);
      let frac = 1;
      if (shot.kind === "floor") {
        const second = shot.name.endsWith("2");
        const from = second ? 0.45 : 0.3;
        frac = from + 0.15 * pop;
        store.targets.forEach((_, i) => {
          if (i === heroIndex) return;
          const rows = Math.round(store.targets[i].floors * riseFrom);
          store.setRows(i, store.rowsOf(i).map(() => rows), now, undefined, false);
        });
      } else if (shot.kind === "grow") {
        // Two pops, on the take's second and third beats.
        frac = n < 1 ? 0.7 : n < 2 ? 0.7 + 0.15 * pop : n < 3 ? 0.85 + 0.15 * pop : 1;
      }
      const rows = Math.max(1, Math.round(b.floors * frac));
      store.setRows(heroIndex, store.rowsOf(heroIndex).map(() => rows), now, undefined, false);
      const top = rows * b.floorH;
      const popping = shot.kind === "floor" || (shot.kind === "grow" && n >= 1 && n < 3);
      if (fx && pop < 1 && popping)
        fx.burst(b.x, top, b.z, { count: 3, speed: 14, colors: DEBRIS, size: 1.4, life: 0.5 });
      if (pop < 0.5 && popping) st.current.shake = Math.max(st.current.shake, 0.5);
      if (shot.kind === "crown" && crown.current) {
        // It drops from high above in a quarter beat, bounces once, then floats.
        const land = 0.5 * BEAT;
        const u = Math.min(1, t / land);
        const bounce = t > land ? 6 * Math.exp(-(t - land) * 8) * Math.abs(Math.sin((t - land) * 18)) : 0;
        crown.current.visible = true;
        crown.current.position.set(b.x, 220 * (1 - u) * (1 - u) + bounce, b.z);
        if (crossed(shot.start + 0.5)) {
          st.current.shake = 1;
          fx?.burst(b.x, top + 20, b.z, { count: 40, speed: 30, colors: ["#ffd24a", "#ffe9a8", "#ffb800"], size: 1.6, life: 0.9 });
        }
      }
      // Above the neighbours, off one corner, looking at the roof; the crown
      // take cranes up with it.
      const crowned = shot.kind === "crown";
      const crane = crowned ? smooth(Math.min(1, t / (4 * BEAT))) : 0;
      const r = Math.max(60, b.w * 2.2) * (crowned ? 1.8 : 1);
      _pos.set(b.x + r * 0.75, top + (crowned ? 5 : 10) + 20 * crane, b.z + r);
      _look.set(b.x, top + (crowned ? 26 : -8) + 6 * crane, b.z);
      lens = shot.kind === "crown" ? 46 : 42;
      st.current.amp = 0.4;
      // A day's take shares the frame with the board on the right: the building keeps to the left.
      if (shot.kind === "grow") leaveRight(0.4);
    } else if (shot.kind === "mascot" && mascot) {
      // The town's giant mascot from low in its square, every building up,
      // the camera easing in.
      wholeTown();
      const push = smooth(Math.min(1, t / (8 * BEAT)));
      const [mx, mz] = mascot;
      // Inside the square (seven lots across), so no building stands in between.
      _pos.set(mx + 25, 10, mz + 160 - 20 * push);
      _look.set(mx, 70, mz);
      lens = 62;
    } else if (shot.kind === "regrow" && run) {
      // They code too: the building the visitor drifted through on Thursday
      // stands broken for a beat, then its floors come back a band a beat, lit.
      const i = store.index.get(run.buildings[2].loginLower);
      if (i === undefined) return;
      wholeTown(i);
      const target = store.targets[i];
      const n = Math.floor(t / BEAT);
      const pop = Math.min(1, (t - n * BEAT) / 0.08);
      const frac = n < 1 ? 0.35 : 0.35 + 0.65 * Math.min(1, (n - 1 + pop) / 3);
      const rows = Math.round(target.floors * frac);
      store.setRows(i, store.rowsOf(i).map(() => rows), Date.now(), undefined, false);
      if (fx && pop < 1 && n >= 1)
        fx.burst(target.x, rows * target.floorH, target.z, { count: 4, speed: 12, colors: ["#8fa3c7", "#ffffff"], size: 1.4, life: 0.5 });
      const bz = run.zs[2];
      _pos.set(run.x + side * 110, 5, bz + 16);
      _look.set(run.x, 35, bz);
      lens = 50;
    } else if (shot.kind === "monument" && mascot && monumentRef.current) {
      // The week's monument goes up in the square in front of the mascot, in
      // two steps on the beat, seen from low in front.
      wholeTown();
      const [mx, mz] = mascot;
      const n = Math.min(2, Math.floor(t / BEAT) + 1);
      const pop = Math.min(1, (t - (n - 1) * BEAT) / 0.1);
      const up = Math.min(1, (n - 1 + pop) / 2);
      const g = monumentRef.current;
      g.visible = true;
      g.position.set(mx, -MONUMENT_H * (1 - up), mz + MONUMENT_AHEAD);
      if (pop < 0.5) st.current.shake = Math.max(st.current.shake, 0.6);
      const push = smooth(Math.min(1, t / (4 * BEAT)));
      // From up the main avenue, over its ramp, the street's buildings framing it.
      _pos.set(mx, 50, mz + MONUMENT_AHEAD + 240 - 30 * push);
      _look.set(mx, 50, mz + MONUMENT_AHEAD);
      lens = 50;
    } else if (shot.kind === "week") {
      // The week from above: on every beat a share of the town's buildings
      // gain a band of floors (people committing), each building three times
      // over the take, so the whole town grows toward whole by its end.
      const beats = shot.end - shot.start + shot.trim;
      const n = Math.floor(t / BEAT);
      const pop = Math.min(1, (t - n * BEAT) / 0.1);
      const now = Date.now();
      const pops = (i: number, k: number) => (i * 7 + k * 3) % 4 === 0;
      store.targets.forEach((target, i) => {
        let total = 0;
        let done = 0;
        for (let k = 0; k < beats; k++) {
          if (!pops(i, k)) continue;
          total++;
          if (k < n) done++;
          else if (k === n) done += pop;
        }
        const frac = total ? 0.55 + (0.45 * done) / total : 1;
        const rows = Math.round(target.floors * frac);
        store.setRows(i, store.rowsOf(i).map(() => rows), now, undefined, false);
        if (fx && pops(i, n) && pop < 1 && i % 3 === 0)
          fx.burst(target.x, rows * target.floorH, target.z, { count: 2, speed: 10, colors: ["#c8e64a", "#ffe9a8"], size: 1.6, life: 0.4 });
      });
      // Above the entrance, turned a little toward the split's middle, easing in.
      const push = smooth(Math.min(1, t / (beats * BEAT)));
      const a = stage === "claude" ? -0.45 : 0.45;
      const r = width * (0.42 - 0.06 * push);
      _look.set(0, 20, cityZ * 0.8);
      _pos.set(Math.sin(a) * r, r * 0.42, cityZ * 0.8 + Math.cos(a) * r);
      lens = 50;
    } else if (shot.kind === "ram" && run && tower !== undefined) {
      // One shot behind the visitor's car: in through the town's arch, up the
      // avenue on the tower's side, a turn into its base on the hit, and the
      // tower sinking in front of the stopped camera, down to its rubble and
      // the visitor's flag.
      const target = store.targets[tower];
      const hitT = ramHit * BEAT;
      const zf = target.z + target.d / 2;
      const z0 = gateZ + 40;
      const v = (z0 - zf) / hitT;
      const xl = Math.sign(run.x) * LANE;
      // Up the avenue, then into the tower's own row before its first
      // building, and straight on through the low ones to the tower.
      const turnZ = run.zs[0] + 60;
      const at = (tt: number) => {
        const z = tt < hitT ? z0 - v * tt : zf - 14 * (1 - Math.exp(-(tt - hitT) * 5));
        const u = Math.max(0, Math.min(1, (turnZ - z) / 45));
        return { x: xl + (target.x - xl) * smooth(u), z };
      };
      const p = at(t);
      const q = at(t + 0.02);
      const yaw = t < hitT ? Math.atan2(q.x - p.x, q.z - p.z) : Math.PI;
      pose(rival.current, rivalWheels.current, p.x, p.z, t < hitT ? v : 0, dt, t < hitT ? v : 0, 0, 0, yaw);
      // Through the low buildings of the row on the way: each goes down in a
      // tenth of a second as the car reaches it, in a burst of its floors.
      run.buildings.slice(0, -1).forEach((rb) => {
        const i = store.index.get(rb.loginLower);
        if (i === undefined) return;
        const b = store.targets[i];
        const reach = (z0 - (b.z + b.d / 2)) / v;
        const k = Math.max(0, Math.min(1, (t - reach + 0.04) / 0.08));
        store.setRows(i, store.rowsOf(i).map(() => Math.round(b.floors * (1 - k))), Date.now(), undefined, false);
        if (crossed(shot.start - shot.trim + reach / BEAT)) {
          fx?.burst(b.x, b.floorH * b.floors * 0.4, b.z + b.d / 2, { count: 40, speed: 36, colors: DEBRIS, size: 2.2, life: 1 });
          st.current.shake = Math.max(st.current.shake, 0.7);
        }
      });
      const hitBeat = shot.start - shot.trim + ramHit;
      const row = new Set(run.buildings.map((rb) => store.index.get(rb.loginLower)));
      store.targets.forEach((tg, i) => {
        if (!row.has(i)) store.setRows(i, store.rowsOf(i).map(() => tg.floors), Date.now(), undefined, false);
      });
      if (beat < hitBeat) store.setRows(tower, store.rowsOf(tower).map(() => target.floors), Date.now(), undefined, false);
      if (crossed(hitBeat)) {
        st.current.shake = 1.4;
        fx?.burst(target.x, 8, zf, { count: 90, speed: 55, colors: FIRE, size: 3, life: 1.2 });
      }
      if (beat >= hitBeat) {
        const due = Math.floor(((beat - hitBeat) * BEAT) / FLOOR_EVERY);
        const left = Math.max(0, target.floors - due);
        const was = store.standing(tower);
        store.setRows(tower, store.rowsOf(tower).map(() => left), Date.now(), undefined, false);
        if (left === 0) store.setBy(tower, attacker);
        if (fx && store.standing(tower) < was)
          fx.burst(target.x, 2, target.z, { count: 16, speed: 30, colors: DEBRIS, size: 2.4, life: 1.2 });
        if (left > 0) st.current.shake = Math.max(st.current.shake, 0.4);
      }
      // The chase camera, low behind the car; from the hit on it stops where
      // it was and looks up at the tower coming down.
      const c = at(Math.min(t, hitT - 0.25));
      const d = at(Math.min(t, hitT - 0.25) + 0.05);
      const len = Math.hypot(d.x - c.x, d.z - c.z) || 1;
      const fxz = (d.x - c.x) / len;
      const fzz = (d.z - c.z) / len;
      // Low behind the car, the tower ahead; after the hit it cranes up and
      // back, looking at the tower coming down.
      const after = smooth(Math.max(0, Math.min(1, (t - hitT + 0.25) / 0.8)));
      _pos.set(c.x - fxz * (28 + 40 * after), 10 + 30 * after, c.z - fzz * (28 + 40 * after));
      if (t < hitT - 0.25) _look.set(c.x + fxz * 80, 22, c.z + fzz * 80);
      else _look.set(c.x + (target.x - c.x) * after + fxz * 80 * (1 - after), 22 + 18 * after, c.z + fzz * 80 + (target.z - c.z - fzz * 80) * after);
      lens = 58;
      st.current.amp = 0.5;
    } else if (shot.kind === "rise") {
      // Commits building the town: every building starts as rubble inside
      // its ghost outline and gains a band of floors on every beat, popping
      // up in a tenth of a second, until the town stands whole on the take's
      // last beat.
      const beats = shot.end - shot.start + shot.trim;
      const n = Math.floor(t / BEAT);
      const pop = Math.min(1, (t - n * BEAT) / 0.1);
      const now = Date.now();
      store.targets.forEach((target, i) => {
        const at = (k: number) =>
          Math.round(target.floors * (riseFrom + ((1 - riseFrom) * Math.min(beats, k)) / beats));
        const rows = Math.round(at(n) + (at(n + 1) - at(n)) * pop);
        store.setRows(i, store.rowsOf(i).map(() => rows), now, undefined, false);
      });
      // Low on the main street, looking up it past the run of buildings to
      // the mascot, pushing in slowly.
      const push = smooth(Math.min(1, t / (beats * BEAT)));
      const z0 = run ? run.zs[0] : 0;
      const z1 = run ? run.zs[run.zs.length - 1] : cityZ;
      const x = run ? run.x : 0;
      _pos.set(-LANE, 5, z0 + 90 - 20 * push);
      _look.set(x * 0.35, 45, z1);
      lens = 50;
    } else if (shot.kind === "finale" && run && tower !== undefined) {
      // The rival's car rams the tallest building of the run and it comes down.
      const tz = run.zs[run.zs.length - 1];
      // The car hits and the tower starts to come down on the take's third beat.
      const COLLAPSE = shot.start + 2;
      wholeTown(beat >= COLLAPSE ? tower : undefined);
      const hitAt = (COLLAPSE - shot.start) * BEAT;
      const z = tz + 24 + INVADE_SPEED * Math.max(0, hitAt - t);
      pose(rival.current, rivalWheels.current, run.x, z, t < hitAt ? INVADE_SPEED : 0, dt);
      if (crossed(COLLAPSE)) {
        st.current.shake = 1.4;
        const target = store.targets[tower];
        fx?.burst(target.x, 8, target.z + target.d / 2, {
          count: 90,
          speed: 55,
          colors: FIRE,
          size: 3,
          life: 1.2,
        });
      }
      // Implosion: the tower sinks straight down into its own dust, a floor
      // every FLOOR_EVERY, as a function of the clock (setRows without the
      // fall, so nothing floats up), and the rival's flag goes up on the rubble.
      if (beat >= COLLAPSE) {
        const target = store.targets[tower];
        const due = Math.floor(((beat - COLLAPSE) * BEAT) / FLOOR_EVERY);
        const left = Math.max(0, target.floors - due);
        const was = store.standing(tower);
        store.setRows(tower, store.rowsOf(tower).map(() => left), Date.now(), undefined, false);
        if (left === 0) store.setBy(tower, attacker);
        if (fx && store.standing(tower) < was)
          fx.burst(target.x, 2, target.z, {
            count: 16,
            speed: 30,
            colors: DEBRIS,
            size: 2.4,
            life: 1.2,
          });
        if (left > 0) st.current.shake = Math.max(st.current.shake, 0.4);
      }
      // Square on to the tower from across the avenue, nothing in between,
      // low and looking up: the top sinks into frame as the floors go. It
      // creeps in.
      const push = smooth(Math.min(1, t / 3.2));
      _pos.set(run.x + side * (110 - 10 * push), 5, tz + 16);
      _look.set(run.x, 60, tz);
      lens = 55;
    } else return;

    const k = st.current.shake;
    if (k > 0) {
      const n = performance.now() / 1000;
      _pos.x += Math.sin(n * 71) * 1.6 * k * st.current.amp;
      _pos.y += Math.cos(n * 53) * 1.2 * k * st.current.amp;
    }
    const cam = three.camera;
    if (cam instanceof THREE.PerspectiveCamera && cam.fov !== lens) {
      cam.fov = lens;
      cam.updateProjectionMatrix();
    }
    camera.position.copy(_pos);
    camera.lookAt(_look);
  });

  return (
    <>
      <group ref={home} visible={false}>
        <Suspense fallback={null}>
          <CarModel color={homeColor} wheelRefs={homeWheels} />
        </Suspense>
      </group>
      <group ref={rival} visible={false}>
        <Suspense fallback={null}>
          <CarModel color={rivalColor} wheelRefs={rivalWheels} />
        </Suspense>
      </group>
      <group ref={missile} visible={false}>
        <Missile />
      </group>
      {heroIndex !== undefined && (
        <group ref={crown} visible={false}>
          <LeagueCrown3D
            width={store.targets[heroIndex].w}
            height={store.targets[heroIndex].floors * store.targets[heroIndex].floorH}
            depth={store.targets[heroIndex].d}
          />
        </group>
      )}
      {monument && (
        <group ref={monumentRef} visible={false}>
          {/* Its front faces the home camera; turn it to face south, toward the entrance. */}
          <group rotation={[0, -Math.atan2(-500, 850) - Math.PI, 0]} scale={MONUMENT_SIZE}>
            <TownMonument town={monument} variant="gate" />
          </group>
        </group>
      )}
      <Bursts ref={bursts} />
    </>
  );
}
