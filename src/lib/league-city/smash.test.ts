import { describe, expect, it } from "vitest";
import { SMASH, columnEdges, smashStoreFor } from "./smash";

const tower = {
  loginLower: "a",
  position: [0, 0, 0] as [number, number, number],
  width: 40,
  depth: 40,
  height: 60,
  floors: 10,
  windowsPerFloor: 8,
  sideWindowsPerFloor: 8,
};

describe("columnEdges", () => {
  it("cuts on window lines, at most 4 columns", () => {
    expect(columnEdges(8)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(columnEdges(3)).toEqual([0, 1 / 3, 2 / 3, 1]);
    expect(columnEdges(6)).toEqual([0, 2 / 6, 3 / 6, 5 / 6, 1]);
    expect(columnEdges(1)).toEqual([0, 1]);
  });
});

describe("SmashStore", () => {
  it("a pass takes the bottom floor of the columns the car touches, only those", () => {
    const s = smashStoreFor([tower]);
    // Car at the building's west edge, middle row of columns: touches column a=0.
    const hits = s.hitCircle(-19, -5, 2, 1, 0);
    expect(hits.length).toBeGreaterThan(0);
    expect(s.rows[0 + 1 * 4]).toBe(9);
    expect(s.rows[3]).toBe(10);
    expect(s.isDamaged(0)).toBe(true);
  });

  it("the cooldown keeps a car inside a column to one floor per pass", () => {
    const s = smashStoreFor([tower]);
    s.hitCircle(-19, -5, 2, 1, 0, 200);
    s.hitCircle(-19, -5, 2, 1, 50, 200);
    expect(s.rows[4]).toBe(9);
    s.hitCircle(-19, -5, 2, 1, 250, 200);
    expect(s.rows[4]).toBe(8);
  });

  it("falls when every column is out, and says so on the last hit", () => {
    const s = smashStoreFor([tower]);
    const hits = s.hitCircle(0, 0, 40, 10, 0);
    expect(s.standing(0)).toBe(0);
    expect(hits.filter((h) => h.down)).toHaveLength(1);
  });

  it("grows a row back per regen period, and heals fully", () => {
    const s = smashStoreFor([tower], 1000);
    s.hitCircle(0, 0, 40, 3, 0);
    s.frame(2500, 0.016);
    expect(s.rows[0]).toBe(9);
    s.frame(10_000, 0.016);
    expect(s.rows[0]).toBe(10);
    expect(s.isDamaged(0)).toBe(false);
  });

  it("loads saved damage with the floors grown back since, by time and by contributions", () => {
    const s = smashStoreFor([tower], 1000);
    s.load([{ login: "a", rows: Array(16).fill(2), regenFrom: 0, contribBase: 10, contribNow: 13, demolishedBy: null, shieldUntil: 0 }], 2500);
    // 2 left + 3 contributions + 2 hours (periods) = 7.
    expect(s.rows[0]).toBe(7);
    expect(s.shown[0]).toBe(7);
    expect(s.isDamaged(0)).toBe(true);
    expect(s.regenFrom(0)).toBe(2000);
  });

  it("takes the room's rows: fewer drop into the gap, all full heals", () => {
    const s = smashStoreFor([tower]);
    s.setRows(0, Array(16).fill(7), 100);
    expect(s.rows[5]).toBe(7);
    expect(s.drop[5]).toBe(3);
    expect(s.isDamaged(0)).toBe(true);
    s.setRows(0, Array(16).fill(10), 200);
    expect(s.isDamaged(0)).toBe(false);
  });

  it("the room applies hits by column, names who took the last floor, and saves only what changed", () => {
    const s = smashStoreFor([tower]);
    s.takeChanged();
    expect(s.hitColumns(0, [0, 1, 99, 1], 3, 0, "x")).toEqual({ took: 6, down: false });
    expect(s.takeChanged()).toEqual([0]);
    const r = s.hitColumns(0, Array.from({ length: 16 }, (_, c) => c), 10, 0, "killer");
    expect(r.down).toBe(true);
    expect(s.snapshot()[0].demolishedBy).toBe("killer");
    s.regrow(0, 10);
    expect(s.isDamaged(0)).toBe(false);
    expect(s.demolishedBy.size).toBe(0);
  });
});

describe("standingHeight", () => {
  it("is the tallest column left, a floor of rubble at least", () => {
    const s = smashStoreFor([tower]);
    s.hitColumns(0, Array.from({ length: 16 }, (_, c) => c), 7, 0);
    expect(s.standingHeight(0)).toBe(3 * 6);
    s.hitColumns(0, Array.from({ length: 16 }, (_, c) => c), 10, 0);
    expect(s.standingHeight(0)).toBe(6);
  });

  it("never hits the spared building (your own)", () => {
    const s = smashStoreFor([tower]);
    expect(s.hitCircle(0, 0, 30, 1, 0, 0, undefined, "a")).toEqual([]);
    expect(s.isDamaged(0)).toBe(false);
  });

  it("with `only`, breaks just that building (a guest's free one)", () => {
    const s = smashStoreFor([tower, { ...tower, loginLower: "b", position: [30, 0, 0] }]);
    const hits = s.hitCircle(15, 0, 30, 1, 0, 0, undefined, undefined, "b");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.target === 1)).toBe(true);
    expect(s.isDamaged(0)).toBe(false);
  });

  it("a fallen building is shielded: no floor comes off until the shield ends", () => {
    const s = smashStoreFor([{ ...tower, floors: 1, windowsPerFloor: 1, sideWindowsPerFloor: 1 }]);
    const { down } = s.hitColumns(0, [0], 1, 1000, "b");
    expect(down).toBe(true);
    expect(s.isShielded(0, 1000 + SMASH.shieldMs - 1)).toBe(true);
    s.regrow(0, 1);
    expect(s.hitColumns(0, [0], 1, 2000).took).toBe(0);
    expect(s.hitCircle(0, 0, 30, 1, 2000)).toEqual([]);
    expect(s.hitColumns(0, [0], 1, 1000 + SMASH.shieldMs).took).toBe(1);
  });

  it("a fallen building lies in rubble with its flag for rubbleMs: time, contributions and the owner can't grow it back", () => {
    const s = smashStoreFor([tower], 1000);
    // First hit long before the fall: the regen clock must not count from it.
    s.hitColumns(0, [0], 1, 0, "x");
    const fell = 5000;
    expect(s.hitColumns(0, Array.from({ length: 16 }, (_, c) => c), 10, fell, "killer").down).toBe(true);
    const end = fell + SMASH.rubbleMs;
    s.regrow(0, 3, fell + 1);
    s.frame(end - 1, 0.016);
    expect(s.standing(0)).toBe(0);
    expect(s.demolishedBy.get(0)).toBe("killer");
    s.frame(end, 0.016);
    expect(s.rows[0]).toBe(1);
    expect(s.demolishedBy.size).toBe(0);
  });

  it("loads rubble without the contributions made since, and keeps its flag", () => {
    const s = smashStoreFor([tower], 1000);
    const shieldUntil = 1000 + SMASH.shieldMs;
    s.load([{ login: "a", rows: Array(16).fill(0), regenFrom: 1000, contribBase: 10, contribNow: 15, demolishedBy: "killer", shieldUntil }], 2000);
    expect(s.standing(0)).toBe(0);
    expect(s.demolishedBy.get(0)).toBe("killer");
  });

  it("keeps a shielded building in the snapshot even once it's whole again", () => {
    const s = smashStoreFor([{ ...tower, floors: 1, windowsPerFloor: 1, sideWindowsPerFloor: 1 }]);
    s.hitColumns(0, [0], 1, 1000, "b");
    s.regrow(0, 1);
    expect(s.snapshot(2000).map((d) => d.shieldUntil)).toEqual([1000 + SMASH.shieldMs]);
    expect(s.snapshot(1000 + SMASH.shieldMs)).toEqual([]);
  });
});
