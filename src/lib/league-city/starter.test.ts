import { describe, expect, it } from "vitest";
import { GROW_AT, LOT, START_H, bounds, inBounds, lotCount } from "./grid";
import { ENTRANCE, PORTAL_POS, starterH, starterObjects, starterOps } from "./starter";
import { propProblem } from "./props";
import { TEMPLATE_IDS } from "./templates";

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

describe("templates", () => {
  const sizes = [1, 8, 60, 150];
  for (const id of TEMPLATE_IDS) {
    for (const n of sizes) {
      it(`${id} with ${n} members: valid lots and props, everyone placed`, () => {
        const city = starterOps(members(n), id);
        expect(city.ops[0]).toEqual({ op: "init", h: city.h });
        expect(city.unplaced).toEqual([]);
        const objects = starterObjects(city);
        const lots = objects.filter((o) => o.px === null);
        const keys = lots.map((o) => `${o.x},${o.z}`);
        expect(new Set(keys).size).toBe(keys.length);
        expect(lots.every((o) => inBounds(city.h, o.x, o.z))).toBe(true);
        expect(lots.length).toBeLessThanOrEqual(GROW_AT * lotCount(city.h));
        expect(objects.filter((o) => o.kind === "building")).toHaveLength(n);
        // The gate is the same everywhere.
        expect(objects.some((o) => o.item_type === "road" && o.x === 0 && o.z === 0 && o.locked)).toBe(true);
        expect(objects.filter((o) => o.item_type === "portal")).toHaveLength(1);
        // Every prop stands where the SQL would let it.
        const props = objects.filter((o) => o.px !== null && o.pz !== null && o.item_type !== "portal");
        for (const p of props) {
          expect([p.item_type, propProblem(objects, city.h, { item_type: p.item_type!, px: p.px!, pz: p.pz!, id: p.id })]).toEqual([p.item_type, null]);
        }
      });
    }
  }

  it("each template looks different", () => {
    const shapes = TEMPLATE_IDS.map((id) =>
      starterOps(members(1), id)
        .ops.filter((o) => o.op === "place" && o.kind === "item" && o.item_type === "road")
        .map((o) => ("x" in o ? `${o.x},${o.z}` : ""))
        .sort()
        .join("|"),
    );
    expect(new Set(shapes).size).toBe(TEMPLATE_IDS.length);
  });

  it("race has jumps and hq has lamps", () => {
    const race = starterOps(members(1), "race").ops;
    expect(race.some((o) => o.op === "place" && o.kind === "item" && o.item_type === "ramp_big")).toBe(true);
    const hq = starterOps(members(1), "hq").ops;
    expect(hq.filter((o) => o.op === "place" && o.kind === "item" && o.item_type === "lamp").length).toBeGreaterThan(4);
  });
});
