// ─── Drive telemetry ────────────────────────────────────────
// What the car reports to the HUD every frame. A plain mutable object, read
// in requestAnimationFrame by the HUD, so driving never re-renders React.

export interface DriveTelemetry {
  /** m/s, forward. */
  speed: number;
  /** 0…1; boost is ready at 1. */
  boost: number;
  boosting: boolean;
}

export function createTelemetry(): DriveTelemetry {
  return { speed: 0, boost: 1, boosting: false };
}

export type DriveCameraMode = "chase" | "top";
