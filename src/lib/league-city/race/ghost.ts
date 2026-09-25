// ─── Ghost, splits and medals ───────────────────────────────
// Your best lap on this track, recorded as you drive it: the car's path (for
// the ghost you race against), the time at each checkpoint (for the split
// deltas) and the lap time (for the medals). Kept in this browser only.

import { TRACK_ID } from "./track";

/** Frames per second the ghost records. */
const RATE_MS = 50;
const MAX_FRAMES = 20 * 60 * 3; // 3 minutes

export interface GhostRun {
  ms: number;
  /** Time into the lap (ms) at each checkpoint index; [0] is 0. */
  splits: number[];
  /** Flat [t, x, z, yaw, …]: time into the lap (ms), meters, radians. */
  frames: number[];
}

export class GhostRecorder {
  private frames: number[] = [];
  private splits: number[] = [0];
  private start: number | null = null;
  private last = -Infinity;

  /** A lap starts at `at` (the clock the lap timing uses). */
  begin(at: number): void {
    this.start = at;
    this.frames = [];
    this.splits = [0];
    this.last = -Infinity;
  }

  /** Stop recording until the next begin (a restart). */
  clear(): void {
    this.start = null;
  }

  get running(): boolean {
    return this.start !== null;
  }

  push(now: number, x: number, z: number, yaw: number): void {
    if (this.start === null || now - this.last < RATE_MS || this.frames.length >= MAX_FRAMES * 4) return;
    this.last = now;
    this.frames.push(Math.round(now - this.start), Math.round(x * 100) / 100, Math.round(z * 100) / 100, Math.round(yaw * 1000) / 1000);
  }

  checkpoint(k: number, at: number): void {
    if (this.start !== null) this.splits[k] = Math.round(at - this.start);
  }

  /** The lap just ended in `ms`: the run, or null when nothing was recorded. */
  finish(ms: number): GhostRun | null {
    if (this.start === null || this.frames.length < 8) return null;
    return { ms, splits: [...this.splits], frames: [...this.frames] };
  }
}

/** The ghost at `t` ms into its lap, or null past its end. */
export function ghostAt(run: GhostRun, t: number): { x: number; z: number; yaw: number } | null {
  const f = run.frames;
  const n = f.length / 4;
  if (n === 0 || t > f[(n - 1) * 4]) return null;
  if (t <= f[0]) return { x: f[1], z: f[2], yaw: f[3] };
  // Binary search for the frame at or before t.
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (f[mid * 4] <= t) lo = mid;
    else hi = mid;
  }
  const a = lo * 4;
  const b = hi * 4;
  const k = (t - f[a]) / Math.max(1, f[b] - f[a]);
  let dy = f[b + 3] - f[a + 3];
  dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  return { x: f[a + 1] + (f[b + 1] - f[a + 1]) * k, z: f[a + 2] + (f[b + 2] - f[a + 2]) * k, yaw: f[a + 3] + dy * k };
}

const key = (slug: string) => `gc:race-ghost:${slug}:${TRACK_ID}`;

export function loadGhost(slug: string): GhostRun | null {
  try {
    const raw = localStorage.getItem(key(slug));
    if (!raw) return null;
    const g = JSON.parse(raw) as GhostRun;
    return Number.isFinite(g.ms) && Array.isArray(g.frames) && Array.isArray(g.splits) ? g : null;
  } catch {
    return null;
  }
}

export function saveGhost(slug: string, run: GhostRun): void {
  try {
    localStorage.setItem(key(slug), JSON.stringify(run));
  } catch {
    // storage full or blocked: the ghost lasts this visit
  }
}

// ─── Medals ──────────────────────────────────────────────────

export type Medal = "bronze" | "silver" | "gold";

/** Lap times for each medal (ms). Tune by driving. */
export const MEDALS: [Medal, number][] = [
  ["gold", 31_000],
  ["silver", 35_000],
  ["bronze", 41_000],
];

export const MEDAL_COLORS: Record<Medal, string> = { gold: "#ffcf33", silver: "#cfd8e3", bronze: "#d98a4e" };

/** The best medal a lap time earns, or null. */
export function medalFor(ms: number | null): Medal | null {
  if (ms === null) return null;
  for (const [m, t] of MEDALS) if (ms <= t) return m;
  return null;
}
