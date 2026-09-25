// ─── Race HUD state ─────────────────────────────────────────
// What the race world reports to the HUD. RaceTelemetry is mutated every
// frame and read in requestAnimationFrame, so driving never re-renders React.

import type { DriveTelemetry } from "../drive/telemetry";
import type { RaceServerMsg } from "./net";
import type { RaceState } from "./race";

/** What the HUD reads every frame, without re-rendering. */
export interface RaceTelemetry extends DriveTelemetry {
  /** Mini-turbo charge of the drift under way (0 none … 3 purple), and a turbo firing. */
  driftLevel: number;
  turbo: boolean;
  /** Latest split vs your best lap: delta (ms, negative is faster) and when it came (performance.now). */
  split: { delta: number; at: number } | null;
  /** Server-clock ms when the lap under way started, or null. */
  lapStart: number | null;
  /** serverNow = Date.now() + offset. */
  offset: number;
  wrongWay: boolean;
  /** Lights lit (0–5). */
  lights: number;
}

export function createRaceTelemetry(): RaceTelemetry {
  return { speed: 0, boosting: false, near: null, held: null, gotAt: 0, driftLevel: 0, turbo: false, split: null, lapStart: null, offset: 0, wrongWay: false, lights: 0 };
}

export interface RaceView {
  race: RaceState;
  offset: number;
  you: string | null;
  progress: Record<string, number>;
}

export type LapNews = Extract<RaceServerMsg, { t: "lap" } | { t: "void" }>;
