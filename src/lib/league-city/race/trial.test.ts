import { describe, expect, it } from "vitest";
import { theTrack, pointAt } from "./track";
import { AUTOPILOT, autopilot, safeSpeed } from "./autopilot";
import { countdownBeat, judgeLaunch, runCounts, trialLights } from "./trial";

const track = theTrack();

describe("countdown", () => {
  it("counts 3, 2, 1 then GO", () => {
    expect([0, 999, 1000, 2500, 2999, 3000, 9000].map((t) => countdownBeat(t, 1000))).toEqual([3, 3, 2, 1, 1, 0, 0]);
  });
  it("lights two, four, five, then out", () => {
    expect([3, 2, 1, 0].map(trialLights)).toEqual([2, 4, 5, 0]);
  });
});

describe("rocket start", () => {
  it("fires when the throttle goes down on the 2", () => {
    expect(judgeLaunch(1200, 1000)).toBe("rocket");
  });
  it("spins the wheels when held from the 3", () => {
    expect(judgeLaunch(300, 1000)).toBe("early");
  });
  it("is a plain start when pressed late or not at all", () => {
    expect(judgeLaunch(2400, 1000)).toBe("none");
    expect(judgeLaunch(null, 1000)).toBe("none");
  });
});

describe("autopilot", () => {
  const p = pointAt(track, 20);
  const along = Math.atan2(p.tx, p.tz);

  it("goes straight when lined up on a straight", () => {
    const c = autopilot(track, { s: null }, p.x, p.z, along, 10);
    expect(Math.abs(c.steer)).toBeLessThan(0.2);
    expect(c.throttle).toBe(1);
  });
  it("steers right when the nose points left of the track", () => {
    expect(autopilot(track, { s: null }, p.x, p.z, along + 0.4, 10).steer).toBeGreaterThan(0.5);
  });
  it("steers left when the nose points right", () => {
    expect(autopilot(track, { s: null }, p.x, p.z, along - 0.4, 10).steer).toBeLessThan(-0.5);
  });
  it("brakes when too fast for the corner ahead", () => {
    const min = Math.min(...Array.from({ length: 100 }, (_, i) => safeSpeed(track, (track.length * i) / 100)));
    expect(min).toBeLessThan(AUTOPILOT.cruise);
    const i = Array.from({ length: 100 }, (_, j) => j).find((j) => safeSpeed(track, (track.length * j) / 100) === min)!;
    const q = pointAt(track, (track.length * i) / 100);
    expect(autopilot(track, { s: null }, q.x, q.z, Math.atan2(q.tx, q.tz), 30).brake).toBe(1);
  });
  it("drives a whole lap without leaving the track (kinematic car)", () => {
    // A simple bicycle model: enough to prove the aim and the sign keep it on the line.
    const st = { s: null as number | null };
    const g = pointAt(track, 0);
    let x = g.x;
    let z = g.z;
    let h = Math.atan2(g.tx, g.tz);
    let v = 0;
    let driven = 0;
    const dt = 1 / 60;
    for (let i = 0; i < 60 * 120 && driven < track.length; i++) {
      const c = autopilot(track, st, x, z, h, v);
      v += (c.throttle * 6 - c.brake * 10) * dt;
      v = Math.max(0, v);
      h += -c.steer * Math.min(1.2, v * 0.12) * dt * 2;
      x += Math.sin(h) * v * dt;
      z += Math.cos(h) * v * dt;
      driven += v * dt;
      const q = pointAt(track, st.s ?? 0);
      expect(Math.hypot(q.x - x, q.z - z)).toBeLessThan(7);
    }
    expect(driven).toBeGreaterThanOrEqual(track.length);
  });
});

describe("records", () => {
  it("counts a run only when every lap was valid", () => {
    expect(runCounts([{ ms: 1, valid: true }, { ms: 1, valid: true }])).toBe(true);
    expect(runCounts([{ ms: 1, valid: true }, { ms: 1, valid: false }])).toBe(false);
    expect(runCounts([])).toBe(false);
  });
});
