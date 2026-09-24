// ─── Drive telemetry ────────────────────────────────────────
// What the car reports to the HUD every frame. A plain mutable object, read
// in requestAnimationFrame by the HUD, so driving never re-renders React.

export interface DriveTelemetry {
  /** m/s, forward. */
  speed: number;
  boosting: boolean;
  /** Login of the building you can honk at right now. */
  near: string | null;
  /** The attack you hold, when you got it (performance.now ms), and how deep in smoke you are (0…1). */
  held: string | null;
  gotAt: number;
  smoke: number;
}

export function createTelemetry(): DriveTelemetry {
  return { speed: 0, boosting: false, near: null, held: null, gotAt: 0, smoke: 0 };
}

export type DriveCameraMode = "chase" | "top";
