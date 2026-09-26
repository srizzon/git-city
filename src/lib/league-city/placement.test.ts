import { describe, expect, it } from "vitest";
import { bounds } from "./grid";
import { canPlace, faceRoad, freeLotsInOrder, lotKey } from "./placement";

const objects = [
  { id: "a", x: 0, z: 0 },
  { id: "b", x: 1, z: 0 },
];

describe("canPlace", () => {
  it("accepts a free lot in bounds", () => {
    expect(canPlace(objects, 6, 2, -2)).toEqual({ ok: true });
  });
  it("rejects a taken lot", () => {
    expect(canPlace(objects, 6, 1, 0)).toEqual({ ok: false, reason: "lot_taken" });
  });
  it("lets an object stay on its own lot", () => {
    expect(canPlace(objects, 6, 1, 0, "b")).toEqual({ ok: true });
  });
  it("rejects out of bounds and non-integer lots", () => {
    expect(canPlace(objects, 6, 7, 0)).toEqual({ ok: false, reason: "out_of_bounds" });
    expect(canPlace(objects, 6, 0.5, 0)).toEqual({ ok: false, reason: "out_of_bounds" });
  });
});

describe("freeLotsInOrder", () => {
  it("puts road-touching lots first, nearest the middle of the city", () => {
    const roads = new Set([lotKey(3, -3)]);
    const lots = freeLotsInOrder(new Set(roads), roads, bounds(6));
    expect(lots.slice(0, 4).every(([x, z]) => Math.abs(x - 3) + Math.abs(z + 3) === 1)).toBe(true);
    expect(lots[0]).toEqual([2, -3]);
    // Then the lots around the center (z between -6 and -5 on a 12-deep grid), not the gate.
    const [x, z] = lots[4];
    expect(Math.abs(x)).toBeLessThanOrEqual(1);
    expect(z === -6 || z === -5).toBe(true);
  });

  it("starts a town with a main street at its center, not at the gate", () => {
    const b = bounds(6);
    const roads = new Set<string>();
    for (let z = b.z0; z <= b.z1; z++) roads.add(lotKey(0, z));
    const [x, z] = freeLotsInOrder(new Set(roads), roads, b)[0];
    expect(Math.abs(x)).toBe(1);
    expect(Math.abs(2 * z - (b.z0 + b.z1))).toBeLessThanOrEqual(1);
  });
});

describe("faceRoad", () => {
  it("faces the first road neighbor", () => {
    const roads = new Set([lotKey(0, 0)]);
    expect(faceRoad(roads, 1, 0)).toBe(270);
    expect(faceRoad(roads, 0, 1)).toBe(0);
    expect(faceRoad(roads, -1, 0)).toBe(90);
    expect(faceRoad(roads, 0, -1)).toBe(180);
    expect(faceRoad(roads, 5, 5)).toBe(0);
  });
});
