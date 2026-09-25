// ─── Starter city ───────────────────────────────────────────
// Built on creation from the town's template (templates.ts), and on first
// open for leagues made before cities (crew). The city is anchored at its
// entrance (z = 0, see grid.ts): every template keeps the entrance road on
// x = 0 with the portal at its south end, locked. Member buildings face the
// roads (biggest nearest the entrance), trees fill in last. The terrain is
// the smallest that fits everyone without growing right away.
//
//   crew   main street the whole depth, a cross street at the back, and a
//          plaza with a fountain on the four lots flanking the entrance
//   race   a loop one lot in from the edge, ramps and boost pads on it
//   hq     downtown blocks: streets every 3 columns and every 4 rows, lamps
//   park   a short street and a cross, a big plaza, trees everywhere
//   blank  the entrance road and the portal, nothing else

import { GROW_AT, LOT, MAX_H, START_H, bounds, lotCount } from "./grid";
import { faceRoad, freeLotsInOrder, lotKey } from "./placement";
import { TREE_TYPES, type CityObject, type CityOp, type PropType } from "./types";
import { APPROACH_LOTS } from "./identity-geometry";
import { DEFAULT_TEMPLATE, type TemplateId } from "./templates";

export interface StarterMember {
  developer_id: number;
  /** Anything that orders buildings by size (contributions). */
  weight: number;
}

export interface StarterCity {
  h: number;
  ops: CityOp[];
  /** Members that didn't fit even at MAX_H. */
  unplaced: number[];
}

/** The entrance road lots: locked, never editable. */
export const ENTRANCE: readonly [number, number][] = [
  [0, 0],
  [0, -1],
];
/** The portal stands on the city's south edge, over the entrance road, facing the approach outside. */
export const PORTAL_POS: readonly [number, number] = [0, LOT / 2];

/** A prop on a road or plaza lot (never on a lot a building could take). */
interface FixedProp {
  item_type: PropType;
  px: number;
  pz: number;
  rot?: number;
}

interface Layout {
  roads: [number, number][];
  plazas: [number, number][];
  props: FixedProp[];
  /** Trees on free lots after the buildings. */
  trees: { max: number; pick: (x: number, z: number, edge: boolean, nth: number) => boolean };
}

/** Sidewalk corner of a road lot: clear of the asphalt whichever way the road runs. */
const CORNER = 18;

const edgeTrees = (max: number): Layout["trees"] => ({ max, pick: (_x, _z, edge, nth) => edge && nth % 3 === 0 });

function crew(h: number): Layout {
  const b = bounds(h);
  const roads: [number, number][] = [];
  for (let z = b.z1; z >= b.z0; z--) roads.push([0, z]);
  for (let x = b.x0; x <= b.x1; x++) if (x !== 0) roads.push([x, -h]);
  return {
    roads,
    plazas: [
      [-1, 0],
      [1, 0],
      [-1, -1],
      [1, -1],
    ],
    // The fountain stands in the middle of the (1, -1) plaza.
    props: [{ item_type: "fountain", px: LOT, pz: -LOT }],
    trees: edgeTrees(24),
  };
}

function race(h: number): Layout {
  // The loop: x = ±(h-1), z = -1 (the entrance joins it) and z = -(2h-2).
  const r = h - 1;
  const top = -(2 * h - 2);
  const roads: [number, number][] = [[0, 0]];
  for (let x = -r; x <= r; x++) roads.push([x, -1], [x, top]);
  for (let z = top + 1; z <= -2; z++) roads.push([-r, z], [r, z]);
  const third = Math.max(1, Math.round((-1 - top) / 3));
  const props: FixedProp[] = [
    // Jumps on the back straight, driven east to west or west to east.
    { item_type: "ramp", px: -2 * LOT, pz: top * LOT, rot: 90 },
    { item_type: "ramp_big", px: 2 * LOT, pz: top * LOT, rot: 270 },
    // Boosts on both sides.
    { item_type: "boost_pad", px: -r * LOT, pz: (-1 - third) * LOT, rot: 0 },
    { item_type: "boost_pad", px: r * LOT, pz: (top + third) * LOT, rot: 180 },
    { item_type: "speed_bump", px: -r * LOT, pz: (top + third) * LOT, rot: 0 },
    { item_type: "speed_bump", px: r * LOT, pz: (-1 - third) * LOT, rot: 0 },
    // Tire walls on the outside of the back corners, cones on the front ones.
    { item_type: "tire_wall", px: -r * LOT - CORNER + 4, pz: top * LOT - CORNER + 4, rot: 315 },
    { item_type: "tire_wall", px: r * LOT + CORNER - 4, pz: top * LOT - CORNER + 4, rot: 45 },
    { item_type: "cone", px: -r * LOT - CORNER, pz: -LOT + CORNER },
    { item_type: "cone", px: r * LOT + CORNER, pz: -LOT + CORNER },
    { item_type: "crates", px: 0, pz: top * LOT - CORNER + 6 },
  ];
  return { roads, plazas: [], props, trees: edgeTrees(16) };
}

function hq(h: number): Layout {
  const b = bounds(h);
  const cols: number[] = [];
  for (let x = 0; x <= h - 1; x += 3) cols.push(x, -x);
  const rows: number[] = [];
  for (let z = -1; z > b.z0; z -= 4) rows.push(z);
  const seen = new Set<string>();
  const roads: [number, number][] = [];
  const add = (x: number, z: number) => {
    if (seen.has(lotKey(x, z))) return;
    seen.add(lotKey(x, z));
    roads.push([x, z]);
  };
  for (let z = b.z1; z >= b.z0; z--) add(0, z);
  for (const x of cols) for (let z = -1; z >= b.z0; z--) add(x, z);
  for (const z of rows) for (let x = b.x0; x <= b.x1; x++) add(x, z);
  // A lamp on two corners of every crossing.
  const props: FixedProp[] = [];
  for (const x of new Set(cols)) {
    for (const z of rows) {
      props.push({ item_type: "lamp", px: x * LOT + CORNER, pz: z * LOT + CORNER });
      props.push({ item_type: "lamp", px: x * LOT - CORNER, pz: z * LOT - CORNER });
    }
  }
  // A small plaza either side of the gate, benches facing the street.
  props.push({ item_type: "bench", px: -LOT, pz: 0, rot: 90 }, { item_type: "bench", px: LOT, pz: 0, rot: 270 });
  return { roads, plazas: [[-1, 0], [1, 0]], props, trees: edgeTrees(10) };
}

function park(h: number): Layout {
  const roads: [number, number][] = [];
  for (let z = 0; z >= -h; z--) roads.push([0, z]);
  const arm = Math.min(3, h - 1);
  for (let x = -arm; x <= arm; x++) if (x !== 0) roads.push([x, -h]);
  // Six plaza lots north of the cross, the fountain in the middle.
  const plazas: [number, number][] = [];
  for (const x of [-1, 0, 1]) for (const z of [-h - 1, -h - 2]) plazas.push([x, z]);
  const props: FixedProp[] = [
    { item_type: "fountain", px: 0, pz: (-h - 1) * LOT - LOT / 2 },
    { item_type: "bench", px: -LOT, pz: (-h - 1) * LOT, rot: 90 },
    { item_type: "bench", px: LOT, pz: (-h - 1) * LOT, rot: 270 },
    { item_type: "bench", px: -LOT, pz: (-h - 2) * LOT, rot: 90 },
    { item_type: "bench", px: LOT, pz: (-h - 2) * LOT, rot: 270 },
    { item_type: "lamp", px: CORNER, pz: -CORNER },
    { item_type: "lamp", px: -CORNER, pz: -h * LOT + CORNER },
  ];
  // Trees on about half the lots away from the street, never on the frontage.
  return {
    roads,
    plazas,
    props,
    trees: { max: 48, pick: (x, z) => Math.abs((x * 2654435761) ^ (z * 40503)) % 5 < 3 },
  };
}

function blank(): Layout {
  return { roads: [...ENTRANCE], plazas: [], props: [], trees: { max: 0, pick: () => false } };
}

const LAYOUTS: Record<TemplateId, (h: number) => Layout> = { crew, race, hq, park, blank };

/** Lots that fit buildings once the layout is down (under the growth threshold). */
function room(layout: Layout, h: number): number {
  const fixed = layout.roads.length + layout.plazas.length;
  return Math.min(Math.floor(GROW_AT * lotCount(h)) - fixed, lotCount(h) - fixed);
}

/** Smallest half-width that fits `members` buildings under the growth threshold. */
export function starterH(members: number, template: TemplateId = DEFAULT_TEMPLATE): number {
  for (let h = START_H; h < MAX_H; h++) {
    if (members <= room(LAYOUTS[template](h), h)) return h;
  }
  return MAX_H;
}

// Deterministic pick so the same league always gets the same trees.
function treeFor(x: number, z: number) {
  const n = Math.abs((x * 73856093) ^ (z * 19349663));
  return TREE_TYPES[n % TREE_TYPES.length];
}

const isEntrance = (x: number, z: number) => ENTRANCE.some(([ex, ez]) => ex === x && ez === z);

export function starterOps(members: readonly StarterMember[], template: TemplateId = DEFAULT_TEMPLATE): StarterCity {
  const h = starterH(members.length, template);
  const layout = LAYOUTS[template](h);
  const b = bounds(h);
  const ops: CityOp[] = [{ op: "init", h }];

  const roads = new Set<string>();
  const occupied = new Set<string>();
  for (const [x, z] of layout.roads) {
    roads.add(lotKey(x, z));
    occupied.add(lotKey(x, z));
    ops.push({ op: "place", kind: "item", item_type: "road", x, z, ...(isEntrance(x, z) ? { locked: true } : {}) });
  }
  ops.push({ op: "place", kind: "item", item_type: "portal", px: PORTAL_POS[0], pz: PORTAL_POS[1], locked: true });
  for (const [x, z] of layout.plazas) {
    occupied.add(lotKey(x, z));
    ops.push({ op: "place", kind: "item", item_type: "plaza", x, z });
  }
  for (const p of layout.props) {
    ops.push({ op: "place", kind: "item", item_type: p.item_type, px: p.px, pz: p.pz, ...(p.rot ? { rot: p.rot } : {}) });
  }

  const sorted = [...members].sort((a, c) => c.weight - a.weight || a.developer_id - c.developer_id);
  const lots = freeLotsInOrder(occupied, roads, b);
  const unplaced: number[] = [];
  sorted.forEach((m, i) => {
    const lot = lots[i];
    if (!lot) {
      unplaced.push(m.developer_id);
      return;
    }
    const [x, z] = lot;
    occupied.add(lotKey(x, z));
    ops.push({ op: "place", kind: "building", developer_id: m.developer_id, x, z, rot: faceRoad(roads, x, z) });
  });

  // Trees on free lots the layout picks, off the street frontage (that's where
  // the next buildings go), while under the threshold.
  const touchesRoad = (x: number, z: number) =>
    roads.has(lotKey(x, z - 1)) || roads.has(lotKey(x + 1, z)) || roads.has(lotKey(x, z + 1)) || roads.has(lotKey(x - 1, z));
  const budget = Math.min(layout.trees.max, Math.floor(GROW_AT * lotCount(h)) - occupied.size);
  let trees = 0;
  let nth = 0;
  for (let x = b.x0; x <= b.x1 && trees < budget; x++) {
    for (let z = b.z0; z <= b.z1 && trees < budget; z++) {
      const edge = x === b.x0 || x === b.x1 || z === b.z0 || z === b.z1;
      if (template === "crew" ? !edge : touchesRoad(x, z)) continue;
      if (occupied.has(lotKey(x, z))) continue;
      if (!layout.trees.pick(x, z, edge, template === "crew" ? nth++ : 0)) continue;
      occupied.add(lotKey(x, z));
      ops.push({ op: "place", kind: "item", item_type: treeFor(x, z), px: x * LOT, pz: z * LOT });
      trees++;
    }
  }

  return { h, ops, unplaced };
}

/**
 * A starter city as the objects the scene draws, before it's saved (the
 * template preview on /towns/new).
 */
export function starterObjects(city: StarterCity): CityObject[] {
  const out: CityObject[] = [];
  city.ops.forEach((op, i) => {
    if (op.op !== "place") return;
    const base = { id: `starter:${i}`, rot: op.rot ?? 0, is_new: false, props: null };
    if (op.kind === "building") {
      out.push({ ...base, kind: "building", item_type: null, developer_id: op.developer_id, x: op.x, z: op.z, px: null, pz: null });
    } else if ("px" in op) {
      out.push({ ...base, kind: "item", item_type: op.item_type, developer_id: null, x: Math.round(op.px / LOT), z: Math.round(op.pz / LOT), px: op.px, pz: op.pz, locked: op.locked });
    } else {
      out.push({ ...base, kind: "item", item_type: op.item_type, developer_id: null, x: op.x, z: op.z, px: null, pz: null, locked: op.locked });
    }
  });
  return out;
}

/**
 * The approach road lots south of the city (render and drive only), when the
 * entrance road is there.
 */
export function approachRoads(objects: readonly Pick<CityObject, "item_type" | "x" | "z" | "px">[]): CityObject[] {
  if (!objects.some((o) => o.px === null && o.item_type === "road" && o.x === 0 && o.z === 0)) return [];
  return Array.from({ length: APPROACH_LOTS }, (_, i) => ({
    id: `approach:${i + 1}`,
    kind: "item",
    item_type: "road",
    developer_id: null,
    x: 0,
    z: i + 1,
    px: null,
    pz: null,
    rot: 0,
    is_new: false,
    locked: true,
  }));
}
