// ─── Props ──────────────────────────────────────────────────
// Free-standing decorations: a world position, a footprint radius, and rules
// mirrored from league_prop_problem (migration 128): inside the city, not on
// a building's lot, not on asphalt (roads are ROAD_HALF*2 wide: a center
// square plus an arm toward each road neighbor), not overlapping another prop.

import { LOT, maxLot, minLot } from "./grid";
import { lotKey } from "./placement";
import type { CityObject, ItemType } from "./types";

export const ROAD_HALF = 13;
export const SNAP = 4;

export const PROP_RADIUS: Record<Exclude<ItemType, "road" | "plaza">, number> = {
  lamp: 2,
  bench: 3.5,
  fountain: 10,
  tree_default: 7,
  tree_oak: 7,
  tree_fat: 7,
  tree_detailed: 7,
  tree_palm_tall: 7,
  tree_pine_tall_a: 7,
};

export function propRadius(t: ItemType | null): number {
  return t && t in PROP_RADIUS ? PROP_RADIUS[t as keyof typeof PROP_RADIUS] : 7;
}

export type PropProblem = "out_of_bounds" | "on_building" | "on_road" | "prop_overlap";

export const PROP_PROBLEM_TEXT: Record<PropProblem, string> = {
  out_of_bounds: "That's outside the city.",
  on_building: "That's on a building's lot.",
  on_road: "Keep it on the sidewalk, off the asphalt.",
  prop_overlap: "Too close to something else.",
};

/** Lot under a world point. */
export function lotOf(px: number, pz: number): [number, number] {
  return [Math.round(px / LOT), Math.round(pz / LOT)];
}

export function snap(v: number, free = false): number {
  return free ? Math.round(v * 10) / 10 : Math.round(v / SNAP) * SNAP;
}

function rectDist2(px: number, pz: number, x0: number, z0: number, x1: number, z1: number): number {
  const dx = Math.max(x0 - px, 0, px - x1);
  const dz = Math.max(z0 - pz, 0, pz - z1);
  return dx * dx + dz * dz;
}

/** Asphalt rectangles of a road lot, given which neighbors are roads. */
export function asphaltRects(isRoad: (x: number, z: number) => boolean, lx: number, lz: number): [number, number, number, number][] {
  const cx = lx * LOT;
  const cz = lz * LOT;
  const h = LOT / 2;
  const w = ROAD_HALF;
  const out: [number, number, number, number][] = [[cx - w, cz - w, cx + w, cz + w]];
  if (isRoad(lx, lz - 1)) out.push([cx - w, cz - h, cx + w, cz - w]);
  if (isRoad(lx, lz + 1)) out.push([cx - w, cz + w, cx + w, cz + h]);
  if (isRoad(lx + 1, lz)) out.push([cx + w, cz - w, cx + h, cz + w]);
  if (isRoad(lx - 1, lz)) out.push([cx - h, cz - w, cx - w, cz + w]);
  return out;
}

type Obj = Pick<CityObject, "id" | "kind" | "item_type" | "x" | "z" | "px" | "pz">;

/** Why a prop can't stand at (px, pz), or null when it can. `ignore` skips its own id. */
export function propProblem(
  objects: Iterable<Obj>,
  size: number,
  prop: { item_type: ItemType; px: number; pz: number; id?: string },
): PropProblem | null {
  const r = propRadius(prop.item_type);
  const lo = (minLot(size) - 0.5) * LOT;
  const hi = (maxLot(size) + 0.5) * LOT;
  if (prop.px - r < lo || prop.px + r > hi || prop.pz - r < lo || prop.pz + r > hi) return "out_of_bounds";

  const [lx, lz] = lotOf(prop.px, prop.pz);
  const all = [...objects];
  const roads = new Set(all.filter((o) => o.px === null && o.item_type === "road").map((o) => lotKey(o.x, o.z)));
  const isRoad = (x: number, z: number) => roads.has(lotKey(x, z));
  const h = LOT / 2;

  for (const o of all) {
    if (o.px !== null || Math.abs(o.x - lx) > 1 || Math.abs(o.z - lz) > 1) continue;
    const cx = o.x * LOT;
    const cz = o.z * LOT;
    if (o.kind === "building" && rectDist2(prop.px, prop.pz, cx - h, cz - h, cx + h, cz + h) < r * r) return "on_building";
    if (o.item_type === "road") {
      for (const [x0, z0, x1, z1] of asphaltRects(isRoad, o.x, o.z)) {
        if (rectDist2(prop.px, prop.pz, x0, z0, x1, z1) < r * r) return "on_road";
      }
    }
  }
  for (const o of all) {
    if (o.px === null || o.pz === null || o.id === prop.id) continue;
    const rr = propRadius(o.item_type) + r;
    if ((o.px - prop.px) ** 2 + (o.pz - prop.pz) ** 2 < rr * rr) return "prop_overlap";
  }
  return null;
}

/** The prop under a world point (nearest center within its radius). */
export function propAt(objects: Iterable<Obj>, wx: number, wz: number): Obj | undefined {
  let best: Obj | undefined;
  let bestD = Infinity;
  for (const o of objects) {
    if (o.px === null || o.pz === null) continue;
    const d = (o.px - wx) ** 2 + (o.pz - wz) ** 2;
    const r = Math.max(propRadius(o.item_type), 5);
    if (d < r * r && d < bestD) {
      best = o;
      bestD = d;
    }
  }
  return best;
}
