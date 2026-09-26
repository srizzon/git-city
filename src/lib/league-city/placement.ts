// ─── Placement checks ───────────────────────────────────────
// Client-side mirror of apply_league_city_ops' bounds and lot checks, so the
// editor ghost can show green/red before a save.

import { inBounds, type LotBounds } from "./grid";
import type { CityObject } from "./types";

export type PlaceResult = { ok: true } | { ok: false; reason: "out_of_bounds" | "lot_taken" };

type Lot = Pick<CityObject, "id" | "x" | "z">;

/** Whether (x, z) is free for a new object, or for `movingId` to move there. */
export function canPlace(objects: readonly Lot[], h: number, x: number, z: number, movingId?: string): PlaceResult {
  if (!Number.isInteger(x) || !Number.isInteger(z) || !inBounds(h, x, z)) return { ok: false, reason: "out_of_bounds" };
  for (const o of objects) {
    if (o.x === x && o.z === z && o.id !== movingId) return { ok: false, reason: "lot_taken" };
  }
  return { ok: true };
}

/**
 * Free lots in the order auto-placement picks them: touching a road first,
 * then nearest the middle of the city, so a town grows from its center out
 * instead of piling up at the gate. Mirrors apply_league_city_ops (153).
 */
export function freeLotsInOrder(occupied: ReadonlySet<string>, roads: ReadonlySet<string>, b: LotBounds): [number, number][] {
  const touchesRoad = (x: number, z: number) =>
    roads.has(lotKey(x, z - 1)) || roads.has(lotKey(x + 1, z)) || roads.has(lotKey(x, z + 1)) || roads.has(lotKey(x - 1, z));
  // Doubled so the half-lot center stays an integer: (2x - (x0 + x1))² + (2z - (z0 + z1))².
  const cx = b.x0 + b.x1;
  const cz = b.z0 + b.z1;
  const lots: { x: number; z: number; road: boolean; d: number }[] = [];
  for (let x = b.x0; x <= b.x1; x++) {
    for (let z = b.z0; z <= b.z1; z++) {
      if (!occupied.has(lotKey(x, z))) lots.push({ x, z, road: touchesRoad(x, z), d: (2 * x - cx) ** 2 + (2 * z - cz) ** 2 });
    }
  }
  lots.sort((a, b) => Number(b.road) - Number(a.road) || a.d - b.d || a.z - b.z || a.x - b.x);
  return lots.map((l) => [l.x, l.z]);
}

/** Direction to the first road neighbor (N, E, S, W), as a rot. 0 without one. */
export function faceRoad(roads: ReadonlySet<string>, x: number, z: number): 0 | 90 | 180 | 270 {
  if (roads.has(lotKey(x, z - 1))) return 0;
  if (roads.has(lotKey(x + 1, z))) return 90;
  if (roads.has(lotKey(x, z + 1))) return 180;
  if (roads.has(lotKey(x - 1, z))) return 270;
  return 0;
}

export function lotKey(x: number, z: number): string {
  return `${x},${z}`;
}
