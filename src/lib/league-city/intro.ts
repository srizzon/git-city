// ─── Town intro ─────────────────────────────────────────────
// First-visit camera move, filled with the town's own pieces. Three calm
// styles, few waypoints, constant speed, and every one ends exactly on the
// scene's normal camera frame, so the orbit takes over without a jump:
//   arrival  drop from the sky toward the gate, through the portal, rise to the view
//   reveal   start on the portal sign, pull back and up until the town fits
//   orbit    one slow half turn around the town while descending

import { LOT, terrainBounds, worldBounds } from "./grid";

export type Vec3 = [number, number, number];
export type IntroStyle = "arrival" | "reveal" | "orbit";
export const INTRO_STYLES: readonly IntroStyle[] = ["arrival", "reveal", "orbit"];

export interface IntroPieces {
  h: number;
  portal: [number, number] | null;
  /** Tallest building: moves over the city stay above it. */
  tallest?: number;
}

export interface IntroFrame {
  pos: Vec3;
  look: Vec3;
}

export interface IntroPath {
  pos: Vec3[];
  look: Vec3[];
  /** Seconds. */
  duration: number;
}

export const INTRO_SECONDS: Record<IntroStyle, number> = { arrival: 11, reveal: 8, orbit: 10 };

export function introPath(p: IntroPieces, style: IntroStyle, end: IntroFrame): IntroPath {
  const w = worldBounds(p.h);
  const t = terrainBounds(p.h);
  const span = Math.max(t.width, t.depth);
  const gateZ = p.portal?.[1] ?? w.maxZ;
  const ceiling = (p.tallest ?? 0) + 60;
  const pos: Vec3[] = [];
  const look: Vec3[] = [];
  const add = (a: Vec3, b: Vec3) => {
    pos.push(a);
    look.push(b);
  };

  if (style === "arrival") {
    add([0, 220 + span * 0.3, gateZ + 420 + span * 0.4], [0, 20, gateZ]);
    add([0, 60, gateZ + 170], [0, 24, gateZ]);
    add([0, 16, gateZ + 55], [0, 26, gateZ]);
    add([0, 13, gateZ - 40], [0, 14, gateZ - 3 * LOT]);
    // Straight up over the main street (the only lane with no towers), then out to the view.
    add([0, ceiling, gateZ - 70], [0, 20, gateZ - 4 * LOT]);
  } else if (style === "reveal") {
    add([0, 33, gateZ + 34], [0, 34, gateZ]);
    add([0, 70, gateZ + 150], [0, 30, gateZ - LOT]);
  } else {
    const r = Math.hypot(end.pos[0] - t.cx, end.pos[2] - t.cz);
    const a1 = Math.atan2(end.pos[2] - t.cz, end.pos[0] - t.cx);
    const y1 = end.pos[1];
    for (let i = 0; i < 4; i++) {
      const k = i / 4;
      const a = a1 + Math.PI * (1 - k);
      add([t.cx + Math.cos(a) * r, y1 * (1.8 - 0.8 * k), t.cz + Math.sin(a) * r], [t.cx, 30, t.cz]);
    }
  }

  add(end.pos, end.look);
  return { pos, look, duration: INTRO_SECONDS[style] };
}
