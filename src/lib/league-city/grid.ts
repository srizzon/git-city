// ─── League city grid ───────────────────────────────────────
// Square grid of LOT-unit lots centered on (0,0). A city of `size` lots spans
// x, z in [-size/2, size - size/2 - 1] (size is always even). Mirrors the
// checks in apply_league_city_ops (migration 126).
//
// Directions and `rot`: clockwise from north (-z), in degrees.
//   0 = N (-z), 90 = E (+x), 180 = S (+z), 270 = W (-x).
// In three.js (y up), a clockwise turn seen from above is rotation.y = -rot.

export const LOT = 48;
export const START_SIZE = 12;
export const MAX_SIZE = 40;
export const GROW_AT = 0.7;

export type Rot = 0 | 90 | 180 | 270;

/** Lowest lot coordinate on each axis. */
export function minLot(size: number): number {
  return -Math.floor(size / 2);
}

/** Highest lot coordinate on each axis. */
export function maxLot(size: number): number {
  return size - Math.floor(size / 2) - 1;
}

export function inBounds(size: number, x: number, z: number): boolean {
  return x >= minLot(size) && x <= maxLot(size) && z >= minLot(size) && z <= maxLot(size);
}

/** Center of a lot in world units. */
export function lotToWorld(x: number, z: number): [number, number] {
  return [x * LOT, z * LOT];
}

/** The lot under a world position. */
export function worldToLot(wx: number, wz: number): [number, number] {
  return [Math.round(wx / LOT), Math.round(wz / LOT)];
}

/** World-space center and width of the terrain (it is off-center by half a lot). */
export function terrainBounds(size: number): { cx: number; cz: number; width: number } {
  const c = ((minLot(size) + maxLot(size)) / 2) * LOT;
  return { cx: c, cz: c, width: size * LOT };
}

/** True when `occupied` objects fill more than GROW_AT of the terrain. */
export function shouldGrow(occupied: number, size: number): boolean {
  return size < MAX_SIZE && occupied > GROW_AT * size * size;
}

/** Size after growing one ring at a time until occupancy is under the threshold. */
export function grownSize(occupied: number, size: number): number {
  let s = size;
  while (shouldGrow(occupied, s)) s += 2;
  return s;
}

export function rotToRadians(rot: number): number {
  return (-rot * Math.PI) / 180;
}
