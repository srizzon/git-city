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
// Both skies carry their own jokes plus one balloon from the other side.

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

const sky = (item_type: "plane" | "blimp" | "balloon", px: number, pz: number, props: ObjectProps) => ({ item_type, px, pz, props });

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
    extras: [],
    sky: [
      sky("plane", 0, sq, { text: "You're absolutely right!", color: C.yellow, bg: C.red, alt: 250, orbit: 320 }),
      sky("plane", 0, sq, { text: "Compacting conversation…", color: C.white, bg: C.red, alt: 190, orbit: 520 }),
      sky("blimp", 0, sq, { text: "Welcome, Claude Coders", color: C.yellow, bg: C.red, alt: 215 }),
      sky("balloon", -200, sq, { text: "ultrathink", color: C.yellow, bg: C.red, alt: 150, orbit: 240 }),
      sky("balloon", 200, W(-26), { text: "Let me make a comprehensive plan", color: C.white, bg: C.purple, alt: 175, orbit: 280 }),
      // The other side's balloon, drifting over enemy ground.
      sky("balloon", 0, W(-8), { text: "Codex was here. Claude hit the usage limit", color: C.cyan, bg: C.blue, alt: 130, orbit: 420 }),
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
    // Ship fast: boost pads down the avenue.
    extras: [-2, -6, -10].map((z) => ({ item_type: "boost_pad" as const, px: 0, pz: W(z) })),
    sky: [
      sky("plane", 0, sq, { text: "Tests passed, probably", color: C.pink, bg: C.navy, alt: 250, orbit: 320 }),
      sky("plane", 0, sq, { text: "PR ready: 47 files changed", color: C.cyan, bg: C.navy, alt: 190, orbit: 520 }),
      sky("blimp", 0, sq, { text: "Welcome to Codex", color: C.cyan, bg: C.navy, alt: 215 }),
      sky("balloon", -200, sq, { text: "Running in sandbox…", color: C.cyan, bg: C.blue, alt: 150, orbit: 240 }),
      sky("balloon", 200, W(-8), { text: "yolo mode: on", color: C.pink, bg: C.navy, alt: 175, orbit: 280 }),
      sky("balloon", 0, W(-26), { text: "You're absolutely right! Codex was wrong", color: C.yellow, bg: C.red, alt: 130, orbit: 420 }),
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
