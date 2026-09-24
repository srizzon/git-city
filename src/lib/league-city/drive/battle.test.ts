import { describe, expect, it } from "vitest";
import type { CityObject } from "../types";
import { BALL, SHOCK, ballPosition, boxPosition, boxSpots, isItem, randomItem, shockKick, validUse } from "./battle";

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

  it("hands out every item", () => {
    const got = new Set(Array.from({ length: 200 }, (_, i) => randomItem(() => (i % 97) / 97)));
    expect(got.size).toBe(4);
    for (const g of got) expect(isItem(g)).toBe(true);
    expect(isItem("nuke")).toBe(false);
  });
});

describe("attacks", () => {
  it("validates a use: point in bounds, direction normalized", () => {
    expect(validUse(1, 2, 3, 4)).toEqual({ x: 1, z: 2, dx: 0.6, dz: 0.8 });
    expect(validUse(1, 2, 0, 0)).toBeNull();
    expect(validUse(5000, 0, 1, 0)).toBeNull();
    expect(validUse("1", 0, 1, 0)).toBeNull();
  });

  it("throws the ball straight at its speed", () => {
    const [x, z] = ballPosition(0, 0, 1, 0, 0.5);
    expect(x).toBeCloseTo(BALL.speed / 2);
    expect(z).toBe(0);
  });

  it("pushes cars away from a shockwave, harder up close, not past its radius", () => {
    const near = shockKick(0, 0, 2, 0)!;
    const far = shockKick(0, 0, 12, 0)!;
    expect(near[0]).toBeGreaterThan(far[0]);
    expect(far[0]).toBeGreaterThan(0);
    expect(shockKick(0, 0, 0, -5)![1]).toBeLessThan(0);
    expect(shockKick(0, 0, SHOCK.radius + 1, 0)).toBeNull();
  });
});
