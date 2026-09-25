// ─── Time trial flow ────────────────────────────────────────
// The run from the title to the results: the title card, a flyover (first
// time only), 3-2-1-GO, the three laps, then the finish with the car on
// autopilot while the results come in. R from anywhere past the title goes
// straight back to a short countdown, like Trackmania.

export type TrialStage = "title" | "intro" | "countdown" | "run" | "finish";

export const TRIAL = {
  /** The flyover (ms). */
  introMs: 4200,
  /** One beat of 3-2-1 (ms): the first countdown, then retries. */
  beatMs: 1000,
  retryBeatMs: 500,
  beats: 3,
  /** After the line: FINISH leaves, then the results come in (ms). */
  bannerMs: 1500,
  resultsMs: 2500,
  /** A trackside camera holds this long at most (ms). */
  tvShotMs: 6000,
  /** Throttle cut after a jumped launch (ms). */
  stallMs: 700,
  /** Turbo level a rocket start fires. */
  rocketLevel: 2,
} as const;

/** What the countdown shows `elapsed` ms in: 3, 2, 1, then 0 for GO. */
export function countdownBeat(elapsed: number, beatMs: number): number {
  return Math.max(0, TRIAL.beats - Math.floor(Math.max(0, elapsed) / beatMs));
}

export type Launch = "none" | "rocket" | "early";

/**
 * Rocket start, after Mario Kart: hold the throttle from the "2" to GO and
 * the car launches with a turbo. Held since the "3" and the wheels spin.
 * `heldFrom` is when the throttle went down (ms into the countdown) and
 * stayed down, or null if it isn't down at GO.
 */
export function judgeLaunch(heldFrom: number | null, beatMs: number): Launch {
  if (heldFrom === null) return "none";
  if (heldFrom < beatMs) return "early";
  if (heldFrom < beatMs * 2) return "rocket";
  return "none";
}

/** Gantry lamps (0–5) for a countdown beat: two, four, all five, then out. */
export function trialLights(beat: number): number {
  return beat === 3 ? 2 : beat === 2 ? 4 : beat === 1 ? 5 : 0;
}

export interface RunLap {
  ms: number;
  valid: boolean;
}

/** A run is a record only when every lap counted. */
export function runCounts(laps: readonly RunLap[]): boolean {
  return laps.length > 0 && laps.every((l) => l.valid);
}
