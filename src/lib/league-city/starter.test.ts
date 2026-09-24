import { describe, expect, it } from "vitest";
import { GROW_AT, START_SIZE, inBounds } from "./grid";
import { starterOps, starterSize } from "./starter";

const members = (n: number) => Array.from({ length: n }, (_, i) => ({ developer_id: i + 1, weight: i }));

function placed(n: number) {
  const city = starterOps(members(n));
  const places = city.ops.filter((o) => o.op === "place");
  return { city, places };
}

describe("starterOps", () => {
  it("starts at the default size for small leagues", () => {
    expect(starterSize(1)).toBe(START_SIZE);
    expect(starterOps(members(3)).size).toBe(START_SIZE);
  });

  it("opens with init and lays a road cross, plaza and fountain", () => {
    const { city, places } = placed(3);
    expect(city.ops[0]).toEqual({ op: "init", size: START_SIZE });
    const roads = places.filter((o) => o.kind === "item" && o.item_type === "road");
    expect(roads).toHaveLength(2 * START_SIZE - 1);
    expect(roads.every((o) => o.x === 0 || o.z === 0)).toBe(true);
    const fountain = places.find((o) => o.kind === "item" && o.item_type === "fountain");
    expect(fountain && "px" in fountain && [fountain.px, fountain.pz]).toEqual([48, 48]);
    expect(places.filter((o) => o.kind === "item" && o.item_type === "plaza")).toHaveLength(4);
  });

  it("puts the biggest building nearest the center, facing a road", () => {
    const { places } = placed(5);
    const buildings = places.filter((o) => o.kind === "building");
    const biggest = buildings.find((o) => o.kind === "building" && o.developer_id === 5);
    expect(biggest && biggest.x * biggest.x + biggest.z * biggest.z).toBe(5); // first ring past the plaza
    expect(biggest?.rot).toBeDefined();
  });

  it("fits 100 members with no overlap, in bounds, under the growth threshold", () => {
    const { city, places } = placed(100);
    expect(city.unplaced).toEqual([]);
    expect(places.filter((o) => o.kind === "building")).toHaveLength(100);
    const lots = places.filter((o) => "x" in o);
    const keys = lots.map((o) => ("x" in o ? `${o.x},${o.z}` : ""));
    expect(new Set(keys).size).toBe(keys.length);
    expect(lots.every((o) => "x" in o && inBounds(city.size, o.x, o.z))).toBe(true);
    expect(lots.length).toBeLessThanOrEqual(GROW_AT * city.size * city.size); // props don't count toward growth
    expect(city.ops.length).toBeLessThanOrEqual(200);
  });

  it("adds trees on the outer ring", () => {
    const { city, places } = placed(3);
    const trees = places.filter((o) => o.kind === "item" && o.item_type.startsWith("tree_"));
    expect(trees.length).toBeGreaterThan(0);
    const lo = (-city.size / 2) * 48;
    const hi = (city.size / 2 - 1) * 48;
    expect(trees.every((o) => "px" in o && ([lo, hi].includes(o.px) || [lo, hi].includes(o.pz)))).toBe(true);
  });
});
