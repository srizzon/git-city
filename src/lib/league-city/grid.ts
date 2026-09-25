// ─── League city grid ───────────────────────────────────────
// A grid of LOT-unit lots anchored at the entrance. A city of half-width `h`
// spans x in [-h, h] and z in [-2h+1, 0]: south is +z, so z = 0 is the
// entrance row, and the city grows north, east and west, never south. Mirrors
// league_city_bounds (migration 145).
//
// Directions and `rot`: clockwise from north (-z), in degrees.
//   0 = N (-z), 90 = E (+x), 180 = S (+z), 270 = W (-x).
// In three.js (y up), a clockwise turn seen from above is rotation.y = -rot.

export const LOT = 48;
/** 13 × 12 lots. */
export const START_H = 6;
/** 41 × 40 lots. */
export const MAX_H = 20;
export const GROW_AT = 0.7;

export type Rot = 0 | 90 | 180 | 270;

export interface LotBounds {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** Lot range of a city of half-width h (inclusive). */
export function bounds(h: number): LotBounds {
  return { x0: -h, x1: h, z0: -2 * h + 1, z1: 0 };
}

/** Number of lots in the city. */
export function lotCount(h: number): number {
  return (2 * h + 1) * 2 * h;
}

export function inBounds(h: number, x: number, z: number): boolean {
  const b = bounds(h);
  return x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1;
}

/** World-space rectangle of the city's ground (lot edges). */
export function worldBounds(h: number): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const b = bounds(h);
  return { minX: (b.x0 - 0.5) * LOT, maxX: (b.x1 + 0.5) * LOT, minZ: (b.z0 - 0.5) * LOT, maxZ: (b.z1 + 0.5) * LOT };
}

/** Center of a lot in world units. */
export function lotToWorld(x: number, z: number): [number, number] {
  return [x * LOT, z * LOT];
}

/** The lot under a world position. */
export function worldToLot(wx: number, wz: number): [number, number] {
  return [Math.round(wx / LOT), Math.round(wz / LOT)];
}

/** World-space center and size of the terrain. */
export function terrainBounds(h: number): { cx: number; cz: number; width: number; depth: number } {
  const w = worldBounds(h);
  return { cx: (w.minX + w.maxX) / 2, cz: (w.minZ + w.maxZ) / 2, width: w.maxX - w.minX, depth: w.maxZ - w.minZ };
}

/** True when `occupied` lot objects fill more than GROW_AT of the terrain. */
export function shouldGrow(occupied: number, h: number): boolean {
  return h < MAX_H && occupied > GROW_AT * lotCount(h);
}

/** Half-width after growing one step at a time until occupancy is under the threshold. */
export function grownH(occupied: number, h: number): number {
  let n = h;
  while (shouldGrow(occupied, n)) n += 1;
  return n;
}

export function rotToRadians(rot: number): number {
  return (-rot * Math.PI) / 180;
}
