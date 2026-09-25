// ─── Town intro ─────────────────────────────────────────────
// First-visit fly-in, same choreography in every town, filled with the town's
// own pieces (camera positions and look targets for a CatmullRom path, like
// the home city's IntroFlyover):
//   1. open sky, descending toward the south edge
//   2. low along the entrance road, through the portal, across the plaza
//   3. climb over the city past the nearest billboard, then a plane or blimp
//   4. one turn over the middle, the hill sign in the background
//   5. land on the viewer's building (or this week's leader)
// Missing pieces drop their segment.

import { LOT, terrainBounds, worldBounds } from "./grid";
import type { SignSide } from "./types";

export type Vec3 = [number, number, number];

export interface IntroPieces {
  h: number;
  portal: [number, number] | null;
  /** Center of the plaza the entrance road crosses first. */
  plaza: [number, number] | null;
  billboards: [number, number][];
  /** Planes and blimps: center and altitude. */
  sky: { x: number; z: number; alt: number }[];
  signSide: SignSide | null;
  /** The building to land on: position and top. */
  landing: { x: number; z: number; top: number } | null;
  /** Tallest building: the climb and the turn stay above it. */
  tallest?: number;
}

export interface IntroPath {
  pos: Vec3[];
  look: Vec3[];
  /** Seconds. */
  duration: number;
}

export const INTRO_SECONDS = 8;

export function introPath(p: IntroPieces): IntroPath {
  const w = worldBounds(p.h);
  const t = terrainBounds(p.h);
  const span = Math.max(t.width, t.depth);
  const south = w.maxZ;
  const pos: Vec3[] = [];
  const look: Vec3[] = [];
  const add = (a: Vec3, b: Vec3) => {
    pos.push(a);
    look.push(b);
  };

  // 1. Open sky, descending toward the south edge.
  add([0, 260 + span * 0.35, south + 260 + span * 0.5], [0, 30, south]);
  add([0, 90, south + 180], [0, 20, south - LOT]);

  // 2. Low along the entrance road, through the portal, across the plaza.
  const portalZ = p.portal?.[1] ?? south - LOT / 2;
  add([0, 16, south + 60], [0, 18, portalZ]);
  add([0, 11, portalZ - 12], [0, 10, portalZ - 2 * LOT]);
  if (p.plaza) add([p.plaza[0] * 0.4, 20, p.plaza[1] - LOT * 0.4], [p.plaza[0], 4, p.plaza[1] - LOT]);

  // 3. Climb over the city, past the nearest billboard and a plane or blimp.
  const ceiling = (p.tallest ?? 0) + 40;
  const board = [...p.billboards].sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]))[0];
  if (board) add([board[0] + 34, 34, board[1] + 30], [board[0], 18, board[1]]);
  // Straight up from the last low point before flying over the rooftops.
  const low = pos[pos.length - 1];
  add([low[0], ceiling + 20, low[2] + 40], [t.cx, 40, t.cz]);
  const air = p.sky[0];
  if (air) add([air.x + 70, Math.max(air.alt + 10, ceiling), air.z + 90], [air.x, air.alt, air.z]);

  // 4. One turn over the middle, ending on the far side from the hill sign,
  //    looking across the city at it.
  const r = span * 0.55;
  const y = Math.max(140 + span * 0.12, ceiling);
  const hillDir = p.signSide === "east" ? 0 : p.signSide === "west" ? Math.PI : -Math.PI / 2;
  const end = hillDir + Math.PI;
  const center: Vec3 = [t.cx, 30, t.cz];
  for (let i = 0; i < 4; i++) {
    const a = end + (i - 3) * (Math.PI / 2);
    const target: Vec3 = p.signSide && i === 3 ? [t.cx + Math.cos(hillDir) * span * 0.6, 30, t.cz + Math.sin(hillDir) * span * 0.6] : center;
    add([t.cx + Math.cos(a) * r, y, t.cz + Math.sin(a) * r], target);
  }

  // 5. Land on the building.
  if (p.landing) {
    const { x, z, top } = p.landing;
    let dx = x - t.cx;
    let dz = z - t.cz;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    add([x + dx * 180, top + 120, z + dz * 180], [x, top + 15, z]);
  }

  return { pos, look, duration: INTRO_SECONDS };
}
