// ─── Starter city ───────────────────────────────────────────
// Built on creation, and on first open for leagues made before cities: a road
// cross on x=0 and z=0, a plaza with a fountain on the 4 lots around the
// crossing, member buildings facing the roads (biggest nearest the center),
// and trees along the edges. The terrain is the smallest size that fits
// everyone without growing right away.

import { GROW_AT, MAX_SIZE, START_SIZE, maxLot, minLot } from "./grid";
import { faceRoad, freeLotsInOrder, lotKey } from "./placement";
import { TREE_TYPES, type CityOp } from "./types";

export interface StarterMember {
  developer_id: number;
  /** Anything that orders buildings by size (contributions). */
  weight: number;
}

export interface StarterCity {
  size: number;
  ops: CityOp[];
  /** Members that didn't fit even at MAX_SIZE. */
  unplaced: number[];
}

const PLAZA: [number, number][] = [
  [-1, -1],
  [1, -1],
  [-1, 1],
];
const FOUNTAIN: [number, number] = [1, 1];
const MAX_TREES = 24;

function roadLots(size: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = minLot(size); i <= maxLot(size); i++) {
    out.push([0, i]);
    if (i !== 0) out.push([i, 0]);
  }
  return out;
}

function fixedCount(size: number): number {
  return roadLots(size).length + PLAZA.length + 1;
}

/** Smallest even size that fits `members` buildings under the growth threshold. */
export function starterSize(members: number): number {
  for (let s = START_SIZE; s < MAX_SIZE; s += 2) {
    if (fixedCount(s) + members <= GROW_AT * s * s) return s;
  }
  return MAX_SIZE;
}

// Deterministic pick so the same league always gets the same trees.
function treeFor(x: number, z: number) {
  const h = Math.abs((x * 73856093) ^ (z * 19349663));
  return TREE_TYPES[h % TREE_TYPES.length];
}

export function starterOps(members: readonly StarterMember[]): StarterCity {
  const size = starterSize(members.length);
  const lo = minLot(size);
  const hi = maxLot(size);
  const ops: CityOp[] = [{ op: "init", size }];

  const roads = new Set<string>();
  const occupied = new Set<string>();
  for (const [x, z] of roadLots(size)) {
    roads.add(lotKey(x, z));
    occupied.add(lotKey(x, z));
    ops.push({ op: "place", kind: "item", item_type: "road", x, z });
  }
  for (const [x, z] of PLAZA) {
    occupied.add(lotKey(x, z));
    ops.push({ op: "place", kind: "item", item_type: "plaza", x, z });
  }
  occupied.add(lotKey(...FOUNTAIN));
  ops.push({ op: "place", kind: "item", item_type: "fountain", x: FOUNTAIN[0], z: FOUNTAIN[1] });

  const sorted = [...members].sort((a, b) => b.weight - a.weight || a.developer_id - b.developer_id);
  const lots = freeLotsInOrder(occupied, roads, lo, hi);
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

  // Every third free lot on the outer ring gets a tree, while under the threshold.
  const budget = Math.min(MAX_TREES, Math.floor(GROW_AT * size * size) - occupied.size);
  let trees = 0;
  let ringIndex = 0;
  for (let x = lo; x <= hi && trees < budget; x++) {
    for (let z = lo; z <= hi && trees < budget; z++) {
      if (x !== lo && x !== hi && z !== lo && z !== hi) continue;
      if (occupied.has(lotKey(x, z))) continue;
      if (ringIndex++ % 3 !== 0) continue;
      occupied.add(lotKey(x, z));
      ops.push({ op: "place", kind: "item", item_type: treeFor(x, z), x, z });
      trees++;
    }
  }

  return { size, ops, unplaced };
}
