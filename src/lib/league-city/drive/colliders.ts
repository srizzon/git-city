// ─── Drive colliders ────────────────────────────────────────
// Maps the city to physics shapes, in meters. Buildings, trees, ramps, the
// ground and the edge walls are fixed; lamps, benches and fountains are
// dynamic bodies that get knocked over and reset. Ids are stable per object
// (walls and ground carry the size), so a city change only swaps the shapes
// that changed.

import type { CityBuilding } from "@/lib/github";
import { LOT, maxLot, minLot, rotToRadians } from "../grid";
import { rampCorners } from "../ramp";
import { TREE_TYPES, type CityObject } from "../types";
import { PROPS, UNIT_TO_M, WALL } from "./tuning";

export type DynamicProp = "lamp" | "bench" | "fountain";

export type ColliderShape =
  | { type: "cuboid"; half: [number, number, number] }
  | { type: "cylinder"; radius: number; halfHeight: number }
  /** Convex hull, points relative to `pos`, already turned. */
  | { type: "hull"; points: number[] };

export interface ColliderSpec {
  id: string;
  body: "fixed" | "dynamic";
  /** Center, meters. */
  pos: [number, number, number];
  /** Rotation about y, radians (three.js convention). */
  rotY: number;
  shape: ColliderShape;
  /** Dynamic props only. */
  prop?: DynamicProp;
  mass?: number;
}

const U = UNIT_TO_M;
const TREES = new Set<string>(TREE_TYPES);

function propCollider(o: CityObject): ColliderSpec | null {
  if (o.px === null || o.pz === null || !o.item_type) return null;
  const x = o.px * U;
  const z = o.pz * U;
  const rotY = rotToRadians(o.rot);
  const t = o.item_type;
  if (TREES.has(t)) {
    const { radius, halfHeight } = PROPS.tree;
    return { id: o.id, body: "fixed", pos: [x, halfHeight, z], rotY: 0, shape: { type: "cylinder", radius, halfHeight } };
  }
  if (t === "lamp") {
    const { radius, halfHeight, mass } = PROPS.lamp;
    return { id: o.id, body: "dynamic", prop: t, mass, pos: [x, halfHeight, z], rotY, shape: { type: "cylinder", radius, halfHeight } };
  }
  if (t === "bench") {
    const { half, mass } = PROPS.bench;
    return { id: o.id, body: "dynamic", prop: t, mass, pos: [x, half[1], z], rotY, shape: { type: "cuboid", half: [...half] } };
  }
  if (t === "fountain") {
    const { radius, halfHeight, mass } = PROPS.fountain;
    return { id: o.id, body: "dynamic", prop: t, mass, pos: [x, halfHeight, z], rotY, shape: { type: "cylinder", radius, halfHeight } };
  }
  if (t === "ramp") {
    const c = Math.cos(rotY);
    const s = Math.sin(rotY);
    const points: number[] = [];
    // Turn about y like three.js: x' = x cos + z sin, z' = -x sin + z cos.
    for (const [px, py, pz] of rampCorners()) points.push((px * c + pz * s) * U, py * U, (-px * s + pz * c) * U);
    return { id: o.id, body: "fixed", pos: [x, 0, z], rotY: 0, shape: { type: "hull", points } };
  }
  return null;
}

export function buildColliders(objects: readonly CityObject[], buildings: readonly CityBuilding[], size: number): ColliderSpec[] {
  const out: ColliderSpec[] = [];

  for (const b of buildings) {
    const half: [number, number, number] = [(b.width / 2) * U, (b.height / 2) * U, (b.depth / 2) * U];
    out.push({ id: `building:${b.loginLower}`, body: "fixed", pos: [b.position[0] * U, half[1], b.position[2] * U], rotY: 0, shape: { type: "cuboid", half } });
  }
  for (const o of objects) {
    const c = propCollider(o);
    if (c) out.push(c);
  }

  // Ground and the four edge walls, just outside the terrain.
  const lo = (minLot(size) - 0.5) * LOT * U;
  const hi = (maxLot(size) + 0.5) * LOT * U;
  const mid = (lo + hi) / 2;
  const half = (hi - lo) / 2;
  const t = WALL.thickness / 2;
  const h = WALL.height / 2;
  out.push({ id: `ground:${size}`, body: "fixed", pos: [mid, -1, mid], rotY: 0, shape: { type: "cuboid", half: [half + 10, 1, half + 10] } });
  out.push({ id: `wall-n:${size}`, body: "fixed", pos: [mid, h, lo - t], rotY: 0, shape: { type: "cuboid", half: [half + 2 * t, h, t] } });
  out.push({ id: `wall-s:${size}`, body: "fixed", pos: [mid, h, hi + t], rotY: 0, shape: { type: "cuboid", half: [half + 2 * t, h, t] } });
  out.push({ id: `wall-w:${size}`, body: "fixed", pos: [lo - t, h, mid], rotY: 0, shape: { type: "cuboid", half: [t, h, half + 2 * t] } });
  out.push({ id: `wall-e:${size}`, body: "fixed", pos: [hi + t, h, mid], rotY: 0, shape: { type: "cuboid", half: [t, h, half + 2 * t] } });
  return out;
}

/** A spec's identity: same key → same body, no rebuild needed. */
export function colliderKey(c: ColliderSpec): string {
  return `${c.id}|${c.pos.map((v) => v.toFixed(3)).join(",")}|${c.rotY.toFixed(3)}|${JSON.stringify(c.shape)}`;
}
