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
  orbit: [
    [0, 35, 1.6, 1.25, 1.0],
    [1, 70, 1.2, 1.3, 1.0],
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
}

export interface SceneWorld {
  aspect: number;
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

function orbitPose(target: Target, keys: Orbit[], u: number, scale: number): Pose {
  const [, az, d, hh, lh] = keyed(keys, u);
  const r = THREE.MathUtils.degToRad(az);
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
      const p = orbitPose(world.targetOf(cut), ORBITS[cut.kind], u, H);
      // While the lot is empty, look down at it, not at a roof that isn't there yet.
      if (world.isRise(cut)) p.look.y = THREE.MathUtils.lerp(0.15 * H, p.look.y, Math.min(1, world.riseAt(t) * 4));
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
