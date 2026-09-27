// ─── Claude Code vs Codex maps ──────────────────────────────
// The two rivalry towns are laid out by hand here instead of a template, so
// each reads as its side at a glance. The seed script applies these ops to an
// empty city (system actor), then auto-places the members.
//
//   claude-code-town  "Clawd Canyon": sunset. A main avenue to a big square
//                     with a giant Clawd ringed by small ones; behind it, a
//                     plaza with the Context Window that fills up and compacts.
//   codex-town        "Sandbox City": night. A datacenter grid of streets,
//                     boost pads down the avenue, a big plaza with the sandbox
//                     and a giant `>_` cloud hovering over it.
//
// Both skies carry their own jokes.

import { LOT } from "./grid";
import { lotKey } from "./placement";
import { ENTRANCE, PORTAL_POS } from "./starter";
import type { CityOp, ObjectProps, PropType } from "./types";

export const RIVALRY_H = 18;

type Lot = [number, number];

interface Plan {
  roads: Lot[];
  plazas: Lot[];
  floors: Lot[];
  props: { item_type: PropType; px: number; pz: number; rot?: number; props?: ObjectProps }[];
}

const C = { yellow: "#ffd23f", red: "#4a1010", cyan: "#4ad8ff", navy: "#0b0f19", blue: "#1a2a6c", white: "#ffffff", pink: "#ff7ad9", purple: "#3b0a45" } as const;
const CORNER = 18;
/** A street every GRID lots: 3×3 blocks, so every building fronts a street. */
const GRID = 4;
const W = (lot: number) => lot * LOT;

function line(x0: number, z0: number, x1: number, z1: number): Lot[] {
  const out: Lot[] = [];
  for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) out.push([x, z]);
  return out;
}

const inside = (l: Lot, x0: number, z0: number, x1: number, z1: number) => l[0] >= x0 && l[0] <= x1 && l[1] >= z0 && l[1] <= z1;

/** Lamps on the sidewalk corners of every other lot of a road run. */
function lamps(run: Lot[], every = 2): Plan["props"] {
  return run
    .filter((_, i) => i % every === 0)
    .flatMap(([x, z]) => [
      { item_type: "lamp" as const, px: W(x) - CORNER, pz: W(z) + CORNER },
      { item_type: "lamp" as const, px: W(x) + CORNER, pz: W(z) - CORNER },
    ]);
}

/** Where two road runs cross, their lamps land on the same corners: keep the first. */
function spaced(props: Plan["props"]): Plan["props"] {
  const out: Plan["props"] = [];
  for (const p of props) {
    if (p.item_type === "lamp" && out.some((o) => o.item_type === "lamp" && Math.hypot(o.px - p.px, o.pz - p.pz) < 8)) continue;
    out.push(p);
  }
  return out;
}

const uniqueLots = (lots: Lot[]): Lot[] => [...new Map(lots.map((l) => [lotKey(l[0], l[1]), l])).values()];

const sky = (item_type: "plane" | "blimp", px: number, pz: number, props: ObjectProps) => ({ item_type, px, pz, props });

interface Style {
  tree: PropType;
  mascot: "clawd" | "codex_cloud";
  landmark: "context_window" | "sandbox";
  /** Lamp spacing along the main streets (Codex glows more). */
  lampEvery: number;
  /** Blocks (their center lot) that become parks. */
  parks: Lot[];
  sky: Plan["props"];
  extras: Plan["props"];
}

// Both towns share the street plan and differ in everything that sits on it:
//
//   z = 0      entrance and portal, gate plazas either side
//   z = -16    SQUARE: 7×7 plaza, the giant mascot, flags, benches
//   z = -28    LANDMARK: 7×7 plaza, the town's landmark, billboards
//   grid       a street every 4 lots; each 3×3 block keeps its center lot as
//              a tree, so buildings stand 8 to a block around a bit of green
//   parks      six whole blocks are parks: plaza, trees and a small mascot
const SQUARE = { x0: -3, z0: -19, x1: 3, z1: -13, cz: -16 };
const LANDMARK = { x0: -3, z0: -31, x1: 3, z1: -25, cz: -28 };

function town(style: Style): Plan {
  const h = RIVALRY_H;
  const lines: number[] = [];
  for (let v = GRID; v <= h - 2; v += GRID) lines.push(v, -v);
  lines.push(0);
  const zLines: number[] = [];
  for (let z = -GRID; z >= -2 * h + 3; z -= GRID) zLines.push(z);

  const open = (l: Lot) => inside(l, SQUARE.x0, SQUARE.z0, SQUARE.x1, SQUARE.z1) || inside(l, LANDMARK.x0, LANDMARK.z0, LANDMARK.x1, LANDMARK.z1);
  const roads: Lot[] = [
    ...lines.flatMap((x) => line(x, x === 0 ? 0 : zLines[0], x, zLines[zLines.length - 1])),
    ...zLines.flatMap((z) => line(-lines.filter((v) => v > 0).at(-1)!, z, lines.filter((v) => v > 0).at(-1)!, z)),
  ].filter((l) => !open(l));

  const square = line(SQUARE.x0, SQUARE.z0, SQUARE.x1, SQUARE.z1);
  const landmark = line(LANDMARK.x0, LANDMARK.z0, LANDMARK.x1, LANDMARK.z1);
  const gate: Lot[] = [[-1, 0], [1, 0], [-1, -1], [1, -1]];
  const parkLots = style.parks.flatMap(([cx, cz]) => line(cx - 1, cz - 1, cx + 1, cz + 1));

  // Block centers: a tree each (parks and squares excepted).
  const centers: Lot[] = [];
  const mids = [...lines].sort((a, b) => a - b);
  for (let i = 0; i + 1 < mids.length; i++) {
    for (let j = 0; j + 1 < zLines.length; j++) {
      const cx = (mids[i] + mids[i + 1]) / 2;
      const cz = (zLines[j] + zLines[j + 1]) / 2;
      if (!Number.isInteger(cx) || !Number.isInteger(cz)) continue;
      const c: Lot = [cx, cz];
      if (open(c) || style.parks.some(([px, pz]) => px === cx && pz === cz)) continue;
      centers.push(c);
    }
  }

  const sq = { x: 0, z: W(SQUARE.cz) };
  const lm = { x: 0, z: W(LANDMARK.cz) };
  const edge = W(3) + 16; // just inside a 7-lot plaza's side
  const small = (px: number, pz: number) => ({ item_type: style.mascot, px, pz, props: { size: "small" } });

  return {
    roads,
    plazas: [...square, ...landmark, ...gate, ...parkLots],
    floors: [[-3, SQUARE.z0], [3, SQUARE.z0], [-3, SQUARE.z1], [3, SQUARE.z1]],
    props: [
      { item_type: style.mascot, px: sq.x, pz: sq.z, props: { size: "giant" } },
      ...[-1, 1].flatMap((s) => [small(s * 110, sq.z + 110), small(s * 110, sq.z - 110)]),
      small(-48, -24),
      small(48, -24),
      { item_type: style.landmark, px: lm.x, pz: lm.z },
      { item_type: "fountain", px: -110, pz: lm.z },
      { item_type: "fountain", px: 110, pz: lm.z },
      // Flags down the square's sides, billboards at the landmark's corners.
      ...[-2, -1, 0, 1, 2].flatMap((dz) => [
        { item_type: "flag" as const, px: -edge, pz: sq.z + W(dz) },
        { item_type: "flag" as const, px: edge, pz: sq.z + W(dz) },
      ]),
      { item_type: "flag", px: -edge, pz: lm.z + W(2) },
      { item_type: "flag", px: edge, pz: lm.z + W(2) },
      ...[-1, 1].flatMap((s) => [
        { item_type: "billboard" as const, px: s * 120, pz: lm.z - W(2) },
        { item_type: "billboard" as const, px: s * 120, pz: lm.z + W(2) + 20 },
      ]),
      ...[-1, 1].flatMap((s) => [
        { item_type: "bench" as const, px: s * 60, pz: sq.z + W(2) },
        { item_type: "bench" as const, px: s * 60, pz: sq.z - W(2) },
      ]),
      ...centers.map(([x, z]) => ({ item_type: style.tree, px: W(x), pz: W(z) })),
      // Parks: four trees round a small mascot.
      ...style.parks.flatMap(([cx, cz]) => [
        small(W(cx), W(cz)),
        ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => ({ item_type: style.tree, px: W(cx) + sx * 34, pz: W(cz) + sz * 34 }))),
      ]),
      ...lamps(line(0, -2, 0, SQUARE.z1 - 1), style.lampEvery),
      ...zLines.flatMap((z) => lamps(line(-16, z, 16, z).filter((l) => !open(l)), style.lampEvery + 1)),
      ...style.extras,
      ...style.sky,
    ],
  };
}


// ─── Drive features ─────────────────────────────────────────
// Ramps face north at rot 0 (a car heading north launches), 90 east, 180
// south, 270 west. Speed bumps span a north-south street at rot 0.

type Props = Plan["props"];

const ramp = (x: number, z: number, rot: number, big = false): Props[number] => ({ item_type: big ? "ramp_big" : "ramp", px: W(x), pz: W(z), rot });

/** Cones weaving down a north-south street, from lot z0 to z1. */
function slalom(x: number, z0: number, z1: number): Props {
  const out: Props = [];
  for (let pz = W(z0), i = 0; pz >= W(z1); pz -= 18, i++) out.push({ item_type: "cone", px: W(x) + (i % 2 ? 7 : -7), pz });
  return out;
}

const bumps = (x: number, zs: number[]): Props => zs.map((z) => ({ item_type: "speed_bump" as const, px: W(x), pz: W(z) }));

/** Tire walls on the outside of the outer ring's four corners. */
function cornerWalls(): Props {
  const e = 16;
  return [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ].map(([sx, sz]) => ({ item_type: "tire_wall" as const, px: W(sx * e) + sx * 20, pz: W(sz === 1 ? -4 : -32) }));
}

/** In every park: crates to dodge and benches to sit on. */
function parkStuff(parks: Lot[]): Props {
  return parks.flatMap(([cx, cz]) => [
    { item_type: "crates" as const, px: W(cx) - 34, pz: W(cz) },
    { item_type: "crates" as const, px: W(cx) + 34, pz: W(cz) },
    { item_type: "bench" as const, px: W(cx), pz: W(cz) - 34 },
    { item_type: "bench" as const, px: W(cx), pz: W(cz) + 34 },
  ]);
}

const PARKS: Lot[] = [
  [-10, -10],
  [10, -10],
  [-14, -22],
  [14, -22],
  [-6, -30],
  [6, -30],
];

// ─── Clawd Canyon ────────────────────────────────────────────

function claude(): Plan {
  const sq = W(SQUARE.cz);
  return town({
    tree: "tree_palm_tall",
    mascot: "clawd",
    landmark: "context_window",
    lampEvery: 2,
    parks: PARKS,
    // Token Run: a boosted jump down the avenue straight at the giant Clawd, a
    // loop of boosted ramps round the outer ring, a cone slalom and rate-limit bumps.
    extras: [
      // Boosts into every jump: down the avenue, and before each ring ramp.
      ...[-3, -7].map((z) => ({ item_type: "boost_pad" as const, px: 0, pz: W(z) })),
      ...[
        [-16, -7],
        [-16, -19],
        [16, -25],
        [16, -13],
      ].map(([x, z]) => ({ item_type: "boost_pad" as const, px: W(x), pz: W(z) })),
      ...[
        [-12, -32],
        [4, -32],
        [13, -4],
        [-7, -4],
      ].map(([x, z]) => ({ item_type: "boost_pad" as const, px: W(x), pz: W(z), rot: 90 })),
      ramp(0, -11, 0, true),
      ramp(-16, -10, 0),
      ramp(-16, -22, 0),
      ramp(-8, -32, 90),
      ramp(8, -32, 90),
      ramp(16, -22, 180),
      ramp(16, -10, 180),
      ramp(10, -4, 270),
      ramp(-10, -4, 270),
      ...slalom(-8, -5, -11),
      ...bumps(8, [-6, -10, -14, -18]),
      ...cornerWalls(),
      ...parkStuff(PARKS),
    ],
    sky: [
      sky("plane", 0, sq, { text: "You're absolutely right!", color: C.yellow, bg: C.red, alt: 250, orbit: 320 }),
      sky("plane", 0, sq, { text: "Compacting conversation…", color: C.white, bg: C.red, alt: 190, orbit: 520 }),
      sky("blimp", 0, sq, { text: "Welcome, Claude Coders", color: C.yellow, bg: C.red, alt: 215 }),
    ],
  });
}

// ─── Sandbox City ────────────────────────────────────────────

function codex(): Plan {
  const sq = W(SQUARE.cz);
  return town({
    tree: "tree_pine_tall_a",
    mascot: "codex_cloud",
    landmark: "sandbox",
    lampEvery: 1,
    parks: PARKS,
    // Speedrun Lane: boost pads down the avenue into a big jump, boost strips
    // on the ring's long straights, ramps along the back street, and the
    // rate limits and tests (cones) in the way.
    extras: [
      ...[-2, -6, -10].map((z) => ({ item_type: "boost_pad" as const, px: 0, pz: W(z) })),
      ramp(0, -11, 0, true),
      ...[-8, -14, -20, -26].flatMap((z) => [
        { item_type: "boost_pad" as const, px: W(-16), pz: W(z) },
        { item_type: "boost_pad" as const, px: W(16), pz: W(z) },
      ]),
      ramp(-12, -32, 90),
      ramp(-4, -32, 90),
      ramp(4, -32, 90),
      ramp(12, -32, 90),
      ...bumps(-8, [-6, -10, -14, -18]),
      ...slalom(8, -5, -11),
      ...cornerWalls(),
      ...parkStuff(PARKS),
    ],
    sky: [
      sky("plane", 0, sq, { text: "Tests passed, probably", color: C.pink, bg: C.navy, alt: 250, orbit: 320 }),
      sky("plane", 0, sq, { text: "PR ready: 47 files changed", color: C.cyan, bg: C.navy, alt: 190, orbit: 520 }),
      sky("blimp", 0, sq, { text: "Welcome to Codex", color: C.cyan, bg: C.navy, alt: 215 }),
    ],
  });
}

const PLANS = { "claude-code-town": claude, "codex-town": codex } as const;
export type RivalryMapSlug = keyof typeof PLANS;

/** The ops that build a rivalry town on an empty city (buildings come after, by auto_place). */
export function rivalryMapOps(slug: RivalryMapSlug): CityOp[] {
  const raw = PLANS[slug]();
  const plan = { ...raw, roads: uniqueLots(raw.roads), props: spaced(raw.props) };
  const isEntrance = (x: number, z: number) => ENTRANCE.some(([ex, ez]) => ex === x && ez === z);
  const floors = new Set(plan.floors.map(([x, z]) => lotKey(x, z)));
  const ops: CityOp[] = [{ op: "init", h: RIVALRY_H }];
  for (const [x, z] of plan.roads) ops.push({ op: "place", kind: "item", item_type: "road", x, z, ...(isEntrance(x, z) ? { locked: true } : {}) });
  ops.push({ op: "place", kind: "item", item_type: "portal", px: PORTAL_POS[0], pz: PORTAL_POS[1], locked: true });
  for (const [x, z] of plan.plazas) {
    ops.push({ op: "place", kind: "item", item_type: "plaza", x, z, ...(floors.has(lotKey(x, z)) ? { props: { logo_floor: true } } : {}) });
  }
  for (const p of plan.props) {
    ops.push({ op: "place", kind: "item", item_type: p.item_type, px: p.px, pz: p.pz, ...(p.rot ? { rot: p.rot } : {}), ...(p.props ? { props: p.props } : {}) });
  }
  return ops;
}
