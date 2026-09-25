// ─── Town intro ─────────────────────────────────────────────
// First-visit camera move, in two phases:
//   1. approach: from far away at the height of the portal's sign, straight
//      toward the entrance, slowing to a stop in front of it (never under it)
//   2. orbit: one turn around the town, rising and pulling out, ending
//      exactly on the scene's normal camera frame so the orbit controls take
//      over without a jump

import { terrainBounds, worldBounds } from "./grid";
import { PORTAL } from "./identity-geometry";

export type Vec3 = [number, number, number];

export interface IntroPieces {
  h: number;
  portal: [number, number] | null;
  /** Tallest building: the orbit rises above it. */
  tallest?: number;
}

export interface IntroFrame {
  pos: Vec3;
  look: Vec3;
}

export interface IntroPhase {
  pos: Vec3[];
  look: Vec3[];
  /** Seconds. */
  duration: number;
  /** out: arrives slowing down. inout: starts and lands gently. */
  ease: "out" | "inout";
  /** Seconds to stay still after the phase. */
  hold?: number;
}

export interface IntroPath {
  phases: IntroPhase[];
}

export const APPROACH_SECONDS = 5;
export const HOLD_SECONDS = 0.6;
export const ORBIT_SECONDS = 9;
const ORBIT_STEPS = 10;

export function introPath(p: IntroPieces, end: IntroFrame): IntroPath {
  const w = worldBounds(p.h);
  const t = terrainBounds(p.h);
  const gateZ = p.portal?.[1] ?? w.maxZ;
  const signY = PORTAL.height + PORTAL.beam / 2;
  const sign: Vec3 = [0, signY, gateZ];

  // 1. Approach, level with the sign.
  const stop: Vec3 = [0, signY, gateZ + 70];
  const approach: IntroPhase = {
    pos: [
      [0, signY + 6, gateZ + 700],
      [0, signY + 3, gateZ + 350],
      stop,
    ],
    look: [sign, sign, sign],
    duration: APPROACH_SECONDS,
    ease: "out",
    hold: HOLD_SECONDS,
  };

  // 2. Orbit: from in front of the portal all the way round to the frame.
  const r0 = Math.hypot(stop[0] - t.cx, stop[2] - t.cz);
  const a0 = Math.atan2(stop[2] - t.cz, stop[0] - t.cx);
  const r1 = Math.hypot(end.pos[0] - t.cx, end.pos[2] - t.cz);
  let a1 = Math.atan2(end.pos[2] - t.cz, end.pos[0] - t.cx);
  // Always turn the same way, and more than half a turn.
  while (a1 > a0 - Math.PI) a1 -= Math.PI * 2;
  const high = Math.max(end.pos[1], (p.tallest ?? 0) + 80);
  const center: Vec3 = [t.cx, 30, t.cz];
  const pos: Vec3[] = [];
  const look: Vec3[] = [];
  for (let i = 0; i <= ORBIT_STEPS; i++) {
    const k = i / ORBIT_STEPS;
    const a = a0 + (a1 - a0) * k;
    // Pull back first (away from the towers), then round at the frame's distance.
    const r = r0 + (r1 - r0) * Math.min(1, k * 2);
    // Up fast enough to clear the rooftops, then down onto the frame's height.
    const y = i === ORBIT_STEPS ? end.pos[1] : signY + (high - signY) * Math.min(1, k * 2) + (end.pos[1] - high) * Math.max(0, (k - 0.6) / 0.4);
    pos.push(i === 0 ? stop : i === ORBIT_STEPS ? end.pos : [t.cx + Math.cos(a) * r, y, t.cz + Math.sin(a) * r]);
    // The eye leaves the sign for the middle of town over the first stretch.
    const m = Math.min(1, k * 2);
    look.push(i === ORBIT_STEPS ? end.look : [sign[0] + (center[0] - sign[0]) * m, sign[1] + (center[1] - sign[1]) * m, sign[2] + (center[2] - sign[2]) * m]);
  }
  const orbit: IntroPhase = { pos, look, duration: ORBIT_SECONDS, ease: "inout" };

  return { phases: [approach, orbit] };
}

/** Total seconds, holds included. */
export function introSeconds(path: IntroPath): number {
  return path.phases.reduce((s, ph) => s + ph.duration + (ph.hold ?? 0), 0);
}

