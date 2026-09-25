import { describe, expect, it } from "vitest";
import { LOT } from "./grid";
import { CRUISE, carAt, carIntro, introSeconds } from "./intro";

describe("carIntro", () => {
  const c = carIntro();

  it("starts far out on the approach, well before the arch", () => {
    expect(c.startZ - LOT / 2).toBeGreaterThan(3 * LOT);
  });

  it("switches a little past the arch and stops up the main street", () => {
    expect(c.switchZ).toBeLessThan(LOT / 2);
    expect(c.switchZ).toBeGreaterThan(-LOT);
    expect(c.stopZ).toBeLessThan(c.switchZ);
    expect(c.stopZ).toBeGreaterThan(-3 * LOT);
  });

  it("cruises to the switch, then brakes smoothly to a stop at the end of the rise", () => {
    expect(carAt(c, 0).z).toBe(c.startZ);
    expect(carAt(c, c.cruise).z).toBeCloseTo(c.switchZ);
    expect(carAt(c, c.cruise).speed).toBe(CRUISE);
    expect(carAt(c, c.cruise + c.rise).z).toBeCloseTo(c.stopZ);
    expect(carAt(c, c.cruise + c.rise).speed).toBeCloseTo(0);
    expect(carAt(c, 99).z).toBeCloseTo(c.stopZ);
    expect(carAt(c, c.crossAt).z).toBeCloseTo(LOT / 2);
    expect(c.crossAt).toBeLessThan(c.cruise);
  });

  it("lasts about 10 seconds", () => {
    expect(introSeconds(c)).toBeGreaterThan(6);
    expect(introSeconds(c)).toBeLessThan(13);
  });
});
