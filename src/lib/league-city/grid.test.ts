import { describe, expect, it } from "vitest";
import { LOT, MAX_H, START_H, bounds, grownH, inBounds, lotCount, lotToWorld, shouldGrow, terrainBounds, worldBounds, worldToLot } from "./grid";

describe("grid", () => {
  it("anchors the city at the entrance row: 13 × 12 lots to start", () => {
    expect(bounds(START_H)).toEqual({ x0: -6, x1: 6, z0: -11, z1: 0 });
    expect(lotCount(START_H)).toBe(13 * 12);
    expect(lotCount(MAX_H)).toBe(41 * 40);
  });

  it("grows east, west and north, never south", () => {
    const a = bounds(6);
    const b = bounds(7);
    expect(b.x0).toBe(a.x0 - 1);
    expect(b.x1).toBe(a.x1 + 1);
    expect(b.z0).toBe(a.z0 - 2);
    expect(b.z1).toBe(a.z1);
  });

  it("checks bounds", () => {
    expect(inBounds(6, 0, 0)).toBe(true);
    expect(inBounds(6, 6, -11)).toBe(true);
    expect(inBounds(6, 0, 1)).toBe(false);
    expect(inBounds(6, 7, 0)).toBe(false);
    expect(inBounds(6, 0, -12)).toBe(false);
  });

  it("round-trips lots and world positions", () => {
    expect(lotToWorld(2, -3)).toEqual([2 * LOT, -3 * LOT]);
    expect(worldToLot(2 * LOT + 20, -3 * LOT - 20)).toEqual([2, -3]);
  });

  it("puts the terrain north of the entrance, centered on x", () => {
    const t = terrainBounds(6);
    expect(t.width).toBe(13 * LOT);
    expect(t.depth).toBe(12 * LOT);
    expect(t.cx).toBe(0);
    expect(worldBounds(6).maxZ).toBe(LOT / 2);
  });

  it("grows past 70% occupancy, up to the cap", () => {
    expect(shouldGrow(109, 6)).toBe(false); // 109/156 = 69.9%
    expect(shouldGrow(110, 6)).toBe(true);
    expect(shouldGrow(100_000, MAX_H)).toBe(false);
    expect(grownH(110, 6)).toBe(7);
    expect(grownH(100_000, 6)).toBe(MAX_H);
  });
});
