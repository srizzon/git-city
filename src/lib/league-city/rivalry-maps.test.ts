import { describe, expect, it } from "vitest";
import { CATALOG, limitTypes } from "./catalog";
import { LOT, inBounds } from "./grid";
import { lotKey } from "./placement";
import { propProblem } from "./props";
import { parseProps } from "./props-schema";
import { RIVALRY_H, rivalryMapOps, type RivalryMapSlug } from "./rivalry-maps";
import type { CityObject, ItemType } from "./types";

// Replays each map the way apply_league_city_ops would, with the editor's
// own rules, so the seed never hits a refusal on the database.
function replay(slug: RivalryMapSlug) {
  const objects: CityObject[] = [];
  const lots = new Set<string>();
  const problems: string[] = [];
  rivalryMapOps(slug).forEach((op, i) => {
    if (op.op !== "place" || op.kind !== "item") return;
    const t = op.item_type as ItemType;
    const parsed = parseProps(t, op.props);
    if (!parsed.ok) problems.push(`${i} ${t}: ${parsed.message}`);
    if ("px" in op) {
      const p = propProblem(objects, RIVALRY_H, { item_type: t, px: op.px, pz: op.pz });
      if (p && t !== "portal") problems.push(`${i} ${t} at ${op.px},${op.pz}: ${p}`);
      objects.push({ id: String(i), kind: "item", item_type: t, developer_id: null, x: Math.round(op.px / LOT), z: Math.round(op.pz / LOT), px: op.px, pz: op.pz, rot: op.rot ?? 0, is_new: false, props: op.props });
    } else {
      if (!inBounds(RIVALRY_H, op.x, op.z)) problems.push(`${i} ${t} out of bounds ${op.x},${op.z}`);
      if (lots.has(lotKey(op.x, op.z))) problems.push(`${i} ${t} lot taken ${op.x},${op.z}`);
      lots.add(lotKey(op.x, op.z));
      objects.push({ id: String(i), kind: "item", item_type: t, developer_id: null, x: op.x, z: op.z, px: null, pz: null, rot: 0, is_new: false, props: op.props });
    }
  });
  return { objects, problems };
}

describe.each(["claude-code-town", "codex-town"] as const)("%s map", (slug) => {
  it("places every piece where the database accepts it", () => {
    expect(replay(slug).problems).toEqual([]);
  });

  it("stays within every per-city limit", () => {
    const { objects } = replay(slug);
    for (const t of Object.keys(CATALOG) as ItemType[]) {
      const max = CATALOG[t].max;
      if (max === null) continue;
      const group = new Set(limitTypes(t));
      expect(objects.filter((o) => o.item_type && group.has(o.item_type)).length, t).toBeLessThanOrEqual(max);
    }
  });

  it("starts with the city's own landmark and a giant mascot", () => {
    const types = replay(slug).objects.map((o) => o.item_type);
    expect(types).toContain(slug === "claude-code-town" ? "context_window" : "sandbox");
    expect(types).toContain(slug === "claude-code-town" ? "clawd" : "codex_cloud");
  });

  it("has room for hundreds of buildings, each on a free lot", () => {
    const { objects } = replay(slug);
    const taken = new Set(objects.map((o) => lotKey(o.px === null ? o.x : Math.round(o.px! / LOT), o.px === null ? o.z : Math.round(o.pz! / LOT))));
    const lots = (2 * RIVALRY_H + 1) * 2 * RIVALRY_H;
    expect(lots - taken.size).toBeGreaterThan(450);
  });
});
