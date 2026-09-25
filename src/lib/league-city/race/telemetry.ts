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
  /** A turbo is banked: Shift fires it. */
  turboReady: boolean;
  /** Latest split vs your best lap: delta (ms, negative is faster) and when it came (performance.now). */
  split: { delta: number; at: number } | null;
  /** The last mini-turbo fired: its level and when (performance.now). */
  turboFlash: { level: number; at: number } | null;
  /** For the minimap (meters): you, your ghost, everyone else. */
  pos: { x: number; z: number } | null;
  ghostPos: { x: number; z: number } | null;
  others: { x: number; z: number; color: string }[];
  /** Server-clock ms when the lap under way started, or null. */
  lapStart: number | null;
  /** serverNow = Date.now() + offset. */
  offset: number;
  wrongWay: boolean;
  /** Lights lit (0–5). */
  lights: number;
}

export function createRaceTelemetry(): RaceTelemetry {
  return { speed: 0, boosting: false, near: null, held: null, gotAt: 0, driftLevel: 0, turbo: false, turboReady: false, split: null, turboFlash: null, pos: null, ghostPos: null, others: [], lapStart: null, offset: 0, wrongWay: false, lights: 0 };
}

export interface RaceView {
  race: RaceState;
  offset: number;
  you: string | null;
  progress: Record<string, number>;
}

export type LapNews = Extract<RaceServerMsg, { t: "lap" } | { t: "void" }>;
