import { describe, expect, it } from "vitest";
import { GROW_AT, LOT, START_H, bounds, inBounds, lotCount } from "./grid";
import { ENTRANCE, PORTAL_POS, starterH, starterOps } from "./starter";

const members = (n: number) => Array.from({ length: n }, (_, i) => ({ developer_id: i + 1, weight: i }));

function placed(n: number) {
  const city = starterOps(members(n));
  const places = city.ops.filter((o) => o.op === "place");
  return { city, places };
}

describe("starterOps", () => {
  it("starts at the default size for small leagues", () => {
    expect(starterH(1)).toBe(START_H);
    expect(starterOps(members(3)).h).toBe(START_H);
  });

  it("lays the main street for the whole depth, a cross street, the plaza and fountain", () => {
    const { city, places } = placed(3);
    expect(city.ops[0]).toEqual({ op: "init", h: START_H });
    const roads = places.filter((o) => o.kind === "item" && o.item_type === "road");
    const b = bounds(START_H);
    const main = roads.filter((o) => "x" in o && o.x === 0);
    expect(main).toHaveLength(b.z1 - b.z0 + 1);
    expect(roads.every((o) => "x" in o && (o.x === 0 || o.z === -START_H))).toBe(true);
    const plazas = places.filter((o) => o.kind === "item" && o.item_type === "plaza");
    expect(plazas.map((o) => ("x" in o ? [o.x, o.z] : null))).toEqual([[-1, 0], [1, 0], [-1, -1], [1, -1]]);
    const fountain = places.find((o) => o.kind === "item" && o.item_type === "fountain");
    expect(fountain && "px" in fountain && [fountain.px, fountain.pz]).toEqual([LOT, -LOT]);
  });

  it("puts a locked portal on the entrance and locks the entrance road", () => {
    const { places } = placed(3);
    const portal = places.find((o) => o.kind === "item" && o.item_type === "portal");
    expect(portal && "px" in portal && [portal.px, portal.pz, portal.locked]).toEqual([PORTAL_POS[0], PORTAL_POS[1], true]);
    for (const [x, z] of ENTRANCE) {
      const road = places.find((o) => o.kind === "item" && o.item_type === "road" && "x" in o && o.x === x && o.z === z);
      expect(road && road.kind === "item" && road.locked).toBe(true);
    }
  });

  it("puts the biggest building nearest the entrance, facing a road", () => {
    const { places } = placed(5);
    const biggest = places.find((o) => o.kind === "building" && o.developer_id === 5);
    expect(biggest && "x" in biggest && Math.abs(biggest.x) + Math.abs(biggest.z)).toBeLessThanOrEqual(3);
    expect(biggest?.rot).toBeDefined();
  });

  it("fits 100 members with no overlap, in bounds, under the growth threshold", () => {
    const { city, places } = placed(100);
    expect(city.unplaced).toEqual([]);
    expect(places.filter((o) => o.kind === "building")).toHaveLength(100);
    const lots = places.filter((o) => "x" in o);
    const keys = lots.map((o) => ("x" in o ? `${o.x},${o.z}` : ""));
    expect(new Set(keys).size).toBe(keys.length);
    expect(lots.every((o) => "x" in o && inBounds(city.h, o.x, o.z))).toBe(true);
    expect(lots.length).toBeLessThanOrEqual(GROW_AT * lotCount(city.h));
    expect(city.ops.length).toBeLessThanOrEqual(200);
  });

  it("adds trees on the edges", () => {
    const { city, places } = placed(3);
    const trees = places.filter((o) => o.kind === "item" && o.item_type.startsWith("tree_"));
    expect(trees.length).toBeGreaterThan(0);
    const b = bounds(city.h);
    const edge = (o: (typeof trees)[number]) =>
      "px" in o && ([b.x0 * LOT, b.x1 * LOT].includes(o.px) || [b.z0 * LOT, b.z1 * LOT].includes(o.pz));
    expect(trees.every(edge)).toBe(true);
  });
});
