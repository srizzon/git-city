// ─── City of the day: game cars on the streets ──────────────
// The game-run cops and gang (HeistMode) drive from lot to lot along the
// map's road lots instead of straight at their target, so they never cut
// through buildings: at each lot they take the neighbouring road that gets
// them closest to where they're going (or furthest, running away), and only
// turn back at a dead end. Lots are the city grid (LOT city units); positions
// in meters. Pure.

import { lotKey } from "../placement";
import type { CityObject } from "../types";

export type Lot = [number, number];

const DIRS: readonly Lot[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

/** Every road lot on the map (props excluded). */
export function roadSet(objects: readonly Pick<CityObject, "item_type" | "x" | "z" | "px">[]): Set<string> {
  return new Set(objects.filter((o) => o.px === null && o.item_type === "road").map((o) => lotKey(o.x, o.z)));
}

/** The road lot nearest a point (m), searching out ring by ring up to `maxR` lots; null with none near. */
export function nearestRoad(roads: ReadonlySet<string>, xm: number, zm: number, lotM: number, maxR = 8): Lot | null {
  const cx = Math.round(xm / lotM);
  const cz = Math.round(zm / lotM);
  for (let r = 0; r <= maxR; r++) {
    let best: Lot | null = null;
    let bestD = Infinity;
    for (let dx = -r; dx <= r; dx++)
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r || !roads.has(lotKey(cx + dx, cz + dz))) continue;
        const d = Math.hypot((cx + dx) * lotM - xm, (cz + dz) * lotM - zm);
        if (d < bestD) {
          bestD = d;
          best = [cx + dx, cz + dz];
        }
      }
    if (best) return best;
  }
  return null;
}

/**
 * The next road lot from `cur` toward (tx, tz) meters (`away`: from it), not
 * back to `prev` unless it's the only way; null when `cur` has no road around.
 */
export function nextRoad(roads: ReadonlySet<string>, cur: Lot, prev: Lot | null, tx: number, tz: number, lotM: number, away = false): Lot | null {
  const options = DIRS.map(([dx, dz]) => [cur[0] + dx, cur[1] + dz] as Lot).filter((l) => roads.has(lotKey(l[0], l[1])));
  if (options.length === 0) return null;
  const forward = options.filter((l) => !prev || l[0] !== prev[0] || l[1] !== prev[1]);
  const pool = forward.length ? forward : options;
  const score = (l: Lot) => Math.hypot(l[0] * lotM - tx, l[1] * lotM - tz) * (away ? -1 : 1);
  return pool.reduce((a, b) => (score(b) < score(a) ? b : a));
}
