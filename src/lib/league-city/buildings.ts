// ─── League city buildings ──────────────────────────────────
// Places laid-out CityBuildings (dimensions from the city formulas) on their
// league lots. Each building sits centered in its lot; the footprint is capped
// so it never spills out, and a 90°/270° turn swaps width and depth. Heights
// are rescaled to the town first (scaleTownHeights) so it reads as a street,
// not a forest of towers the car can't see past.

import type { CityBuilding } from "@/lib/github";
import { lotToWorld } from "./grid";
import type { CityObject } from "./types";

export const MAX_FOOTPRINT = 44;
/** Town heights run from about one lot to about four lots tall. */
export const TOWN_MIN_HEIGHT = 48;
export const TOWN_MAX_HEIGHT = 190;
const FLOOR_H = 6;

/** Above 1, most buildings stay low and a few stand tall, like a real skyline. */
const SKYLINE_CURVE = 1.6;

/**
 * City heights → town heights by rank inside the town: the shortest building
 * gets the floor, the tallest the ceiling, and the rest spread between on a
 * curve, whatever the raw numbers are. Equal heights stay equal; a town where
 * everyone is the same size sits in the middle.
 */
export function townHeights(heights: readonly number[]): number[] {
  const levels = [...new Set(heights)].sort((a, b) => a - b);
  const rank = new Map(levels.map((h, i) => [h, i]));
  return heights.map((h) => {
    const t = levels.length > 1 ? (rank.get(h) ?? 0) / (levels.length - 1) : 0.5;
    const curved = levels.length > 1 ? t ** SKYLINE_CURVE : t;
    return Math.round(TOWN_MIN_HEIGHT + curved * (TOWN_MAX_HEIGHT - TOWN_MIN_HEIGHT));
  });
}

/** The town's buildings with town heights (and floors to match). Every town view reads these. */
export function scaleTownHeights(byDevId: ReadonlyMap<number, CityBuilding>): Map<number, CityBuilding> {
  const entries = [...byDevId.entries()];
  const heights = townHeights(entries.map(([, b]) => b.height));
  return new Map(
    entries.map(([id, b], i) => [id, { ...b, height: heights[i], floors: Math.max(3, Math.floor(heights[i] / FLOOR_H)) }]),
  );
}

export function leagueBuildings(
  objects: readonly CityObject[],
  byDevId: ReadonlyMap<number, CityBuilding>,
): CityBuilding[] {
  const out: CityBuilding[] = [];
  for (const o of objects) {
    if (o.kind !== "building" || o.developer_id === null) continue;
    const b = byDevId.get(o.developer_id);
    if (!b) continue;
    const w = Math.min(b.width, MAX_FOOTPRINT);
    const d = Math.min(b.depth, MAX_FOOTPRINT);
    const turned = o.rot === 90 || o.rot === 270;
    const [x, z] = lotToWorld(o.x, o.z);
    out.push({
      ...b,
      position: [x, 0, z],
      width: turned ? d : w,
      depth: turned ? w : d,
    });
  }
  return out;
}
