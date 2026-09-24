// ─── League city buildings ──────────────────────────────────
// Places laid-out CityBuildings (dimensions from the city formulas) on their
// league lots. Each building sits centered in its lot; the footprint is capped
// so it never spills out, and a 90°/270° turn swaps width and depth.

import type { CityBuilding } from "@/lib/github";
import { lotToWorld } from "./grid";
import type { CityObject } from "./types";

export const MAX_FOOTPRINT = 44;

export function leagueBuildings(
  objects: readonly CityObject[],
  byDevId: ReadonlyMap<number, CityBuilding>,
): CityBuilding[] {
  const out: CityBuilding[] = [];
  for (const o of objects) {
    if (o.kind !== "building" || o.developer_id === null) continue;
    const b = byDevId.get(o.developer_id);
    if (!b) continue;
    const w = Math.min(b.width, MAX_FOOTPRINT);
    const d = Math.min(b.depth, MAX_FOOTPRINT);
    const turned = o.rot === 90 || o.rot === 270;
    const [x, z] = lotToWorld(o.x, o.z);
    out.push({
      ...b,
      position: [x, 0, z],
      width: turned ? d : w,
      depth: turned ? w : d,
    });
  }
  return out;
}
