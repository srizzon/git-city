// ─── Autopilot ──────────────────────────────────────────────
// Drives your car once you've crossed the finish, like Mario Kart hands the
// kart to the CPU: follow the centerline, ease off before the tight corners,
// never drift or boost. Pure: reads where the car is, returns its controls.

import type { DriveInput } from "../drive/input";
import { locate, locateNear, pointAt, type Track } from "./track";

export const AUTOPILOT = {
  /** Cruising speed on the straights (m/s): a lap of honour, not a hot lap. */
  cruise: 19,
  /** Corner speed from curvature: v = sqrt(lateral / |k|) (m/s²). */
  lateral: 6,
  /** Aim this far ahead (m), plus `lead` s of travel. */
  look: 6,
  lead: 0.6,
  /** How far ahead to read the corners (m). */
  scan: 30,
  /** Steering per radian off the aim point. */
  gain: 2.5,
};

export interface AutopilotState {
  /** Where the car was along the track last step (m), or null to find it from scratch. */
  s: number | null;
}

const IDLE: DriveInput = {
  throttle: 0,
  brake: 0,
  steer: 0,
  handbrake: false,
  boost: false,
  horn: false,
  camera: false,
  reset: false,
  fire: false,
};

/** The speed the corners in the next `scan` m allow (m/s). */
export function safeSpeed(track: Track, s: number): number {
  const n = track.samples.length;
  const step = track.length / n;
  const i0 = Math.floor(s / step);
  let k = 0;
  for (let j = 0; j <= Math.ceil(AUTOPILOT.scan / step); j++) {
    k = Math.max(k, Math.abs(track.samples[(i0 + j) % n].k));
  }
  return k < 1e-4 ? AUTOPILOT.cruise : Math.min(AUTOPILOT.cruise, Math.sqrt(AUTOPILOT.lateral / k));
}

/**
 * Controls for a car at (x, z) m, heading `heading` (radians about y; +z
 * forward is 0), going `speed` m/s.
 */
export function autopilot(track: Track, st: AutopilotState, x: number, z: number, heading: number, speed: number): DriveInput {
  const spot = st.s === null ? locate(track, x, z, 80) : locateNear(track, x, z, st.s, 20, 40);
  if (!spot) return IDLE;
  st.s = spot.s;
  const aim = pointAt(track, spot.s + AUTOPILOT.look + Math.max(0, speed) * AUTOPILOT.lead);
  const want = Math.atan2(aim.x - x, aim.z - z);
  const off = Math.atan2(Math.sin(want - heading), Math.cos(want - heading));
  // Turning toward +x from +z is a positive angle, and that's to the left: steer the other sign.
  const steer = Math.max(-1, Math.min(1, -off * AUTOPILOT.gain));
  const target = safeSpeed(track, spot.s);
  return {
    ...IDLE,
    steer,
    throttle: speed < target ? 1 : 0,
    brake: speed > target + 3 ? 1 : 0,
  };
}
