// ─── Drive colliders ────────────────────────────────────────
// Maps the city to physics shapes, in meters. Buildings, trees, ramps, the
// portal pillars, billboard legs, flag poles, the ground and the edge walls
// are fixed; lamps, benches and fountains are dynamic bodies that get knocked
// over and reset. Planes and blimps have none. Ids are stable per object
// (walls and ground carry the size), so a city change only swaps the shapes
// that changed.

import type { CityBuilding } from "@/lib/github";
import { rotToRadians, worldBounds } from "../grid";
import { BILLBOARD, FLAG, PORTAL } from "../identity-geometry";
import { RAMP, RAMP_BIG, rampCorners, type RampSize } from "../ramp";
import { CONE, SPEED_BUMP, TIRE_WALL_HEIGHT, TIRE_WALL_WIDTH, TIRE, crateLayout, toWorld, CRATE } from "../toys";
import { TREE_TYPES, type CityObject } from "../types";
import { PROPS, TOYS, UNIT_TO_M, WALL } from "./tuning";

export type DynamicProp = "lamp" | "bench" | "fountain" | "cone" | "crate";

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
  /** Bounciness; tire walls throw the car back. */
  restitution?: number;
}

const U = UNIT_TO_M;
const TREES = new Set<string>(TREE_TYPES);

/** Points (local units, y up) turned `rot` and converted to meters, as a flat list for a hull. */
function hull(points: [number, number, number][], rotY: number): number[] {
  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  const out: number[] = [];
  // Turn about y like three.js: x' = x cos + z sin, z' = -x sin + z cos.
  for (const [px, py, pz] of points) out.push((px * c + pz * s) * U, py * U, (-px * s + pz * c) * U);
  return out;
}

function rampHull(size: RampSize, rotY: number): ColliderShape {
  return { type: "hull", points: hull(rampCorners(size), rotY) };
}

/** A low trapezoid across the road. */
function bumpHull(rotY: number): ColliderShape {
  const w = SPEED_BUMP.width / 2;
  const d = SPEED_BUMP.depth / 2;
  const h = SPEED_BUMP.height;
  const top = d * 0.35;
  return {
    type: "hull",
    points: hull(
      [
        [-w, 0, -d], [w, 0, -d], [w, 0, d], [-w, 0, d],
        [-w, h, -top], [w, h, -top], [w, h, top], [-w, h, top],
      ],
      rotY,
    ),
  };
}

function propColliders(o: CityObject): ColliderSpec[] {
  if (o.px === null || o.pz === null || !o.item_type) return [];
  const rotY = rotToRadians(o.rot);
  if (o.item_type === "crates") {
    const { mass } = PROPS.crate;
    const half = (CRATE / 2) * U;
    return crateLayout().map(([lx, ly, lz], i) => {
      const [wx, wz] = toWorld(o.px!, o.pz!, o.rot, lx, lz);
      return { id: `${o.id}:${i}`, body: "dynamic", prop: "crate", mass, pos: [wx * U, ly * U, wz * U], rotY, shape: { type: "cuboid", half: [half, half, half] } };
    });
  }
  if (o.item_type === "portal" || o.item_type === "billboard") {
    // Two posts across the object's width, turned with it: the car passes between them.
    const [off, half] =
      o.item_type === "portal"
        ? [PORTAL.halfSpan, [(PORTAL.pillar / 2) * U, (PORTAL.height / 2) * U, (PORTAL.pillar / 2) * U] as [number, number, number]]
        : [BILLBOARD.legX, [(BILLBOARD.leg / 2) * U, ((BILLBOARD.bottom + BILLBOARD.h) / 2) * U, (BILLBOARD.leg / 2) * U] as [number, number, number]];
    return [-off, off].map((lx, i) => {
      const [wx, wz] = toWorld(o.px!, o.pz!, o.rot, lx, 0);
      return { id: `${o.id}:${i}`, body: "fixed", pos: [wx * U, half[1], wz * U], rotY, shape: { type: "cuboid", half } };
    });
  }
  if (o.item_type === "flag") {
    const halfHeight = (FLAG.poleH / 2) * U;
    return [{ id: o.id, body: "fixed", pos: [o.px * U, halfHeight, o.pz * U], rotY: 0, shape: { type: "cylinder", radius: FLAG.pole * 2 * U, halfHeight } }];
  }
  if (o.item_type === "tire_wall") {
    const half: [number, number, number] = [(TIRE_WALL_WIDTH / 2) * U, (TIRE_WALL_HEIGHT / 2) * U, (TIRE.width / 2) * U];
    return [{ id: o.id, body: "fixed", pos: [o.px * U, half[1], o.pz * U], rotY, shape: { type: "cuboid", half }, restitution: TOYS.tireRestitution }];
  }
  const one = propCollider(o);
  return one ? [one] : [];
}

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
  if (t === "ramp") return { id: o.id, body: "fixed", pos: [x, 0, z], rotY: 0, shape: rampHull(RAMP, rotY) };
  if (t === "ramp_big") return { id: o.id, body: "fixed", pos: [x, 0, z], rotY: 0, shape: rampHull(RAMP_BIG, rotY) };
  if (t === "speed_bump") return { id: o.id, body: "fixed", pos: [x, 0, z], rotY: 0, shape: bumpHull(rotY) };
  if (t === "cone") {
    const halfHeight = (CONE.height / 2) * U;
    return { id: o.id, body: "dynamic", prop: "cone", mass: PROPS.cone.mass, pos: [x, halfHeight, z], rotY, shape: { type: "cylinder", radius: CONE.radius * 0.7 * U, halfHeight } };
  }
  return null;
}

export function buildColliders(objects: readonly CityObject[], buildings: readonly CityBuilding[], h: number): ColliderSpec[] {
  const out: ColliderSpec[] = [];

  for (const b of buildings) {
    const half: [number, number, number] = [(b.width / 2) * U, (b.height / 2) * U, (b.depth / 2) * U];
    out.push({ id: `building:${b.loginLower}`, body: "fixed", pos: [b.position[0] * U, half[1], b.position[2] * U], rotY: 0, shape: { type: "cuboid", half } });
  }
  for (const o of objects) out.push(...propColliders(o));

  // Ground and the four edge walls, just outside the terrain rectangle.
  const w = worldBounds(h);
  const [x0, x1, z0, z1] = [w.minX * U, w.maxX * U, w.minZ * U, w.maxZ * U];
  const mx = (x0 + x1) / 2;
  const mz = (z0 + z1) / 2;
  const hx = (x1 - x0) / 2;
  const hz = (z1 - z0) / 2;
  const t = WALL.thickness / 2;
  const wh = WALL.height / 2;
  out.push({ id: `ground:${h}`, body: "fixed", pos: [mx, -1, mz], rotY: 0, shape: { type: "cuboid", half: [hx + 10, 1, hz + 10] } });
  out.push({ id: `wall-n:${h}`, body: "fixed", pos: [mx, wh, z0 - t], rotY: 0, shape: { type: "cuboid", half: [hx + 2 * t, wh, t] } });
  out.push({ id: `wall-s:${h}`, body: "fixed", pos: [mx, wh, z1 + t], rotY: 0, shape: { type: "cuboid", half: [hx + 2 * t, wh, t] } });
  out.push({ id: `wall-w:${h}`, body: "fixed", pos: [x0 - t, wh, mz], rotY: 0, shape: { type: "cuboid", half: [t, wh, hz + 2 * t] } });
  out.push({ id: `wall-e:${h}`, body: "fixed", pos: [x1 + t, wh, mz], rotY: 0, shape: { type: "cuboid", half: [t, wh, hz + 2 * t] } });
  return out;
}

/** A spec's identity: same key → same body, no rebuild needed. */
export function colliderKey(c: ColliderSpec): string {
  return `${c.id}|${c.pos.map((v) => v.toFixed(3)).join(",")}|${c.rotY.toFixed(3)}|${JSON.stringify(c.shape)}`;
}
