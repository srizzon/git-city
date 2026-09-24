// ─── Spawn and recovery ─────────────────────────────────────
// Where the car starts (and respawns): on the road in front of your building,
// else the crossing nearest the center, else the free lot nearest the center.
// Also flip detection and the push-out lot when a building lands on the car.

import { lotKey } from "../placement";
import { LOT, maxLot, minLot } from "../grid";
import type { CityObject } from "../types";

/** City units, and a heading in degrees clockwise from north. */
export interface Spawn {
  x: number;
  z: number;
  rot: number;
}

type Obj = Pick<CityObject, "kind" | "item_type" | "developer_id" | "x" | "z" | "px" | "pz">;

const DIRS: [number, number][] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

function roadSet(objects: readonly Obj[]): Set<string> {
  return new Set(objects.filter((o) => o.px === null && o.item_type === "road").map((o) => lotKey(o.x, o.z)));
}

/** Heading along a road: north-south when it connects that way, else east-west. */
function roadHeading(roads: ReadonlySet<string>, x: number, z: number): number {
  if (roads.has(lotKey(x, z - 1)) || roads.has(lotKey(x, z + 1))) return 0;
  if (roads.has(lotKey(x + 1, z)) || roads.has(lotKey(x - 1, z))) return 90;
  return 0;
}

function neighbors(roads: ReadonlySet<string>, x: number, z: number): number {
  return DIRS.filter(([dx, dz]) => roads.has(lotKey(x + dx, z + dz))).length;
}

export function spawnPoint(objects: readonly Obj[], viewerDevId: number | null, size: number): Spawn {
  const roads = roadSet(objects);
  const at = (x: number, z: number, rot: number): Spawn => ({ x: x * LOT, z: z * LOT, rot });

  const mine = viewerDevId === null ? undefined : objects.find((o) => o.kind === "building" && o.developer_id === viewerDevId);
  if (mine) {
    for (const [dx, dz] of DIRS) {
      const x = mine.x + dx;
      const z = mine.z + dz;
      if (roads.has(lotKey(x, z))) return at(x, z, roadHeading(roads, x, z));
    }
  }

  let best: { x: number; z: number; score: number } | null = null;
  for (const key of roads) {
    const [x, z] = key.split(",").map(Number);
    // Crossings first, then nearest the center.
    const score = -neighbors(roads, x, z) * 1000 + Math.hypot(x, z);
    if (!best || score < best.score) best = { x, z, score };
  }
  if (best) return at(best.x, best.z, roadHeading(roads, best.x, best.z));

  const [x, z] = nearestFreeLot(objects, size, 0, 0) ?? [0, 0];
  return at(x, z, 0);
}

/** Upside down or on its side, from the car's local up vector in world space. */
export function isFlipped(up: { y: number }): boolean {
  return up.y < 0.3;
}

/**
 * The lot nearest a world point (city units) with no building and no prop
 * near its center, or null when the city is full.
 */
export function nearestFreeLot(objects: readonly Obj[], size: number, wx: number, wz: number): [number, number] | null {
  const taken = new Set<string>();
  for (const o of objects) {
    if (o.kind === "building") taken.add(lotKey(o.x, o.z));
    else if (o.px !== null && o.pz !== null && Math.abs(o.px - o.x * LOT) < LOT * 0.3 && Math.abs(o.pz - o.z * LOT) < LOT * 0.3) taken.add(lotKey(o.x, o.z));
  }
  let best: [number, number] | null = null;
  let bestD = Infinity;
  for (let x = minLot(size); x <= maxLot(size); x++) {
    for (let z = minLot(size); z <= maxLot(size); z++) {
      if (taken.has(lotKey(x, z))) continue;
      const d = (x * LOT - wx) ** 2 + (z * LOT - wz) ** 2;
      if (d < bestD) {
        bestD = d;
        best = [x, z];
      }
    }
  }
  return best;
}
