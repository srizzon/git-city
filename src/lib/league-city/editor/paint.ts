// ─── Road painting ──────────────────────────────────────────
// Dragging the road tool paints an L: along x first, then along z. Lots that
// are already road are skipped; the path stops at the first occupied lot or
// the edge of the city.

import { inBounds } from "../grid";
import { lotKey } from "../placement";
import type { CityObject } from "../types";

export type Lot = [number, number];

/** The lots an L walk visits from `from` to `to`, both ends included. */
export function lWalk(from: Lot, to: Lot): Lot[] {
  const [x0, z0] = from;
  const [x1, z1] = to;
  const out: Lot[] = [];
  const sx = Math.sign(x1 - x0);
  for (let x = x0; ; x += sx) {
    out.push([x, z0]);
    if (x === x1) break;
  }
  const sz = Math.sign(z1 - z0);
  for (let z = z0 + sz; sz !== 0; z += sz) {
    out.push([x1, z]);
    if (z === z1) break;
  }
  return out;
}

/** New road lots for a drag from `from` to `to`. */
export function lPath(from: Lot, to: Lot, objects: Iterable<Pick<CityObject, "x" | "z" | "item_type">>, size: number): Lot[] {
  const byLot = new Map<string, string | null>();
  for (const o of objects) byLot.set(lotKey(o.x, o.z), o.item_type);
  const out: Lot[] = [];
  for (const [x, z] of lWalk(from, to)) {
    if (!inBounds(size, x, z)) break;
    const k = lotKey(x, z);
    if (byLot.has(k)) {
      if (byLot.get(k) === "road") continue;
      break;
    }
    out.push([x, z]);
  }
  return out;
}
