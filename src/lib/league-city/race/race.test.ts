import { describe, expect, it } from "vitest";
import { TRACK, WALL_OFFSET, arcDelta, locate, locateNear, pointAt, theTrack } from "./track";
import { formatLap, minLapMs, newLapState, stepLaps, type LapEvent, type LapState } from "./laps";
import { RACE, idleRace, jumpStart, litLights, raceLap, standings, startRace, tickRace } from "./race";

const track = theTrack();

/** Drives along the centerline at `speed` m/s from s0 for `meters`, a state every 66 ms. */
function drive(st: LapState, s0: number, meters: number, speed: number, t0: number, lateral = 0): { events: LapEvent[]; t: number } {
  const events: LapEvent[] = [];
  const step = speed * 0.066;
  let t = t0;
  for (let d = 0; d <= meters; d += step) {
    const p = pointAt(track, s0 + d);
    events.push(...stepLaps(track, st, p.x + p.tz * lateral, p.z - p.tx * lateral, t));
    t += 66;
  }
  return { events, t };
}

describe("track", () => {
  it("is a closed loop about 1.6 km long", () => {
    expect(track.length).toBeGreaterThan(1400);
    expect(track.length).toBeLessThan(1800);
    const a = track.samples[0];
    const b = track.samples[track.samples.length - 1];
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(3);
  });

  it("never runs close enough to itself for the walls to cross", () => {
    const s = track.samples;
    let min = Infinity;
    for (let i = 0; i < s.length; i += 2)
      for (let j = i + 1; j < s.length; j += 2) {
        if (Math.abs(arcDelta(track, s[i].s, s[j].s)) < 90) continue;
        min = Math.min(min, Math.hypot(s[i].x - s[j].x, s[i].z - s[j].z));
      }
    expect(min).toBeGreaterThan(2 * (WALL_OFFSET + TRACK.wallThickness / 2));
  });

  it("has no corner tighter than a 15 m radius", () => {
    const tightest = Math.max(...track.samples.map((p) => Math.abs(p.k)));
    expect(1 / tightest).toBeGreaterThan(15);
  });

  it("locates points by distance along and off the centerline", () => {
    const p = pointAt(track, 500);
    const spot = locate(track, p.x + p.tz * 3, p.z - p.tx * 3)!;
    expect(spot.s).toBeCloseTo(500, 0);
    expect(spot.lateral).toBeCloseTo(3, 0);
    expect(locateNear(track, p.x, p.z, 480, 20, 40).s).toBeCloseTo(500, 0);
  });

  it("puts the grid behind the start line", () => {
    for (const g of track.grid) {
      const spot = locate(track, g.x, g.z)!;
      expect(arcDelta(track, 0, spot.s)).toBeLessThan(0);
      expect(Math.abs(spot.lateral)).toBeLessThan(TRACK.width / 2);
    }
  });
});

describe("laps", () => {
  it("times a clean lap from line to line", () => {
    const st = newLapState();
    const out = drive(st, track.length - 20, track.length + 40, 25, 0);
    const start = out.events.find((e) => e.t === "start");
    const lap = out.events.find((e) => e.t === "lap");
    expect(start).toBeDefined();
    expect(lap).toMatchObject({ valid: true });
    expect(lap && lap.t === "lap" && lap.ms).toBeCloseTo((track.length / 25) * 1000, -2);
  });

  it("voids a lap that teleports ahead along the track", () => {
    const st = newLapState();
    let r = drive(st, track.length - 20, 400, 25, 0);
    r = drive(st, 700, track.length - 700 + 40, 25, r.t);
    expect(r.events.some((e) => e.t === "invalid")).toBe(true);
    expect(r.events.find((e) => e.t === "lap")).toMatchObject({ valid: false });
  });

  it("voids a lap driven faster than any car", () => {
    const st = newLapState();
    const r = drive(st, track.length - 20, track.length + 40, 60, 0);
    expect(r.events.find((e) => e.t === "lap")).toMatchObject({ valid: false });
  });

  it("voids a lap that leaves the walls", () => {
    const st = newLapState();
    let r = drive(st, track.length - 20, 300, 25, 0);
    const p = pointAt(track, 300);
    stepLaps(track, st, p.x + p.tz * 40, p.z - p.tx * 40, r.t);
    r = drive(st, 300, track.length - 300 + 40, 25, r.t + 66);
    expect(r.events.find((e) => e.t === "lap")).toMatchObject({ valid: false });
  });

  it("keeps a lap valid through a reset back to the last checkpoint", () => {
    const st = newLapState();
    let r = drive(st, track.length - 20, 520, 25, 0);
    r = drive(st, 480, track.length - 480 + 40, 25, r.t + 500);
    expect(r.events.find((e) => e.t === "lap")).toMatchObject({ valid: true });
  });

  it("keeps a lap valid through the runoff", () => {
    const st = newLapState();
    const r = drive(st, track.length - 20, track.length + 40, 25, 0, TRACK.width / 2 + 2);
    expect(r.events.find((e) => e.t === "lap")).toMatchObject({ valid: true });
  });

  it("formats times", () => {
    expect(formatLap(83456)).toBe("1:23.456");
    expect(formatLap(minLapMs(track))).toMatch(/^0:\d\d\.\d{3}$/);
  });
});

describe("race", () => {
  const drivers = [
    { id: "a", name: "alice" },
    { id: "b", name: "bob" },
    { id: "c", name: "guest-zzzz" },
  ];

  it("grids by best lap, then by arrival", () => {
    const s = idleRace();
    expect(startRace(s, drivers, { bob: 70_000 }, 0, 0)).toBe(true);
    expect(s.grid).toEqual(["b", "a", "c"]);
  });

  it("runs lights, laps and finish order with penalties", () => {
    const s = idleRace();
    startRace(s, drivers, {}, 0, 0.5);
    expect(litLights(s, s.lightsAt + 2500)).toBe(3);
    expect(jumpStart(s, "a")).toBe(true);
    expect(jumpStart(s, "a")).toBe(false);
    tickRace(s, s.startsAt);
    expect(s.phase).toBe("live");
    for (let i = 0; i < RACE.laps; i++) {
      raceLap(s, "a", s.startsAt + 60_000 * (i + 1));
      raceLap(s, "b", s.startsAt + 60_000 * (i + 1) + 2_000);
    }
    expect(s.finished.map((f) => f.id)).toEqual(["b", "a"]);
    expect(standings(s, { c: 100 }, track.length)).toEqual(["b", "a", "c"]);
    tickRace(s, s.endsAt);
    expect(s.phase).toBe("over");
  });
});
