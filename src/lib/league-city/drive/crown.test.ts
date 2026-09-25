import { describe, expect, it } from "vitest";
import { CROWN, dropCrown, grabCrown, idleCrown, knockFrom, leaveCrown, scatterFrom, startCrown, stealCrown, tickCrown } from "./crown";

function live() {
  const s = idleCrown();
  expect(startCrown(s, ["a", "b"], 0, 10, 20)).toBe(true);
  expect(tickCrown(s, CROWN.countdown)).toBe(true);
  expect(s.phase).toBe("live");
  return s;
}
const T0 = CROWN.countdown;

describe("crown rush", () => {
  it("needs two drivers and counts down 3 s before the crown appears", () => {
    const s = idleCrown();
    expect(startCrown(s, ["a"], 0, 0, 0)).toBe(false);
    expect(startCrown(s, ["a", "b"], 0, 5, 6)).toBe(true);
    expect(s).toMatchObject({ phase: "countdown", x: 5, z: 6, left: { a: CROWN.goal, b: CROWN.goal } });
    expect(grabCrown(s, "a", 1000)).toBe(false);
    expect(startCrown(s, ["a", "b"], 10, 0, 0)).toBe(false); // already running
  });

  it("counts your time only while you hold it, and pauses when you lose it", () => {
    const s = live();
    expect(grabCrown(s, "a", T0 + 100)).toBe(true);
    tickCrown(s, T0 + 10_100);
    expect(s.left.a).toBe(CROWN.goal - 10_000);
    expect(dropCrown(s, T0 + 12_100, 1, 1)).toBe(true);
    expect(s.left.a).toBe(CROWN.goal - 12_000);
    tickCrown(s, T0 + 20_000);
    expect(s.left.a).toBe(CROWN.goal - 12_000); // paused
  });

  it("lets a loose crown be taken only after a moment", () => {
    const s = live();
    grabCrown(s, "a", T0);
    dropCrown(s, T0 + 5000, 1, 1);
    expect(grabCrown(s, "b", T0 + 5000 + CROWN.loose - 1)).toBe(false);
    expect(grabCrown(s, "b", T0 + 5000 + CROWN.loose)).toBe(true);
  });

  it("protects a fresh holder for a moment", () => {
    const s = live();
    grabCrown(s, "a", T0);
    expect(dropCrown(s, T0 + CROWN.immune - 1, 0, 0)).toBe(false);
    expect(stealCrown(s, "b", T0 + CROWN.immune - 1)).toBe(false);
    expect(stealCrown(s, "b", T0 + CROWN.immune)).toBe(true);
    expect(s.holder).toBe("b");
  });

  it("puts you back to 5 s when you lose it that close to winning", () => {
    const s = live();
    grabCrown(s, "a", T0);
    tickCrown(s, T0 + CROWN.goal - 2000);
    expect(s.left.a).toBe(2000);
    stealCrown(s, "b", T0 + CROWN.goal - 2000);
    expect(s.left.a).toBe(CROWN.floor);
  });

  it("ends when someone reaches zero", () => {
    const s = live();
    grabCrown(s, "b", T0);
    expect(tickCrown(s, T0 + CROWN.goal)).toBe(true);
    expect(s).toMatchObject({ phase: "over", winner: "b", holder: null });
    expect(startCrown(s, ["a", "b"], T0 + CROWN.goal + 1000, 0, 0)).toBe(false); // result still showing
    expect(startCrown(s, ["a", "b"], T0 + CROWN.goal + CROWN.over, 0, 0)).toBe(true);
  });

  it("gives it to whoever has the least left when time runs out, or nobody on a tie", () => {
    const s = live();
    grabCrown(s, "a", T0);
    dropCrown(s, T0 + 8000, 0, 0);
    grabCrown(s, "b", T0 + 9000);
    dropCrown(s, T0 + 12_000, 0, 0);
    tickCrown(s, T0 + CROWN.match);
    expect(s).toMatchObject({ phase: "over", winner: "a" });

    const t = live();
    tickCrown(t, T0 + CROWN.match);
    expect(t.winner).toBeNull();
  });

  it("drops the crown where a leaving holder was", () => {
    const s = live();
    grabCrown(s, "a", T0);
    expect(leaveCrown(s, "a", T0 + 3000, 7, 8)).toBe(true);
    expect(s).toMatchObject({ holder: null, x: 7, z: 8 });
    expect("a" in s.left).toBe(false);
  });

  it("scatters a knocked-off crown a few meters away", () => {
    const [x, z] = scatterFrom(10, 10, 3);
    expect(Math.hypot(x - 10, z - 10)).toBeCloseTo(CROWN.scatter);
  });

  it("throws a bumped crown the way the bump pushed", () => {
    for (let seed = 0; seed < 20; seed++) {
      const [x, z] = knockFrom(0, 0, 10, 0, seed); // hit from the west
      expect(x).toBeGreaterThan(10 + CROWN.scatter * 0.9);
      expect(Math.abs(z)).toBeLessThan(CROWN.scatter * 0.35);
    }
  });

  it("keeps whoever lost it from taking it straight back, but lets the others in", () => {
    const s = live();
    grabCrown(s, "a", T0);
    dropCrown(s, T0 + 5000, 20, 0, 11, 0);
    expect(s).toMatchObject({ fromX: 11, x: 20, lockId: "a" });
    expect(grabCrown(s, "a", T0 + 5000 + CROWN.loose)).toBe(false);
    expect(grabCrown(s, "a", T0 + 5000 + CROWN.regrab - 1)).toBe(false);
    expect(grabCrown(s, "b", T0 + 5000 + CROWN.loose)).toBe(true);
  });

  it("lets the one who lost it take it back once the lockout ends", () => {
    const s = live();
    grabCrown(s, "a", T0);
    dropCrown(s, T0 + 5000, 20, 0);
    expect(grabCrown(s, "a", T0 + 5000 + CROWN.regrab)).toBe(true);
  });
});
