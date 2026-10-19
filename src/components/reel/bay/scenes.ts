// ─── The home city's (Bay) reel scenes ──────────────────────
// Camera moves in the home city, from the devs reel (reel 01): two wide
// moves through the Bay film's keyframes, and moves round one building, each
// its own way (never the same move twice in a row: the validator checks).
// Pure functions of time, so a scrub and the export give the same frame.
// The building moves are keys of [u, azimuth°, distance, height over the
// roof, look height as a share of the roof], in world units; the azimuth
// turns by however much it takes for no neighbour to stand in the way.
//
//   fly          low toward downtown over the water
//   rise-out     up and back over the Bay until the city is a carpet
//   drop         from high over downtown down onto a roof, steep
//   push-in      a fast push in on a roof
//   facade-rise  from the street, up a facade to its roof
//   sweep        a fast sweep round a tower
//   away         from a tower up and away until it's one of thousands
//   lot          steep over an empty lot, the towers round it framing the hole
//   pullback     from the lot, up and back until it's a dot in the city

import * as THREE from "three";
import type { ReelCut } from "@/lib/reel/film";

export const FOV = 55;

type World = [number, number, number, number, number, number, number];
/** [x, y, z, lookX, lookY, lookZ, fog]: the Bay film's skyline push and zoom out. */
const WIDE: Record<"fly" | "rise-out", World[]> = {
  fly: [
    [2300, 120, -700, 0, 170, 250, 1.5],
    [1850, 110, -420, 0, 170, 250, 1.5],
  ],
  "rise-out": [
    [1850, 110, -420, 0, 170, 250, 1.5],
    [3600, 1500, -2600, 600, 60, -200, 2.6],
    [7000, 5000, -7000, 1500, 0, -800, 2.5],
  ],
};

type Orbit = [number, number, number, number, number];
const ORBITS: Record<"drop" | "push-in" | "facade-rise" | "sweep" | "away" | "lot" | "pullback", Orbit[]> = {
  drop: [
    [0, 140, 520, 560, 0.6],
    [0.45, 150, 70, 120, 0.9],
    [1, 160, 60, 110, 0.9],
  ],
  "push-in": [
    [0, 160, 210, 90, 0.8],
    [1, 160, 105, 75, 0.8],
  ],
  "facade-rise": [
    [0, 10, 72, -76, 0.4],
    [1, 20, 68, 30, 1],
  ],
  sweep: [
    [0, 100, 115, 80, 0.8],
    [1, 160, 115, 80, 0.8],
  ],
  away: [
    [0, 160, 115, 80, 0.8],
    [1, 175, 1500, 2300, 0],
  ],
  // Height counts from the ground here (a lot has no roof).
  lot: [
    [0, 150, 75, 260, 0],
    [1, 152, 58, 235, 0],
  ],
  pullback: [
    [0, 152, 58, 235, 0],
    [1, 165, 1600, 2600, 0],
  ],
};

export const BAY_SCENES = ["fly", "rise-out", "drop", "push-in", "facade-rise", "sweep", "away", "lot", "pullback"] as const;
/** Scenes with no balloon over a roof. */
export const BAY_WIDE = new Set(["fly", "rise-out", "away"]);

export interface BayTarget {
  x: number;
  z: number;
  /** The roof (0 for an empty lot). */
  h: number;
}

export interface Box {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
}

export interface BayWorld {
  targetOf: (cut: ReelCut) => BayTarget | null;
  /** Buildings within `r` of a point, for line of sight. */
  near: (x: number, z: number, r: number) => Box[];
}

const ease = (u: number) => u * u * (3 - 2 * u);

function keyed<T extends number[]>(keys: T[], u: number): number[] {
  const k = keys.findIndex((key, i) => i > 0 && u <= key[0]);
  const i = k < 0 ? keys.length - 1 : k;
  const a = keys[i - 1];
  const b = keys[i];
  const f = ease(Math.min(1, Math.max(0, (u - a[0]) / (b[0] - a[0] || 1))));
  return a.map((v, j) => (j < 1 ? v : v + (b[j] - v) * f));
}

const curves = Object.fromEntries(
  Object.entries(WIDE).map(([k, keys]) => {
    const c = (o: number) => new THREE.CatmullRomCurve3(keys.map((p) => new THREE.Vector3(p[o], p[o + 1], p[o + 2])), false, "centripetal");
    return [k, { pos: c(0), look: c(3), fog: keys.map((p) => p[6]) }];
  }),
) as Record<"fly" | "rise-out", { pos: THREE.CatmullRomCurve3; look: THREE.CatmullRomCurve3; fog: number[] }>;

function orbitAt(target: BayTarget, keys: Orbit[], u: number, turn: number) {
  const [, az, dist, up, share] = keyed(keys, u);
  const r = THREE.MathUtils.degToRad(az + turn);
  return {
    pos: new THREE.Vector3(target.x + dist * Math.sin(r), target.h + up, target.z + dist * Math.cos(r)),
    look: new THREE.Vector3(target.x, target.h * share, target.z),
  };
}

function clear(cam: THREE.Vector3, pt: THREE.Vector3, obs: Box[]) {
  for (let i = 1; i < 40; i++) {
    const u = i / 40;
    const x = cam.x + (pt.x - cam.x) * u;
    const y = cam.y + (pt.y - cam.y) * u;
    const z = cam.z + (pt.z - cam.z) * u;
    for (const o of obs) if (Math.abs(x - o.x) < o.w / 2 + 1 && Math.abs(z - o.z) < o.d / 2 + 1 && y < o.h) return false;
  }
  return true;
}

const turns = new WeakMap<ReelCut, number>();
/** The smallest turn (either way, in 10° steps) for which the target's roof and balloon are in sight through the move. */
function turnFor(cut: ReelCut, target: BayTarget, keys: Orbit[], world: BayWorld): number {
  const known = turns.get(cut);
  if (known !== undefined) return known;
  // The wide ends of a move (away, pullback) see over everything: only the close keys matter.
  const close = keys.filter((k) => k[2] < 400);
  const obs = world.near(target.x, target.z, Math.max(...close.map((k) => k[2]), 60) + 40).filter((o) => Math.hypot(o.x - target.x, o.z - target.z) > 1);
  const roof = new THREE.Vector3(target.x, Math.max(target.h * 0.9, 1), target.z);
  const tag = new THREE.Vector3(target.x, target.h + 12, target.z);
  const sees = (turn: number) =>
    close.every((k) => {
      const p = orbitAt(target, keys, k[0], turn).pos;
      return clear(p, roof, obs) && clear(p, tag, obs);
    });
  let best = 0;
  for (let k = 0; k <= 18; k++) {
    const found = [k * 10, -k * 10].find(sees);
    if (found !== undefined) {
      best = found;
      break;
    }
  }
  turns.set(cut, best);
  return best;
}

/** Tilts the camera up just enough that the point (x, y, z) shows no higher than `top` (0 top – 1 bottom) of the frame. */
function keepUnder(p: { pos: THREE.Vector3; look: THREE.Vector3 }, x: number, y: number, z: number, top: number) {
  const flat = Math.hypot(p.look.x - p.pos.x, p.look.z - p.pos.z);
  const pitch = Math.atan2(p.look.y - p.pos.y, flat);
  const toPin = Math.atan2(y - p.pos.y, Math.hypot(x - p.pos.x, z - p.pos.z));
  const half = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  const shown = (1 - Math.tan(toPin - pitch) / half) / 2;
  if (shown >= top) return;
  // Never past straight down: a steep drop onto a roof would flip the camera.
  const limit = THREE.MathUtils.degToRad(85);
  p.look.y = p.pos.y + flat * Math.tan(Math.max(-limit, Math.min(limit, toPin - Math.atan((1 - 2 * top) * half))));
}

/** The camera at `u` of a cut (`pinAt`: the balloon's foot height, when it isn't the roof's), and how far to push the city's fog out (1: as it is). */
export function bayPose(cut: ReelCut, u: number, world: BayWorld, pinAt?: number): { pos: THREE.Vector3; look: THREE.Vector3; fog: number } {
  if (cut.kind === "fly" || cut.kind === "rise-out") {
    const w = curves[cut.kind];
    const e = cut.kind === "rise-out" ? ease(u) : u;
    const f = e * (w.fog.length - 1);
    const i = Math.min(w.fog.length - 2, Math.floor(f));
    return { pos: w.pos.getPointAt(e), look: w.look.getPointAt(e), fog: w.fog[i] + (w.fog[i + 1] - w.fog[i]) * (f - i) };
  }
  const keys = ORBITS[cut.kind as keyof typeof ORBITS];
  if (!keys) throw new Error(`The home city has no scene "${cut.kind}".`);
  const target = world.targetOf(cut);
  if (!target) throw new Error(`Scene "${cut.name}": no target (a login, or the lot).`);
  const p = orbitAt(target, keys, u, turnFor(cut, target, keys, world));
  // Close on a building, its balloon never climbs into the header: tilt up when it would.
  // (`pinAt`: where the balloon's foot is now, when it moves, as over a building rising on its lot.)
  if (cut.kind !== "away" && cut.kind !== "pullback") keepUnder(p, target.x, pinAt ?? target.h + 10, target.z, 0.36);
  return { ...p, fog: cut.kind === "pullback" || cut.kind === "away" ? 1.5 + ease(u) : 1.5 };
}
