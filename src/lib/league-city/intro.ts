// ─── Town intro ─────────────────────────────────────────────
// First visit: a car drives in. It starts outside on the approach road,
// passes through the portal, goes up the main street, turns onto the first
// cross street and pulls over to park. The camera rides behind it (the drive
// mode's chase view); once parked, it glides up to the scene's normal camera
// frame and the orbit controls take over.
//
// This file is the route and timing, pure and testable; TownIntro plays it.

import { LOT } from "./grid";
import { lotKey } from "./placement";
import { APPROACH_LOTS } from "./identity-geometry";
import type { CityObject } from "./types";

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];

/** Keep right: lane center off the road's middle, city units. */
export const LANE = 6;
/** Distance from the lane to the parking spot at the curb. */
const PULL_OVER = 6;
/** Cruise speed, city units per second (about 55 km/h in drive mode's scale). */
export const CRUISE = 52;
/** How far down the cross street the car parks. */
const PARK_AFTER_TURN = 1.4 * LOT;

export interface CarRoute {
  /** Lane points in drive order; the last one is the parking spot. */
  points: Vec2[];
  /** Seconds for the drive (the car slows to a stop at the end). */
  duration: number;
}

export interface IntroTiming {
  /** Parked, before the camera leaves the car. */
  hold: number;
  /** Chase view up to the city frame. */
  rise: number;
}

export const INTRO_TIMING: IntroTiming = { hold: 0.8, rise: 3.2 };

type Obj = Pick<CityObject, "item_type" | "x" | "z" | "px">;

/**
 * The drive: straight up the main street (x = 0) from the approach, then
 * right onto the first cross street that leaves it (left if only that way
 * exists), and park at the curb. Without a cross street it parks on the main
 * street a few lots in.
 */
export function carRoute(objects: readonly Obj[]): CarRoute {
  const roads = new Set(objects.filter((o) => o.px === null && o.item_type === "road").map((o) => lotKey(o.x, o.z)));
  const startZ = LOT / 2 + APPROACH_LOTS * LOT - 12;
  const points: Vec2[] = [[LANE, startZ], [LANE, LOT / 2 + 20]];

  // First crossing north of the entrance, at least two lots in.
  let cross: { z: number; dir: 1 | -1 } | null = null;
  for (let z = -2; z >= -40 && roads.has(lotKey(0, z)); z--) {
    if (roads.has(lotKey(1, z))) {
      cross = { z, dir: 1 };
      break;
    }
    if (roads.has(lotKey(-1, z))) {
      cross = { z, dir: -1 };
      break;
    }
  }

  if (cross) {
    const cz = cross.z * LOT;
    const d = cross.dir;
    // Heading east the right lane is south of the middle (+z); heading west, north.
    const laneZ = cz + d * LANE;
    points.push([LANE, cz + 2 * LOT], [LANE, cz + LOT * 0.6]);
    // The corner: a wide, smooth arc.
    points.push([LANE + d * 4, laneZ + d * 10], [LANE + d * 14, laneZ + d * 1.5]);
    points.push([d * LOT * 0.9, laneZ], [d * PARK_AFTER_TURN, laneZ + d * PULL_OVER * 0.6], [d * (PARK_AFTER_TURN + 18), laneZ + d * PULL_OVER]);
  } else {
    points.push([LANE, -1.5 * LOT], [LANE + PULL_OVER * 0.6, -2.3 * LOT], [LANE + PULL_OVER, -2.6 * LOT]);
  }

  return { points, duration: pathLength(points) / CRUISE + 2.5 };
}

export function pathLength(points: readonly Vec2[]): number {
  let l = 0;
  for (let i = 1; i < points.length; i++) l += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return l;
}

/**
 * Share of the route covered at time u (0..1): rolls in at cruise speed and
 * eases to a stop over the last stretch, so it parks instead of halting.
 */
export function driveProgress(u: number): number {
  const x = Math.min(1, Math.max(0, u));
  const brake = 0.3;
  // Constant speed, then a linear slowdown to zero that meets it smoothly.
  const v = 1 / (1 - brake / 2);
  if (x <= 1 - brake) return x * v;
  const k = (x - (1 - brake)) / brake;
  return (1 - brake) * v + brake * v * (k - (k * k) / 2);
}

/** Total seconds, parked hold and camera rise included. */
export function introSeconds(route: CarRoute, timing: IntroTiming = INTRO_TIMING): number {
  return route.duration + timing.hold + timing.rise;
}
