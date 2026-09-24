import { describe, expect, it } from "vitest";
import { LOT } from "./grid";
import { asphaltRects, propAt, propProblem, snap } from "./props";
import type { CityObject } from "./types";

const lot = (id: string, kind: "building" | "item", item: CityObject["item_type"], x: number, z: number): CityObject => ({
  id, kind, item_type: item, developer_id: kind === "building" ? 1 : null, x, z, px: null, pz: null, rot: 0, is_new: false,
});
const prop = (id: string, item: CityObject["item_type"], px: number, pz: number): CityObject => ({
  id, kind: "item", item_type: item, developer_id: null, x: Math.round(px / LOT), z: Math.round(pz / LOT), px, pz, rot: 0, is_new: false,
});

// Road along x = 0 for z in -2..2, a plaza at (1, 1), a building at (2, 0), a fountain on the plaza.
const city = [
  ...[-2, -1, 0, 1, 2].map((z) => lot(`r${z}`, "item", "road", 0, z)),
  lot("p", "item", "plaza", 1, 1),
  lot("b", "building", null, 2, 0),
  prop("f", "fountain", LOT, LOT),
];

describe("propProblem (mirrors league_prop_problem)", () => {
  it("allows a bench on a plaza, away from the fountain", () => {
    expect(propProblem(city, 12, { item_type: "bench", px: LOT - 16, pz: LOT + 16 })).toBeNull();
  });
  it("refuses overlapping another prop", () => {
    expect(propProblem(city, 12, { item_type: "bench", px: LOT + 5, pz: LOT })).toBe("prop_overlap");
  });
  it("keeps props off asphalt but allows the sidewalk", () => {
    expect(propProblem(city, 12, { item_type: "lamp", px: 0, pz: 0 })).toBe("on_road");
    expect(propProblem(city, 12, { item_type: "lamp", px: 18, pz: 0 })).toBeNull();
    // A road neighbor turns that side into asphalt (the arm).
    const withArm = [...city, lot("r-side", "item", "road", 1, 0)];
    expect(propProblem(withArm, 12, { item_type: "lamp", px: 18, pz: 0 })).toBe("on_road");
  });
  it("refuses a building's lot and outside the city", () => {
    expect(propProblem(city, 12, { item_type: "lamp", px: 2 * LOT, pz: 0 })).toBe("on_building");
    expect(propProblem(city, 12, { item_type: "lamp", px: 6 * LOT, pz: 0 })).toBe("out_of_bounds");
  });
  it("ignores its own id when moving", () => {
    expect(propProblem(city, 12, { item_type: "fountain", px: LOT + 2, pz: LOT, id: "f" })).toBeNull();
  });
});

describe("helpers", () => {
  it("builds a center square plus one arm per road neighbor", () => {
    expect(asphaltRects((x, z) => x === 0 && z === -1, 0, 0)).toHaveLength(2);
  });
  it("finds the prop under the cursor", () => {
    expect(propAt(city, LOT + 3, LOT - 3)?.id).toBe("f");
    expect(propAt(city, 0, 0)).toBeUndefined();
  });
  it("snaps to 4 units unless free", () => {
    expect(snap(10.7)).toBe(12);
    expect(snap(10.74, true)).toBe(10.7);
  });
});
