// ─── Surfaces ───────────────────────────────────────────────
// Which surface is under a point: road asphalt, plaza (plazas and a road's
// sidewalk) or grass, with its grip and top speed. No collider needed: the
// car looks this up per wheel.

import { asphaltRects } from "../props";
import { lotKey } from "../placement";
import { worldToLot } from "../grid";
import type { CityObject } from "../types";
import { SURFACE } from "./tuning";

export type Surface = keyof typeof SURFACE;

export interface SurfaceGrip {
  surface: Surface;
  grip: number;
  topSpeed: number;
}

export interface SurfaceIndex {
  roads: ReadonlySet<string>;
  plazas: ReadonlySet<string>;
}

export function surfaceIndex(objects: Iterable<Pick<CityObject, "item_type" | "x" | "z" | "px">>): SurfaceIndex {
  const roads = new Set<string>();
  const plazas = new Set<string>();
  for (const o of objects) {
    if (o.px !== null) continue;
    if (o.item_type === "road") roads.add(lotKey(o.x, o.z));
    else if (o.item_type === "plaza") plazas.add(lotKey(o.x, o.z));
  }
  return { roads, plazas };
}

const grip = (surface: Surface): SurfaceGrip => ({ surface, ...SURFACE[surface] });

/** Surface at a world point in city units. */
export function surfaceAt(index: SurfaceIndex, wx: number, wz: number): SurfaceGrip {
  const [lx, lz] = worldToLot(wx, wz);
  const key = lotKey(lx, lz);
  if (index.plazas.has(key)) return grip("plaza");
  if (!index.roads.has(key)) return grip("grass");
  const isRoad = (x: number, z: number) => index.roads.has(lotKey(x, z));
  for (const [x0, z0, x1, z1] of asphaltRects(isRoad, lx, lz)) {
    if (wx >= x0 && wx <= x1 && wz >= z0 && wz <= z1) return grip("road");
  }
  return grip("plaza");
}
