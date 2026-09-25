// ─── Lap timing ─────────────────────────────────────────────
// Turns a car's reported positions into laps. The PartyKit race server runs
// this on every state a driver sends, with its own clock, so a lap time never
// comes from the client; the client runs it too, only for its HUD.
// Relative imports only (the PartyKit party bundles this file).
//
// A lap counts only when:
// - every checkpoint was crossed in order (walls already stop shortcuts; a
//   skipped checkpoint means the car got past one without driving it),
// - the car never left the corridor between the walls,
// - it never moved faster than any car can (a teleport along the track),
// - and it took longer than the fastest lap a car could drive.
// Going backwards and R (back to the last checkpoint) are fine: neither gains
// anything, the checkpoints ahead still have to be crossed.

import { TRACK, WALL_OFFSET, arcDelta, locate, locateNear, type Track } from "./track";

export const LAP_RULES = {
  /** No car goes faster than this (m/s); boost tops out at 35. */
  maxSpeed: 40,
  /** Delivery jitter allowance: a late state followed by an on-time one (s). */
  jitter: 0.3,
  /** Speed is judged over this window (ms), so one bunched pair can't trip it. */
  window: 2000,
  /** Past the wall plus this much (m) and the car is out of bounds. */
  corridorSlack: 3,
  /** Look this far back (m) for the car's new spot, besides how far it could go ahead. */
  back: 80,
};

export type LapEvent =
  | { t: "start"; at: number }
  | { t: "checkpoint"; k: number; at: number }
  /** A full lap. `valid` false: timed, but it doesn't count. */
  | { t: "lap"; ms: number; valid: boolean; at: number }
  | { t: "invalid"; reason: InvalidReason };

export type InvalidReason = "skipped" | "out" | "speed";

export interface LapState {
  /** Where the car is along the track (m), or null before its first state. */
  s: number | null;
  /** Its last state's time (ms). */
  at: number;
  /** Next checkpoint to cross (index into track.checkpoints). */
  next: number;
  /** When the lap under way started (ms), or null until the car first crosses the start line. */
  lapStart: number | null;
  valid: boolean;
  /** Recent (time, distance driven) for the speed check. */
  trail: { at: number; d: number }[];
  /** Meters driven backwards since the car last went forward. */
  back: number;
  /** Driving the wrong way right now (more than WRONG_WAY m backwards). */
  wrongWay: boolean;
}

/** A slide or a bump isn't the wrong way; this much driving backwards is (m). */
const WRONG_WAY = 10;

export function newLapState(): LapState {
  return { s: null, at: 0, next: 0, lapStart: null, valid: true, trail: [], back: 0, wrongWay: false };
}

/** Back to "not started": the next start-line crossing begins a lap (race start, a reset to the grid). */
export function restartLaps(st: LapState): void {
  st.next = 0;
  st.lapStart = null;
  st.valid = true;
  st.trail = [];
}

/** The fastest lap any car could drive (ms). */
export function minLapMs(t: Track): number {
  return Math.floor((t.length / LAP_RULES.maxSpeed) * 1000);
}

function invalidate(st: LapState, reason: InvalidReason, out: LapEvent[]): void {
  if (st.lapStart !== null && st.valid) out.push({ t: "invalid", reason });
  st.valid = false;
}

/** Feed one position (m) at time `now` (ms). Returns what happened. */
export function stepLaps(t: Track, st: LapState, x: number, z: number, now: number): LapEvent[] {
  const out: LapEvent[] = [];
  const corridor = WALL_OFFSET + TRACK.wallThickness / 2 + LAP_RULES.corridorSlack;

  if (st.s === null) {
    const spot = locate(t, x, z);
    if (!spot || Math.abs(spot.lateral) > corridor) return out;
    st.s = spot.s;
    st.at = now;
    return out;
  }

  const dt = Math.max(0, now - st.at) / 1000;
  const reach = LAP_RULES.maxSpeed * (dt + LAP_RULES.jitter) + 5;
  let spot = locateNear(t, x, z, st.s, LAP_RULES.back, reach);
  if (Math.abs(spot.lateral) > corridor) {
    // Not near where it was: a reset further back, or somewhere it can't be.
    const far = locate(t, x, z);
    if (far && Math.abs(far.lateral) <= corridor && arcDelta(t, st.s, far.s) < 0) {
      spot = far;
    } else {
      invalidate(st, "out", out);
      if (far) {
        st.s = far.s;
        st.next = nextCheckpoint(t, far.s);
      }
      st.at = now;
      return out;
    }
  }

  const ds = arcDelta(t, st.s, spot.s);
  if (ds > 0.5) st.back = 0;
  else if (ds < 0 && dt < 1) st.back -= ds;
  st.wrongWay = st.back > WRONG_WAY;

  // Speed over the window: distance driven forward vs time.
  if (ds > 0) {
    st.trail.push({ at: now, d: ds });
    while (st.trail.length && now - st.trail[0].at > LAP_RULES.window) st.trail.shift();
    const first = st.trail[0];
    const span = (now - first.at) / 1000 + dt;
    const driven = st.trail.reduce((a, p) => a + p.d, 0);
    if (ds > reach || driven > LAP_RULES.maxSpeed * (span + LAP_RULES.jitter) + 5) invalidate(st, "speed", out);
  }

  // Checkpoints crossed going forward, in the order they come.
  if (ds > 0) {
    const n = t.checkpoints.length;
    const from = st.s;
    for (let k = 0; k < n; k++) {
      const c = t.checkpoints[k];
      const ahead = arcDelta(t, from, c);
      if (!(ahead > 0 && ahead <= ds)) continue;
      const at = st.at + (now - st.at) * (ahead / ds);
      cross(t, st, k, at, out);
    }
  }

  st.s = spot.s;
  st.at = now;
  return out;
}

function cross(t: Track, st: LapState, k: number, at: number, out: LapEvent[]): void {
  const n = t.checkpoints.length;
  if (k !== st.next) {
    // One already crossed (after backing up): nothing. One further on: skipped some.
    const gap = (k - st.next + n) % n;
    if (gap === 0 || gap > n / 2) return;
    invalidate(st, "skipped", out);
    st.next = (k + 1) % n;
    if (k === 0) finishLap(t, st, at, out);
    return;
  }
  st.next = (k + 1) % n;
  if (k === 0) finishLap(t, st, at, out);
  else out.push({ t: "checkpoint", k, at });
}

function finishLap(t: Track, st: LapState, at: number, out: LapEvent[]): void {
  if (st.lapStart !== null) {
    const ms = Math.round(at - st.lapStart);
    out.push({ t: "lap", ms, valid: st.valid && ms >= minLapMs(t), at });
  } else {
    out.push({ t: "start", at });
  }
  st.lapStart = at;
  st.valid = true;
}

/** The first checkpoint ahead of s (the start line when s is past the last one). */
function nextCheckpoint(t: Track, s: number): number {
  const i = t.checkpoints.findIndex((c) => c > s);
  return i < 0 ? 0 : i;
}

/** 83456 → "1:23.456". */
export function formatLap(ms: number): string {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const r = Math.floor(ms % 1000);
  return `${m}:${String(s).padStart(2, "0")}.${String(r).padStart(3, "0")}`;
}
