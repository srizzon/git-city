// ─── Driving toys ───────────────────────────────────────────
// Sizes and layouts (city units) of the drive-mode props, shared by the
// renderer, the colliders and the car. `rot` turns them clockwise like every
// prop; at rot 0 a pad pushes north (-z) and a bump or wall runs east-west.

import { rotToRadians } from "./grid";

export const BOOST_PAD = { width: 10, length: 16 };
export const SPEED_BUMP = { width: 22, depth: 3, height: 0.8 };
export const CONE = { radius: 1, height: 2.5 };
export const CRATE = 3.5;
export const TIRE = { radius: 1.6, width: 1.2 };
export const TIRE_WALL = { count: 5, rows: 2 };

/** Local (x, z) → world, for a prop at (px, pz) turned `rot` degrees. */
export function toWorld(px: number, pz: number, rot: number, x: number, z: number): [number, number] {
  const a = rotToRadians(rot);
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [px + x * c + z * s, pz - x * s + z * c];
}

/** World → the prop's local (x, z). */
export function toLocal(px: number, pz: number, rot: number, wx: number, wz: number): [number, number] {
  const a = rotToRadians(rot);
  const c = Math.cos(a);
  const s = Math.sin(a);
  const dx = wx - px;
  const dz = wz - pz;
  return [dx * c - dz * s, dx * s + dz * c];
}

/** Unit push direction (world x, z) of a boost pad turned `rot`. */
export function padDirection(rot: number): [number, number] {
  const a = (rot * Math.PI) / 180;
  return [Math.sin(a), -Math.cos(a)];
}

type Placed = { px: number | null; pz: number | null; rot: number; item_type: string | null; id: string };

/** The boost pad under a world point, if any. */
export function padAt<T extends Placed>(props: Iterable<T>, wx: number, wz: number): T | undefined {
  for (const p of props) {
    if (p.item_type !== "boost_pad" || p.px === null || p.pz === null) continue;
    const [x, z] = toLocal(p.px, p.pz, p.rot, wx, wz);
    if (Math.abs(x) <= BOOST_PAD.width / 2 && Math.abs(z) <= BOOST_PAD.length / 2) return p;
  }
  return undefined;
}

/** Crate centers in the stack's local frame: 3 on the ground, 2 on them, 1 on top. */
export function crateLayout(): [number, number, number][] {
  const out: [number, number, number][] = [];
  const rows = [3, 2, 1];
  rows.forEach((n, row) => {
    for (let i = 0; i < n; i++) out.push([(i - (n - 1) / 2) * CRATE, CRATE / 2 + row * CRATE, 0]);
  });
  return out;
}

/** Tire centers (x, y) in the wall's local frame: standing tires, axle along z, a shorter row on top. */
export function tireLayout(): [number, number][] {
  const out: [number, number][] = [];
  for (let row = 0; row < TIRE_WALL.rows; row++) {
    const n = TIRE_WALL.count - row;
    for (let i = 0; i < n; i++) out.push([(i - (n - 1) / 2) * TIRE.radius * 2, TIRE.radius + row * TIRE.radius * 1.8]);
  }
  return out;
}

export const TIRE_WALL_WIDTH = TIRE_WALL.count * TIRE.radius * 2;
export const TIRE_WALL_HEIGHT = TIRE.radius * 2 + (TIRE_WALL.rows - 1) * TIRE.radius * 1.8;
