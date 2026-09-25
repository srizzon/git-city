// ─── Race HUD state ─────────────────────────────────────────
// What the race world reports to the HUD. RaceTelemetry is mutated every
// frame and read in requestAnimationFrame, so driving never re-renders React.

import type { DriveTelemetry } from "../drive/telemetry";
import { BOOST } from "../drive/tuning";
import type { RaceServerMsg } from "./net";
import type { RaceState } from "./race";

/** What the HUD reads every frame, without re-rendering. */
export interface RaceTelemetry extends DriveTelemetry {
  /** Boost tank 0…1. */
  fuel: number;
  /** Server-clock ms when the lap under way started, or null. */
  lapStart: number | null;
  /** serverNow = Date.now() + offset. */
  offset: number;
  wrongWay: boolean;
  /** Lights lit (0–5). */
  lights: number;
}

export function createRaceTelemetry(): RaceTelemetry {
  return { speed: 0, boosting: false, near: null, held: null, gotAt: 0, fuel: BOOST.startFuel, lapStart: null, offset: 0, wrongWay: false, lights: 0 };
}

export interface RaceView {
  race: RaceState;
  offset: number;
  you: string | null;
  progress: Record<string, number>;
}

export type LapNews = Extract<RaceServerMsg, { t: "lap" } | { t: "void" }>;
