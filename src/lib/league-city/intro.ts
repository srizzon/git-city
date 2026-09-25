// ─── Town intro ─────────────────────────────────────────────
// First visit: a car drives in. It starts far out on the approach road, well
// before the portal, with the camera riding behind it (drive mode's chase
// view). Just after it passes the arch, the camera lifts to the scene's
// normal frame while the car brakes to a stop up the main street, and the
// orbit controls take over.
//
// This file is the route and timing, pure and testable; TownIntro plays it.

import { LOT } from "./grid";
import { APPROACH_LOTS } from "./identity-geometry";

/** Keep right: lane center off the road's middle, city units. */
export const LANE = 6;
/** City units per second (about 55 km/h in drive mode's scale). */
export const CRUISE = 52;
/** Seconds for the camera to go from the chase view to the city frame. */
export const RISE = 3.5;
/** How far past the arch the camera lets go of the car. */
const PAST_ARCH = 30;

export interface CarIntro {
  x: number;
  /** Where the car starts (z), far out on the approach. */
  startZ: number;
  /** The camera switches here, a little past the arch. */
  switchZ: number;
  /** The car comes to a stop here, braking during the rise. */
  stopZ: number;
  /** Seconds at cruise before the switch. */
  cruise: number;
  /** Seconds until the car passes under the arch (the title's beat). */
  crossAt: number;
  rise: number;
}

/** The drive, from the portal's z (the city's south edge). */
export function carIntro(gateZ = LOT / 2): CarIntro {
  const startZ = gateZ + APPROACH_LOTS * LOT - 16;
  const switchZ = gateZ - PAST_ARCH;
  // Braking from cruise to zero over the rise covers cruise × rise / 2.
  const stopZ = switchZ - (CRUISE * RISE) / 2;
  return { x: LANE, startZ, switchZ, stopZ, cruise: (startZ - switchZ) / CRUISE, crossAt: (startZ - gateZ) / CRUISE, rise: RISE };
}

/** The car's z at time t (seconds), and its speed. */
export function carAt(c: CarIntro, t: number): { z: number; speed: number } {
  if (t <= c.cruise) return { z: c.startZ - CRUISE * t, speed: CRUISE };
  const u = Math.min(t - c.cruise, c.rise);
  const speed = CRUISE * (1 - u / c.rise);
  return { z: c.switchZ - CRUISE * u + (CRUISE * u * u) / (2 * c.rise), speed };
}

export function introSeconds(c: CarIntro): number {
  return c.cruise + c.rise;
}
