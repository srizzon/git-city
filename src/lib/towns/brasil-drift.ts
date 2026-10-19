// ─── Brasil town: the drift track ───────────────────────────
// A drift course on its own island in the south-east's sea, off the coast
// between São Paulo and Rio, its track laid there facing west
// (lib/drift/spots/brasil.ts). The spot is chosen so Brazil never covers it
// however much it grows (geoAt scales round the origin; the sea between the
// origin and the site stays sea). Its lots stay clear: no city, highway,
// avenue or tree crosses them. The START gate is the track's own line, on
// the site's north side; the DRIFT sign stands just north of it.
//
// Pure: lots and meters, no rendering.

import { LOT } from "../league-city/grid";
import { M_TO_UNIT } from "../league-city/drive/tuning";
import { pointAt, type Track } from "../league-city/race/track";

/** The lots the track, its walls and its paddock take (inclusive). */
export const DRIFT_SITE = { x0: 78, x1: 91, z0: -88, z1: -75 } as const;

/** Where the site was until 2026-10-19 (open land between SP and MS): runs driven there are moved over (moveOldRun). */
const OLD_SITE = { x0: 22, x1: 35, z0: -116, z1: -103 } as const;

/** Which way the start straight runs (x, z): west, so the line sits on the site's north side, by the shore. */
export const DRIFT_HEADING: [number, number] = [-1, 0];

export function inDriftSite(x: number, z: number): boolean {
  return x >= DRIFT_SITE.x0 && x <= DRIFT_SITE.x1 && z >= DRIFT_SITE.z0 && z <= DRIFT_SITE.z1;
}

/** The site's middle in meters (the drift spot's unit): the track is centered here. */
export const DRIFT_CENTER_M: [number, number] = [
  (((DRIFT_SITE.x0 + DRIFT_SITE.x1) / 2) * LOT) / M_TO_UNIT,
  (((DRIFT_SITE.z0 + DRIFT_SITE.z1) / 2) * LOT) / M_TO_UNIT,
];

/** Where the DRIFT sign stands (lot): just north of the START gate, outside the site. */
export const DRIFT_SIGN_LOT: [number, number] = [DRIFT_SITE.x0 + 8, DRIFT_SITE.z0 - 1];

/** Where "back to the city" puts the car (lot, heading clockwise from north): on the island's north shore, headed for the coast. */
export const DRIFT_EXIT = { x: DRIFT_SITE.x0 + 11, z: DRIFT_SITE.z0 - 2, rot: 0 } as const;

/** How far the track moved (m) when it went out to sea. */
const MOVED_M: [number, number] = [
  (((DRIFT_SITE.x0 + DRIFT_SITE.x1 - OLD_SITE.x0 - OLD_SITE.x1) / 2) * LOT) / M_TO_UNIT,
  (((DRIFT_SITE.z0 + DRIFT_SITE.z1 - OLD_SITE.z0 - OLD_SITE.z1) / 2) * LOT) / M_TO_UNIT,
];

/**
 * A run's frames ([t, x, z, yaw, …], m) where the track is now: a run driven
 * on the old site (it starts nearer the old site than the new) is moved
 * over, so old ghosts and records still race on the track.
 */
export function moveOldRun(frames: number[]): number[] {
  if (frames.length < 4) return frames;
  const [x, z] = [frames[1], frames[2]];
  const near = (cx: number, cz: number) => Math.hypot(x - cx, z - cz);
  if (near(DRIFT_CENTER_M[0] - MOVED_M[0], DRIFT_CENTER_M[1] - MOVED_M[1]) > near(DRIFT_CENTER_M[0], DRIFT_CENTER_M[1])) return frames;
  return frames.map((v, i) => (i % 4 === 1 ? v + MOVED_M[0] : i % 4 === 2 ? v + MOVED_M[1] : v));
}

/**
 * Whether the car (units) just crossed the START line between two looks:
 * across it, within the asphalt, close enough that it isn't a jump across
 * the map (a respawn).
 */
export function crossedStart(track: Track, prev: { x: number; z: number }, now: { x: number; z: number }): boolean {
  const p = pointAt(track, 0);
  const local = (q: { x: number; z: number }) => {
    const dx = q.x / M_TO_UNIT - p.x;
    const dz = q.z / M_TO_UNIT - p.z;
    return { along: dx * p.tx + dz * p.tz, lat: dx * p.tz - dz * p.tx };
  };
  const a = local(prev);
  const b = local(now);
  const half = track.spec.width / 2 + 1;
  if (Math.abs(b.lat) > half || Math.abs(a.lat) > half + 4) return false;
  if (Math.hypot(now.x - prev.x, now.z - prev.z) / M_TO_UNIT > 30) return false;
  return Math.sign(a.along) !== Math.sign(b.along) || Math.abs(b.along) < 0.5;
}

/** Far enough from the line (m) for the gate to take the car again. */
export function clearOfStart(track: Track, at: { x: number; z: number }): boolean {
  const p = pointAt(track, 0);
  return Math.hypot(at.x / M_TO_UNIT - p.x, at.z / M_TO_UNIT - p.z) > 25;
}
