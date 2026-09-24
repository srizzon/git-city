// ─── Toys and buildings, from the car ───────────────────────
// Pure rules the car runs each step: how a boost pad changes your velocity,
// and which teammate's building you can honk at.

import type { CityBuilding } from "@/lib/github";
import { padDirection } from "../toys";
import { TOYS } from "./tuning";

/** Velocity change (m/s, world x/z) a pad turned `rot` gives a car moving at (vx, vz). */
export function padKick(vx: number, vz: number, rot: number): [number, number] {
  const [dx, dz] = padDirection(rot);
  const along = vx * dx + vz * dz;
  const add = Math.max(0, TOYS.padSpeed - along) + TOYS.padKick;
  return [dx * add, dz * add];
}

/** Close enough to honk: this far (city units) from a building's footprint, and slower than this (m/s). */
export const HONK_REACH = 14;
export const HONK_MAX_SPEED = 6;

/** The building you're parked in front of (nearest footprint within reach), if any. */
export function honkTarget(buildings: readonly CityBuilding[], wx: number, wz: number, speed: number): CityBuilding | null {
  if (Math.abs(speed) > HONK_MAX_SPEED) return null;
  let best: CityBuilding | null = null;
  let bestD = HONK_REACH;
  for (const b of buildings) {
    const dx = Math.max(0, Math.abs(wx - b.position[0]) - b.width / 2);
    const dz = Math.max(0, Math.abs(wz - b.position[2]) - b.depth / 2);
    const d = Math.hypot(dx, dz);
    if (d <= bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}
