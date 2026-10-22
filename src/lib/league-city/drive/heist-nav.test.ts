import { describe, expect, it } from "vitest";
import { lotKey } from "../placement";
import { nearestRoad, nextRoad } from "./heist-nav";

// A plus-shaped crossing: roads along x = 0 and z = 0, 3 lots each way.
const roads = new Set<string>();
for (let i = -3; i <= 3; i++) {
  roads.add(lotKey(i, 0));
  roads.add(lotKey(0, i));
}
const L = 10;

describe("heist nav", () => {
  it("finds the nearest road lot", () => {
    expect(nearestRoad(roads, 21, 9, L)).toEqual([2, 0]);
    expect(nearestRoad(roads, 2000, 2000, L, 3)).toBeNull();
  });

  it("takes the road toward the target, never back unless it's a dead end", () => {
    expect(nextRoad(roads, [0, 0], [-1, 0], 0, 30, L)).toEqual([0, 1]);
    expect(nextRoad(roads, [0, 0], [0, 1], 0, 30, L)).not.toEqual([0, 1]);
    expect(nextRoad(roads, [3, 0], [2, 0], 0, 0, L)).toEqual([2, 0]);
  });

  it("runs away when asked", () => {
    expect(nextRoad(roads, [0, 0], null, 30, 0, L, true)).toEqual([-1, 0]);
  });
});
