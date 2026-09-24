import { describe, expect, it } from "vitest";
import type { CityObject } from "../types";
import { BOMB, MISSILE, SHOCK, blastKick, boxPosition, boxSpots, isItem, missileTarget, randomItem, stepMissile, validUse } from "./battle";

const lot = (item: "road" | "plaza", x: number, z: number): CityObject => ({
  id: `${item}${x}${z}`, kind: "item", item_type: item, developer_id: null, x, z, px: null, pz: null, rot: 0, is_new: false,
});

describe("item boxes", () => {
  const city = [lot("road", 2, 0), lot("road", 0, 0), lot("plaza", 1, 1)];

  it("spawns on roads and plazas, in the same order for everyone", () => {
    expect(boxSpots(city)).toEqual([[0, 0], [1, 1], [2, 0]]);
    expect(boxSpots([...city].reverse())).toEqual(boxSpots(city));
  });

  it("puts a slot in the same place for the same generation, and moves it on the next", () => {
    const spots = boxSpots(city);
    expect(boxPosition(spots, 3, 7, 0.4)).toEqual(boxPosition(spots, 3, 7, 0.4));
    const seen = new Set(Array.from({ length: 20 }, (_, g) => boxPosition(spots, 3, g, 0.4)!.join(",")));
    expect(seen.size).toBeGreaterThan(10);
  });

  it("has nowhere to go in a city with no roads or plazas", () => {
    expect(boxPosition([], 0, 0, 0.4)).toBeNull();
  });

  it("hands out every item, and only those", () => {
    const got = new Set(Array.from({ length: 200 }, (_, i) => randomItem(() => (i % 97) / 97)));
    expect([...got].sort()).toEqual(["bomb", "missile", "shock"]);
    expect(isItem("oil")).toBe(false);
  });
});

describe("attacks", () => {
  it("validates a use: point in bounds, direction normalized", () => {
    expect(validUse(1, 2, 3, 4)).toEqual({ x: 1, z: 2, dx: 0.6, dz: 0.8 });
    expect(validUse(1, 2, 0, 0)).toBeNull();
    expect(validUse(5000, 0, 1, 0)).toBeNull();
  });

  it("blasts cars away and up, harder up close, not past the radius", () => {
    const near = blastKick(0, 0, 2, 0, SHOCK)!;
    const far = blastKick(0, 0, 14, 0, SHOCK)!;
    expect(near[0]).toBeGreaterThan(far[0]);
    expect(near[2]).toBeGreaterThan(far[2]);
    expect(far[2]).toBeGreaterThan(0);
    expect(blastKick(0, 0, 0, -5, BOMB)![1]).toBeLessThan(0);
    expect(blastKick(0, 0, SHOCK.radius + 1, 0, SHOCK)).toBeNull();
  });

  it("aims a missile at the nearest car ahead, never behind or out of range", () => {
    const cars = [
      { id: "behind", x: 0, z: -10 },
      { id: "far", x: 0, z: 100 },
      { id: "near", x: 3, z: 30 },
      { id: "side", x: 30, z: 0 },
      { id: "gone", x: 0, z: MISSILE.range + 10 },
    ];
    expect(missileTarget(0, 0, 0, 1, cars)?.id).toBe("near");
    expect(missileTarget(0, 0, 0, -1, cars)?.id).toBe("behind");
    expect(missileTarget(0, 0, 1, 0, [cars[0], cars[1]])).toBeNull();
  });

  it("steers a missile toward its target at a limited turn rate, and flies straight without one", () => {
    let m = { x: 0, z: 0, h: 0 }; // heading +z
    const target = { x: 30, z: 30 };
    for (let i = 0; i < 90; i++) m = stepMissile(m, target, 1 / 60);
    expect(Math.hypot(m.x - target.x, m.z - target.z)).toBeLessThan(10);
    const straight = stepMissile({ x: 0, z: 0, h: 0 }, null, 1);
    expect(straight.x).toBeCloseTo(0);
    expect(straight.z).toBeCloseTo(MISSILE.speed);
  });
});
