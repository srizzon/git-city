// ─── The Brasil map's reel scenes ───────────────────────────
// Camera moves on the Brasil map, each a pure function of time, so a scrub,
// a loop and the export all show the same frame. A scene starts where the
// one before it ended (its pose at u = 1), so a dive leaves from wherever
// the last take left the camera. Close moves are keyed as orbits round a
// target building: [u, azimuth°, distance, height, look height], in shares
// of how tall the building stands right now, so the roof and its balloon
// hold their place on screen whatever the building.
//
//   overview   the whole country, turning onto it and closing in
//   dive       from the last pose down to the target's capital (log-space zoom)
//   lot-rise   round the target while it goes up floor by floor
//   orbit      round the target, closing in on its roof
//   pullback   from the last pose back out to the whole country

import * as THREE from "three";
import { MAP_BOUNDS } from "@/lib/towns/brasil-geo";
import type { ReelCut } from "@/lib/reel/film";

export const FOV = 45;
/** The framing's floor while a lot is still empty or its building short. */
export const MIN_H = 150;
/** How far a building's roof items reach above the roof (the tallest crown or face). */
export const ITEMS_H = 28;

export type Orbit = [number, number, number, number, number];
/** Over a capital, in world units (a lot is 48, an empty capital ~330 across, its trees up to ~60). */
const ESTABLISH: Orbit = [0, 30, 620, 560, 0];
const ORBITS: Record<"lot-rise" | "orbit", Orbit[]> = {
  // Level with the roof: the roof mid-frame, its tag between it and the header, the tower under the captions.
  "lot-rise": [
    [0, 30, 2.4, 1.0, 0.98],
    [1, 35, 1.6, 1.25, 1.0],
  ],
  // Closer on the roof (far off, the engine stops drawing a thin tower's roof items), looking a little down.
  // The look point a little over the roof keeps the balloon clear under the header.
  orbit: [
    [0, 35, 1.6, 1.25, 1.06],
    [1, 70, 1.2, 1.3, 1.08],
  ],
};

export interface Pose {
  pos: THREE.Vector3;
  look: THREE.Vector3;
}

export interface Target {
  x: number;
  z: number;
  /** The building's full height (0 for a capital with nothing to rise). */
  height: number;
  /** Whether items (crown, face, aura) stand on its roof: its balloon sits higher. */
  items?: boolean;
}

/** A building that can stand between the camera and a target. */
export interface Obstacle {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
}

export interface SceneWorld {
  aspect: number;
  /** Buildings near a point (for line of sight), within `r` world units. */
  near: (x: number, z: number, r: number) => Obstacle[];
  /** Where a cut's target stands. */
  targetOf: (cut: ReelCut) => Target;
  /** The rising building's height share (0–1) at `t` seconds, 1 when nothing rises. */
  riseAt: (t: number) => number;
  /** The cut that raises the target, if any (the framing tracks the rise only there). */
  isRise: (cut: ReelCut) => boolean;
}

export const ease = (u: number) => u * u * (3 - 2 * u);

/** The whole country, filling a phone's width, its middle a touch south so it sits under the header. */
export function overview(aspect: number): Pose {
  const cx = (MAP_BOUNDS.minX + MAP_BOUNDS.maxX) / 2;
  const cz = (MAP_BOUNDS.minZ + MAP_BOUNDS.maxZ) / 2;
  const w = MAP_BOUNDS.maxX - MAP_BOUNDS.minX;
  const d = MAP_BOUNDS.maxZ - MAP_BOUNDS.minZ;
  const dist = (Math.max(w / aspect, d) / (2 * Math.tan(((FOV / 2) * Math.PI) / 180))) * 0.9;
  const tilt = (72 * Math.PI) / 180;
  const lift = d * 0.07;
  return { look: new THREE.Vector3(cx, 0, cz + lift), pos: new THREE.Vector3(cx, dist * Math.sin(tilt), cz + lift + dist * Math.cos(tilt)) };
}

function keyed(keys: Orbit[], u: number) {
  const k = keys.findIndex((key, i) => i > 0 && u <= key[0]);
  const i = k < 0 ? keys.length - 1 : k;
  const a = keys[i - 1];
  const b = keys[i];
  const f = ease(Math.min(1, Math.max(0, (u - a[0]) / (b[0] - a[0] || 1))));
  return a.map((v, j) => v + (b[j] - v) * f);
}

function orbitPose(target: Target, keys: Orbit[], u: number, scale: number, turn = 0): Pose {
  const [, az, d, hh, lh] = keyed(keys, u);
  const r = THREE.MathUtils.degToRad(az + turn);
  return {
    pos: new THREE.Vector3(target.x + d * scale * Math.sin(r), hh * scale, target.z + d * scale * Math.cos(r)),
    look: new THREE.Vector3(target.x, lh * scale, target.z),
  };
}

/**
 * From one pose to another the way a map zooms: the look point slides, the
 * direction turns, and the distance changes by the same ratio every frame
 * (log space), so the scale reads evenly instead of skimming the ground.
 */
function zoom(a: Pose, b: Pose, e: number): Pose {
  const d0 = a.pos.clone().sub(a.look);
  const d1 = b.pos.clone().sub(b.look);
  const dist = Math.exp(Math.log(d0.length()) + (Math.log(d1.length()) - Math.log(d0.length())) * e);
  const look = a.look.clone().lerp(b.look, e);
  return { look, pos: d0.normalize().lerp(d1.normalize(), e).normalize().multiplyScalar(dist).add(look) };
}

/** Whether nothing stands between `cam` and `pt` (sampled along the line, as tools/los.py did). */
function clear(cam: THREE.Vector3, pt: THREE.Vector3, obs: Obstacle[]): boolean {
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
/**
 * How far to turn an orbit (degrees) so the target's roof and its balloon
 * are in plain sight the whole move: the smallest turn, either way, for which
 * the camera sees both at the move's start, middle and end. Remembered per cut.
 */
function turnFor(cut: ReelCut, target: Target, keys: Orbit[], H: number, world: SceneWorld): number {
  const known = turns.get(cut);
  if (known !== undefined) return known;
  const reach = Math.max(...keys.map((k) => k[2])) * H + 60;
  const obs = world.near(target.x, target.z, reach).filter((o) => Math.hypot(o.x - target.x, o.z - target.z) > 1);
  const roof = new THREE.Vector3(target.x, Math.max(target.height, 1) * 0.9, target.z);
  const tag = new THREE.Vector3(target.x, target.height + 12, target.z);
  const sees = (turn: number) => [0, 0.5, 1].every((u) => {
    const p = orbitPose(target, keys, u, H, turn).pos;
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

/** How far over a roof its balloon's foot stands: over its items, when it has some. */
export const balloonClear = (target: Target) => 8 + (target.items ? ITEMS_H : 0);

/** Tilts the camera so the point `height` up the target shows `y` (0 top – 1 bottom) down the frame. */
function aimAt(p: Pose, target: Target, height: number, y: number) {
  const flat = Math.hypot(p.look.x - p.pos.x, p.look.z - p.pos.z);
  const toRoof = Math.atan2(height - p.pos.y, Math.hypot(target.x - p.pos.x, target.z - p.pos.z));
  const above = Math.atan((1 - 2 * y) * Math.tan(THREE.MathUtils.degToRad(FOV / 2)));
  p.look.y = p.pos.y + flat * Math.tan(toRoof - above);
}

/** How tall the framing takes the target to be at `t`: its rise inside the rise cut, never under MIN_H. */
export function frameHeight(world: SceneWorld, cut: ReelCut, t: number): number {
  const target = world.targetOf(cut);
  return Math.max(MIN_H, target.height * (world.isRise(cut) ? world.riseAt(t) : 1));
}

/** The camera at `u` (0–1) of cut `i`. */
export function poseAt(cuts: readonly ReelCut[], i: number, u: number, world: SceneWorld): Pose {
  const cut = cuts[i];
  const t = cut.from + u * (cut.to - cut.from);
  const top = overview(world.aspect);
  const before = () => (i > 0 ? poseAt(cuts, i - 1, 1, world) : top);
  switch (cut.kind) {
    case "overview": {
      // Moving from the first frame: turning onto the country and closing in, still drifting at the end.
      const e = 1 - Math.pow(1 - u, 2);
      const pos = top.pos.clone().sub(top.look).applyAxisAngle(THREE.Object3D.DEFAULT_UP, THREE.MathUtils.degToRad(-40 * (1 - e)));
      return { pos: pos.multiplyScalar(1.5 - 0.5 * e).add(top.look), look: top.look.clone() };
    }
    case "dive": {
      const target = world.targetOf(cut);
      return zoom(before(), orbitPose(target, [ESTABLISH, ESTABLISH], 0, 1), ease(Math.min(1, u * 1.3)));
    }
    case "lot-rise":
    case "orbit": {
      const H = frameHeight(world, cut, t);
      const target = world.targetOf(cut);
      // A rising example stands alone on its lot; a resident's building stands in a city.
      // Round a finished building the camera stands back a little, so its roof and balloon stay close on screen.
      const back = world.isRise(cut) ? 1 : 1.4;
      const turn = world.isRise(cut) ? 0 : turnFor(cut, target, ORBITS[cut.kind], frameHeight(world, cut, cut.to) * back, world);
      const p = orbitPose(target, ORBITS[cut.kind], u, H * back, turn);
      // While the lot is empty, look down at it, not at a roof that isn't there yet.
      if (world.isRise(cut)) p.look.y = THREE.MathUtils.lerp(0.15 * H, p.look.y, Math.min(1, world.riseAt(t) * 4));
      // A finished building: its roof held at a set height on screen, under its balloon and the
      // header, above the captions (higher with roof items, whose balloon stands taller).
      else aimAt(p, target, target.height + balloonClear(target), 0.36);
      return p;
    }
    case "pullback":
      // Back out to the whole country fast, then hold under the call to action.
      return zoom(before(), top, ease(Math.min(1, u * 1.7)));
    default:
      throw new Error(`The Brasil map has no scene "${cut.kind}".`);
  }
}

/** The scenes this world plays (the validator checks specs against it). */
export const BRASIL_SCENES = ["overview", "dive", "lot-rise", "orbit", "pullback"] as const;
/** Scenes that frame the whole country: no balloon over a roof. */
export const WIDE_SCENES = new Set(["overview", "dive"]);
