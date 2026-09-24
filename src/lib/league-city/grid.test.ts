import { describe, expect, it } from "vitest";
import { LOT, MAX_SIZE, START_SIZE, grownSize, inBounds, lotToWorld, maxLot, minLot, shouldGrow, terrainBounds, worldToLot } from "./grid";

describe("grid", () => {
  it("spans size lots per axis around 0", () => {
    expect(minLot(START_SIZE)).toBe(-6);
    expect(maxLot(START_SIZE)).toBe(5);
    expect(maxLot(START_SIZE) - minLot(START_SIZE) + 1).toBe(START_SIZE);
  });

  it("checks bounds", () => {
    expect(inBounds(12, 0, 0)).toBe(true);
    expect(inBounds(12, -6, 5)).toBe(true);
    expect(inBounds(12, 6, 0)).toBe(false);
    expect(inBounds(12, 0, -7)).toBe(false);
    expect(inBounds(14, 6, -7)).toBe(true);
  });

  it("round-trips lots and world positions", () => {
    expect(lotToWorld(2, -3)).toEqual([2 * LOT, -3 * LOT]);
    expect(worldToLot(2 * LOT + 20, -3 * LOT - 20)).toEqual([2, -3]);
  });

  it("centers the terrain half a lot off the origin", () => {
    const t = terrainBounds(12);
    expect(t.width).toBe(12 * LOT);
    expect(t.cx).toBe(-0.5 * LOT);
  });

  it("grows past 70% occupancy, up to the cap", () => {
    expect(shouldGrow(100, 12)).toBe(false); // 100/144 = 69%
    expect(shouldGrow(101, 12)).toBe(true);
    expect(shouldGrow(10_000, MAX_SIZE)).toBe(false);
    expect(grownSize(101, 12)).toBe(14);
    expect(grownSize(10_000, 12)).toBe(MAX_SIZE);
  });
});
