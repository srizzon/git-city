// ─── Drive telemetry ────────────────────────────────────────
// What the car reports to the HUD every frame. A plain mutable object, read
// in requestAnimationFrame by the HUD, so driving never re-renders React.

export interface DriveTelemetry {
  /** m/s, forward. */
  speed: number;
  boosting: boolean;
  drifting: boolean;
  /** Login of the building you can honk at right now. */
  near: string | null;
  /** The attack you hold, and when you got it (performance.now ms). */
  held: string | null;
  gotAt: number;
  /** Smash: when you last ran into a building signed out (performance.now ms, 0 never). */
  sideHintAt: number;
  /** Smash: when you last ran into a shielded building, and hours left on its shield. */
  shieldHintAt: number;
  shieldHours: number;
  /** Smash: parked against your broken building, its floors standing and in all (0 = not rebuilding). */
  rebuildFloors: number;
  rebuildOf: number;
  /** Smash: your floors today (UTC) as the room counts them; null until it says you may smash. */
  floorsToday: number | null;
  /** Smash: when your floors hit the day's cap (performance.now ms, 0 never). */
  floorsMaxedAt: number;
  /** The minimap's feed (city units), written every frame by the drive world. */
  radar: RadarFeed;
  /** Drive here (the building card): the building the arrow over the car points at, null once you get there. */
  route: DriveRoute | null;
}

export interface DriveRoute {
  login: string;
  /** The building's center, city units. */
  x: number;
  z: number;
  /** Close enough to count as there, city units from the center. */
  reach: number;
}

export interface RadarCar {
  x: number;
  z: number;
  color: string;
  bot: boolean;
}

export interface RadarFeed {
  x: number;
  z: number;
  /** Where the car points, radians clockwise from north (-z). */
  heading: number;
  cars: RadarCar[];
  /** Crown Rush: where the crown is while a match runs. */
  crown: { x: number; z: number } | null;
}

export function createTelemetry(route: DriveRoute | null = null): DriveTelemetry {
  return { speed: 0, boosting: false, drifting: false, near: null, held: null, gotAt: 0, sideHintAt: 0, shieldHintAt: 0, shieldHours: 0, rebuildFloors: 0, rebuildOf: 0, floorsToday: null, floorsMaxedAt: 0, radar: { x: 0, z: 0, heading: 0, cars: [], crown: null }, route };
}

export type DriveCameraMode = "chase" | "top";
