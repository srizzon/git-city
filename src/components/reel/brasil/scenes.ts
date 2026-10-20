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
//   wide       the whole country turning slowly, behind a panel (the race, a list)
//   pullback   from the last pose back out to the whole country
//   map        the whole country held still and small enough to sit under the header with room
//              round it, a slow push in (params.y: where its middle sits down the frame, 0–1,
//              default 0.55, so a headline above it has room; params.size: its width share of the frame, default 0.68). With
//              params.login it opens close on that building and pulls out to the country by params.to;
//              with params.start "previous" it pulls out from wherever the last take left the camera.
//   fill       over a capital (params.uf) while the map fills up in the order people arrived
//              (params.from → params.to; params.start: how many already stand; params.near: closer),
//              the camera easing in and turning
//   facade-rise from the street, up the target's facade to its roof (a tall tower; a short one is boxed in)
//   drop       from high over the city, steeply down onto the target's roof (a short building among towers)
//   push-in    a quick push in on the target's roof, from high and behind
//   crown      round the target's roof from above, the week's crown coming down onto it
// Any move round a building takes params.crown: true to show the crown on its roof.
// push-in, drop and crown take params.y: where the roof sits down the frame.
// lot-rise takes params.angle "high" in a built-up city: from above, so the towers round the lot don't hide it.

import * as THREE from "three";
import type { Geo } from "@/lib/towns/brasil-geo";
import type { ReelCut } from "@/lib/reel/film";

export const FOV = 45;
/** The framing's floor while a lot is still empty or its building short. */
export const MIN_H = 150;
/** How far a building's roof items reach above the roof (the tallest crown or face). */
export const ITEMS_H = 28;
/** How far the week's crown stands over a roof (14 up, then its five cells). */
export const CROWN_H = 44;
/** The reel crown's voxel size: five across (25 units), enough to read on the map's small buildings. */
export const CROWN_CELL = 5;

export type Orbit = [number, number, number, number, number];
/** Over a capital, in world units (a lot is 48, an empty capital ~330 across, its trees up to ~60). */
const ESTABLISH: Orbit = [0, 30, 620, 560, 0];
/** Over a capital filling up, in world units: high enough for the whole city, then easing in. */
const FILL: Orbit[] = [
  [0, 10, 900, 2300, 0],
  [1, 35, 800, 1700, 0],
];
/** A lot in a built-up city, from above (shares of the framing height). */
const LOT_HIGH: Orbit[] = [
  [0, 30, 2.0, 2.8, 0.15],
  [1, 40, 1.6, 1.8, 1.15],
];
const ORBITS: Record<"lot-rise" | "orbit" | "facade-rise" | "push-in" | "crown" | "drop", Orbit[]> = {
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
  // Low by the door looking up the tower, rising to the roof.
  "facade-rise": [
    [0, 200, 0.62, 0.05, 0.6],
    [1, 215, 0.95, 1.15, 1.02],
  ],
  // From high behind, quickly in on the roof.
  "push-in": [
    [0, 150, 2.6, 1.8, 1.0],
    [1, 158, 1.45, 1.3, 1.0],
  ],
  // Round the roof from above and the other side, close, the crown landing on it.
  crown: [
    [0, 250, 1.9, 2.5, 1.1],
    [1, 300, 1.55, 2.1, 1.1],
  ],
  // From high over the city, steeply down onto the roof, settling.
  drop: [
    [0, 140, 3.4, 5.0, 0.5],
    [0.7, 152, 1.9, 2.6, 1.0],
    [1, 158, 1.7, 2.3, 1.0],
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
  /** Whether the week's crown stands over its roof this cut (LeagueCrown3D, taller than items). */
  crown?: boolean;
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
  /** The country's extent at the map's scale (Brazil grows with its cities). */
  bounds: Geo["bounds"];
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
export function overview(aspect: number, bounds: Geo["bounds"]): Pose {
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  const w = bounds.maxX - bounds.minX;
  const d = bounds.maxZ - bounds.minZ;
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

/**
 * zoom() for a pull out from close: the look point slides only as far as the
 * camera has backed off (in proportion to the distance gained), so the
 * subject holds the middle of the frame until the scale has grown past it.
 */
function zoomOut(a: Pose, b: Pose, e: number): Pose {
  const d0 = a.pos.clone().sub(a.look);
  const d1 = b.pos.clone().sub(b.look);
  const dist = Math.exp(Math.log(d0.length()) + (Math.log(d1.length()) - Math.log(d0.length())) * e);
  const look = a.look.clone().lerp(b.look, (dist - d0.length()) / Math.max(1e-6, d1.length() - d0.length()));
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
export const balloonClear = (target: Target) => 8 + (target.crown ? CROWN_H : target.items ? ITEMS_H : 0);

/** How far under the horizon the frame's top edge stays on a move round a building (degrees): no sky, no black band. */
const NO_SKY = 14;

/**
 * Raises the camera (same distance across) until, aimed with the point `height` up the target `y` down
 * the frame, it looks down steeply enough that the frame's top edge is under the horizon (Sam,
 * 2026-10-20: on a building, the camera always a little turned down). params.sky: true keeps the sky.
 */
function lookDown(p: Pose, target: Target, height: number, y: number, cut: ReelCut) {
  if (cut.params.sky === true) return;
  const d = Math.hypot(target.x - p.pos.x, target.z - p.pos.z);
  const above = Math.atan((1 - 2 * y) * Math.tan(THREE.MathUtils.degToRad(FOV / 2)));
  const need = height + d * Math.tan(THREE.MathUtils.degToRad(FOV / 2 + NO_SKY) - above);
  if (p.pos.y < need) p.pos.y = need;
}

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

/** The whole country held still (the map scene): its middle at params.y down the frame, params.size of its width, easing in 4%. */
function mapPose(cut: ReelCut, u: number, top: Pose): Pose {
  const y = typeof cut.params.y === "number" ? cut.params.y : 0.55;
  const size = typeof cut.params.size === "number" ? cut.params.size : 0.68;
  const p = { pos: top.pos.clone(), look: top.look.clone() };
  const dir = p.pos.clone().sub(p.look);
  // overview() fills the width at 0.9 of its fit distance: back off to the asked share, easing in 4%.
  const dist = dir.length() * (1.0 / 0.9 / size) * (1.04 - 0.04 * ease(u));
  // Moving the look point toward the camera's bottom edge raises the map on screen.
  const shift = (0.5 - y) * 2 * dist * Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  const look = p.look.clone().add(new THREE.Vector3(0, 0, shift / Math.sin(THREE.MathUtils.degToRad(72))));
  return { look, pos: dir.normalize().multiplyScalar(dist).add(look) };
}

/** The camera at `u` (0–1) of cut `i`. */
export function poseAt(cuts: readonly ReelCut[], i: number, u: number, world: SceneWorld): Pose {
  const cut = cuts[i];
  const t = cut.from + u * (cut.to - cut.from);
  const top = overview(world.aspect, world.bounds);
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
    case "map": {
      const held = mapPose(cut, u, top);
      if (cut.params.start === "previous" && i > 0) {
        const until = typeof cut.params.to === "number" ? cut.params.to : cut.from + (cut.to - cut.from) * 0.6;
        const k = Math.min(1, Math.max(0, (t - cut.from) / Math.max(1e-6, until - cut.from)));
        return zoomOut(before(), held, k * k * (3 - 2 * k));
      }
      if (typeof cut.params.login !== "string") return held;
      // Opening close on a building, turning a little, then out to the held country (log space, so the scale reads evenly).
      const target = world.targetOf(cut);
      const H = Math.max(MIN_H, target.height);
      const until = typeof cut.params.to === "number" ? cut.params.to : cut.from + (cut.to - cut.from) * 0.6;
      const k = Math.min(1, Math.max(0, (t - cut.from) / Math.max(1e-6, until - cut.from)));
      // Above the tower, looking down on its roof with the city around it (never the sky), then out.
      const keys: Orbit[] = [[0, 30, 1.1, 2.4, 0.9], [1, 50, 1.0, 2.2, 0.9]];
      const close = orbitPose(target, keys, k, H, turnFor(cut, target, keys, H, world));
      // The tower's roof in the middle of the frame, under the counter.
      aimAt(close, target, target.height + balloonClear(target), 0.42);
      return zoomOut(close, mapPose(cut, Math.max(u, 0), top), k * k * (3 - 2 * k));
    }
    case "fill": {
      const target = world.targetOf(cut);
      // params.near: a share of the usual distance (0.5 = twice as close, the new buildings read as they go up).
      return orbitPose(target, FILL, ease(u), typeof cut.params.near === "number" ? cut.params.near : 1);
    }
    case "facade-rise": {
      const target = world.targetOf(cut);
      const H = Math.max(MIN_H, target.height);
      const turn = turnFor(cut, target, ORBITS[cut.kind], H, world);
      const p = orbitPose(target, ORBITS[cut.kind], ease(u), H, turn);
      // Looking up the tower on the way, then the roof settles under the header as it arrives.
      const up = p.look.y;
      aimAt(p, target, target.height + balloonClear(target), 0.4);
      p.look.y = THREE.MathUtils.lerp(up, p.look.y, ease(Math.min(1, Math.max(0, (u - 0.55) / 0.45))));
      return p;
    }
    case "push-in":
    case "drop":
    case "crown": {
      const target = world.targetOf(cut);
      const H = Math.max(MIN_H, target.height);
      const turn = turnFor(cut, target, ORBITS[cut.kind], H, world);
      const p = orbitPose(target, ORBITS[cut.kind], cut.kind === "crown" ? u : 1 - Math.pow(1 - u, 3), H, turn);
      // With the crown on, the balloon a little higher so the crown under it clears the captions.
      // params.y: where the roof's balloon point sits down the frame (under a big card, lower).
      const roofY = typeof cut.params.y === "number" ? cut.params.y : target.crown ? 0.36 : 0.42;
      lookDown(p, target, target.height + balloonClear(target), roofY, cut);
      aimAt(p, target, target.height + balloonClear(target), roofY);
      return p;
    }
    case "lot-rise":
    case "orbit": {
      const H = frameHeight(world, cut, t);
      const target = world.targetOf(cut);
      // A rising example stands alone on its lot; a resident's building stands in a city.
      // Round a finished building the camera stands back a little, so its roof and balloon stay close on screen.
      const back = world.isRise(cut) ? 1 : 1.4;
      const keys = cut.kind === "lot-rise" && cut.params.angle === "high" ? LOT_HIGH : ORBITS[cut.kind];
      const turn = world.isRise(cut) ? 0 : turnFor(cut, target, keys, frameHeight(world, cut, cut.to) * back, world);
      const p = orbitPose(target, keys, u, H * back, turn);
      // While the lot is empty, look down at it, not at a roof that isn't there yet.
      if (world.isRise(cut)) {
        p.look.y = THREE.MathUtils.lerp(0.15 * H, p.look.y, Math.min(1, world.riseAt(t) * 4));
        // From above, the roof as it goes up held over the captions, under the header.
        if (keys === LOT_HIGH) {
          const y = THREE.MathUtils.lerp(0.55, 0.46, world.riseAt(t));
          lookDown(p, target, H + 8, y, cut);
          aimAt(p, target, H + 8, y);
        }
      }
      // A finished building: its roof held at a set height on screen, under its balloon and the
      // header, above the captions (higher with roof items, whose balloon stands taller).
      else {
        lookDown(p, target, target.height + balloonClear(target), 0.36, cut);
        aimAt(p, target, target.height + balloonClear(target), 0.36);
      }
      return p;
    }
    case "wide": {
      // The whole country turning slowly behind a panel (the race, a list), reached from wherever the last take left off.
      const turn = top.pos.clone().sub(top.look).applyAxisAngle(THREE.Object3D.DEFAULT_UP, THREE.MathUtils.degToRad(-12 + 24 * u));
      const slow = { pos: turn.multiplyScalar(1.05).add(top.look), look: top.look.clone() };
      return i > 0 && cuts[i - 1].kind !== "overview" && cuts[i - 1].kind !== "wide" ? zoom(before(), slow, ease(Math.min(1, u * 2.5))) : slow;
    }
    case "pullback":
      // Back out to the whole country fast, then hold under the call to action.
      return zoom(before(), top, ease(Math.min(1, u * 1.7)));
    default:
      throw new Error(`The Brasil map has no scene "${cut.kind}".`);
  }
}

/** The scenes this world plays (the validator checks specs against it). */
export { BRASIL_SCENES } from "@/lib/reel/scenes";
/** Scenes that frame the whole country or a whole city: no balloon over a roof. */
export const WIDE_SCENES = new Set(["map", "overview", "dive", "wide", "fill"]);
