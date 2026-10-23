import { describe, expect, it } from "vitest";
import { HEIST, RULES, gameCops, heldPoints, inRing, pickDayCity, pushPoints, ringOf, standingOf, starsFor, stepPush } from "./heist";

const city = (key: string, buildings: number) => ({ key, name: key, uf: "SP", buildings });

describe("pickDayCity", () => {
  it("picks among cities with 30+ buildings, the same for the same day", () => {
    const cities = [city("1", 40), city("2", 31), city("3", 90), city("4", 5)];
    const a = pickDayCity(cities, "2026-10-22");
    expect(a && ["1", "2", "3"].includes(a.key)).toBe(true);
    expect(pickDayCity([...cities].reverse(), "2026-10-22")).toEqual(a);
  });

  it("falls back to the biggest cities while few are big enough", () => {
    const cities = [city("1", 12), city("2", 9), city("3", 3), city("4", 2), city("5", 1), city("6", 1)];
    const picked = new Set(Array.from({ length: 40 }, (_, i) => pickDayCity(cities, `2026-11-${String(i).padStart(2, "0")}`)?.key));
    expect(picked.has("6")).toBe(false);
    expect(picked.has("1")).toBe(true);
  });

  it("skips yesterday's city when there's another, never the island", () => {
    const cities = [city("1", 40), city("2", 40), city("island", 99)];
    for (let d = 1; d <= 20; d++) {
      const day = `2026-12-${String(d).padStart(2, "0")}`;
      const y = pickDayCity(cities, day)!.key;
      expect(pickDayCity(cities, day, y)!.key).not.toBe(y);
      expect(y).not.toBe("island");
    }
  });

  it("is null with no city", () => {
    expect(pickDayCity([], "2026-10-22")).toBeNull();
  });
});

describe("rules", () => {
  it("stars climb with points held", () => {
    expect(starsFor(0)).toBe(0);
    expect(starsFor(1)).toBe(1);
    expect(starsFor(10)).toBe(2);
    expect(starsFor(79)).toBe(4);
    expect(starsFor(99)).toBe(5);
    expect(heldPoints(19)).toBe(0);
    expect(heldPoints(250)).toBe(12);
  });

  it("real cops take game cops' places, at most 4", () => {
    expect(gameCops(5, 0)).toBe(RULES.maxGameCops);
    expect(gameCops(3, 1)).toBe(2);
    expect(gameCops(1, 3)).toBe(0);
  });

  it("the ring is in meters around the city's square", () => {
    const r = ringOf([10, -5], 2, 48, 0.4);
    expect(r.x).toBeCloseTo(192);
    expect(r.z).toBeCloseTo(-96);
    expect(r.r).toBeCloseTo(3.5 * 48 * 0.4);
    expect(inRing(r, r.x + r.r - 1, r.z)).toBe(true);
    expect(inRing(r, r.x + r.r + 1, r.z)).toBe(false);
  });

  it("the push bar fills out of the ring, stops near a cop, resets back in", () => {
    const p = { held: 0 };
    expect(stepPush(p, 3000, true, false, 2)).toBe(false);
    expect(stepPush(p, 1000, true, true, 2)).toBe(false);
    expect(p.held).toBe(3000);
    expect(stepPush(p, 2500, true, false, 2)).toBe(true);
    expect(stepPush(p, 100, true, false, 2)).toBe(false);
    stepPush(p, 100, false, false, 2);
    expect(p.held).toBe(0);
    expect(stepPush(p, 9000, true, false, 0)).toBe(false);
  });

  it("pushes pay what's held, under the day's cap", () => {
    expect(pushPoints(30, 0)).toBe(30);
    expect(pushPoints(50, 80)).toBe(20);
    expect(pushPoints(5, HEIST.dayCap)).toBe(0);
  });

  it("standing is what didn't fall", () => {
    expect(standingOf(100, 26)).toBeCloseTo(0.74);
    expect(standingOf(10, 30)).toBe(0);
  });
});
