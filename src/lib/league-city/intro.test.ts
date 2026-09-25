import { describe, expect, it } from "vitest";
import { LOT } from "./grid";
import { starterOps } from "./starter";
import { applyLocal } from "./editor/state";
import { LANE, carRoute, driveProgress, introSeconds } from "./intro";
import type { CityObject, CityOp } from "./types";

const road = (x: number, z: number) => ({ item_type: "road" as const, x, z, px: null });
const starter = (): CityObject[] => {
  const ops = starterOps([{ developer_id: 1, weight: 1 }]).ops.map((op, i) => (op.op === "place" && !op.id ? { ...op, id: `o${i}` } : op)) as CityOp[];
  return [...applyLocal(new Map(), ops).values()];
};

describe("carRoute", () => {
  it("starts outside on the approach and goes through the portal in the right lane", () => {
    const { points } = carRoute(starter());
    expect(points[0][1]).toBeGreaterThan(LOT);
    expect(points[0][0]).toBe(LANE);
    expect(points[1]).toEqual([LANE, LOT / 2 + 20]);
  });

  it("turns right onto the starter's cross street and parks a bit past the corner", () => {
    const { points } = carRoute(starter());
    const park = points.at(-1)!;
    expect(park[0]).toBeGreaterThan(LOT);
    expect(Math.abs(park[1] - -6 * LOT)).toBeLessThan(LOT / 2);
  });

  it("turns left when the only cross street goes west", () => {
    const objs = [road(0, 0), road(0, -1), road(0, -2), road(0, -3), road(-1, -3)];
    expect(carRoute(objs).points.at(-1)![0]).toBeLessThan(-LOT);
  });

  it("parks on the main street when there's no cross street", () => {
    const objs = [road(0, 0), road(0, -1), road(0, -2), road(0, -3)];
    const park = carRoute(objs).points.at(-1)!;
    expect(park[0]).toBeGreaterThan(LANE);
    expect(park[1]).toBeLessThan(-2 * LOT);
  });

  it("takes an unhurried 10 to 16 seconds in all", () => {
    const s = introSeconds(carRoute(starter()));
    expect(s).toBeGreaterThanOrEqual(10);
    expect(s).toBeLessThanOrEqual(16);
  });
});

describe("driveProgress", () => {
  it("covers the route and eases to a stop", () => {
    expect(driveProgress(0)).toBe(0);
    expect(driveProgress(1)).toBeCloseTo(1);
    const end = driveProgress(1) - driveProgress(0.98);
    const mid = driveProgress(0.52) - driveProgress(0.5);
    expect(end).toBeLessThan(mid / 5);
    for (let u = 0.01; u <= 1; u += 0.01) expect(driveProgress(u)).toBeGreaterThanOrEqual(driveProgress(u - 0.01));
  });
});
