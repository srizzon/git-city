// ─── Road pieces ────────────────────────────────────────────
// A road lot's piece comes from which of its 4 neighbors are roads. Each shape
// has a base orientation; `rot` turns it clockwise (see grid.ts).

import type { Rot } from "./grid";

export const N = 1;
export const E = 2;
export const S = 4;
export const W = 8;

export type RoadShape = "single" | "end" | "straight" | "corner" | "tee" | "cross";

export interface RoadPiece {
  shape: RoadShape;
  rot: Rot;
}

// Base masks at rot 0.
const BASE: [RoadShape, number][] = [
  ["single", 0],
  ["end", N], //           opens north
  ["straight", N | S],
  ["corner", N | E],
  ["tee", N | E | S], //   closed west
  ["cross", N | E | S | W],
];

/** Turns a mask one step clockwise (N→E→S→W→N). */
function turn(mask: number): number {
  return ((mask << 1) | (mask >> 3)) & 0b1111;
}

export function roadPiece(mask: number): RoadPiece {
  const m = mask & 0b1111;
  for (const [shape, base] of BASE) {
    let b = base;
    for (let k = 0; k < 4; k++) {
      if (b === m) return { shape, rot: (k * 90) as Rot };
      b = turn(b);
    }
  }
  return { shape: "single", rot: 0 };
}

/** Neighbor mask for the lot (x, z), given a lookup of road lots. */
export function roadMask(isRoad: (x: number, z: number) => boolean, x: number, z: number): number {
  return (
    (isRoad(x, z - 1) ? N : 0) |
    (isRoad(x + 1, z) ? E : 0) |
    (isRoad(x, z + 1) ? S : 0) |
    (isRoad(x - 1, z) ? W : 0)
  );
}
