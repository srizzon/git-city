// ─── Starter city ───────────────────────────────────────────
// Built on creation, and on first open for leagues made before cities. The
// city is anchored at its entrance (z = 0, see grid.ts): a main street on
// x = 0 for the whole depth with the portal at its south end, a cross street
// through the middle, and a plaza with a fountain on the four lots flanking
// the street right after the entrance, so arrivals cross the plaza first.
// Member buildings face the roads (biggest nearest the entrance), trees line
// the edges. The terrain is the smallest that fits everyone without growing
// right away. The portal and the two entrance road lots are locked.

import { GROW_AT, LOT, MAX_H, START_H, bounds, lotCount } from "./grid";
import { faceRoad, freeLotsInOrder, lotKey } from "./placement";
import { TREE_TYPES, type CityOp } from "./types";

export interface StarterMember {
  developer_id: number;
  /** Anything that orders buildings by size (contributions). */
  weight: number;
}

export interface StarterCity {
  h: number;
  ops: CityOp[];
  /** Members that didn't fit even at MAX_H. */
  unplaced: number[];
}

/** The entrance road lots: locked, never editable. */
export const ENTRANCE: readonly [number, number][] = [
  [0, 0],
  [0, -1],
];
/** The portal stands over the entrance road, at the south edge of the city. */
export const PORTAL_POS: readonly [number, number] = [0, 4];

const PLAZA: [number, number][] = [
  [-1, 0],
  [1, 0],
  [-1, -1],
  [1, -1],
];
/** The fountain stands in the middle of the (1, -1) plaza. */
const FOUNTAIN: [number, number] = [1, -1];
const MAX_TREES = 24;

function roadLots(h: number): [number, number][] {
  const b = bounds(h);
  const cross = -h;
  const out: [number, number][] = [];
  for (let z = b.z1; z >= b.z0; z--) out.push([0, z]);
  for (let x = b.x0; x <= b.x1; x++) if (x !== 0) out.push([x, cross]);
  return out;
}

function fixedCount(h: number): number {
  return roadLots(h).length + PLAZA.length;
}

/** Smallest half-width that fits `members` buildings under the growth threshold. */
export function starterH(members: number): number {
  for (let h = START_H; h < MAX_H; h++) {
    if (fixedCount(h) + members <= GROW_AT * lotCount(h)) return h;
  }
  return MAX_H;
}

// Deterministic pick so the same league always gets the same trees.
function treeFor(x: number, z: number) {
  const n = Math.abs((x * 73856093) ^ (z * 19349663));
  return TREE_TYPES[n % TREE_TYPES.length];
}

const isEntrance = (x: number, z: number) => ENTRANCE.some(([ex, ez]) => ex === x && ez === z);

export function starterOps(members: readonly StarterMember[]): StarterCity {
  const h = starterH(members.length);
  const b = bounds(h);
  const ops: CityOp[] = [{ op: "init", h }];

  const roads = new Set<string>();
  const occupied = new Set<string>();
  for (const [x, z] of roadLots(h)) {
    roads.add(lotKey(x, z));
    occupied.add(lotKey(x, z));
    ops.push({ op: "place", kind: "item", item_type: "road", x, z, ...(isEntrance(x, z) ? { locked: true } : {}) });
  }
  ops.push({ op: "place", kind: "item", item_type: "portal", px: PORTAL_POS[0], pz: PORTAL_POS[1], locked: true });
  for (const [x, z] of PLAZA) {
    occupied.add(lotKey(x, z));
    ops.push({ op: "place", kind: "item", item_type: "plaza", x, z });
  }
  ops.push({ op: "place", kind: "item", item_type: "fountain", px: FOUNTAIN[0] * LOT, pz: FOUNTAIN[1] * LOT });

  const sorted = [...members].sort((a, c) => c.weight - a.weight || a.developer_id - c.developer_id);
  const lots = freeLotsInOrder(occupied, roads, b);
  const unplaced: number[] = [];
  sorted.forEach((m, i) => {
    const lot = lots[i];
    if (!lot) {
      unplaced.push(m.developer_id);
      return;
    }
    const [x, z] = lot;
    occupied.add(lotKey(x, z));
    ops.push({ op: "place", kind: "building", developer_id: m.developer_id, x, z, rot: faceRoad(roads, x, z) });
  });

  // Every third free lot on the edges gets a tree, while under the threshold.
  const budget = Math.min(MAX_TREES, Math.floor(GROW_AT * lotCount(h)) - occupied.size);
  let trees = 0;
  let ringIndex = 0;
  for (let x = b.x0; x <= b.x1 && trees < budget; x++) {
    for (let z = b.z0; z <= b.z1 && trees < budget; z++) {
      if (x !== b.x0 && x !== b.x1 && z !== b.z0 && z !== b.z1) continue;
      if (occupied.has(lotKey(x, z))) continue;
      if (ringIndex++ % 3 !== 0) continue;
      occupied.add(lotKey(x, z));
      ops.push({ op: "place", kind: "item", item_type: treeFor(x, z), px: x * LOT, pz: z * LOT });
      trees++;
    }
  }

  return { h, ops, unplaced };
}
