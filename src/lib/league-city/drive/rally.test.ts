import { describe, expect, it } from "vitest";
import { RALLY, RALLY_BOXES, idleRally, rallyBoxSpots, rallyItem, takeRallyBox, joinRally, leaveRally, rallyStandings, startRally, stepRally, tickRally, validRoute, type RallyRoute, type RallyTrack } from "./rally";

const route: RallyRoute = {
  from: "3550308",
  to: "3304557",
  key: "3550308-3304557:0a1b2c3d",
  gates: [
    [0, 200, 180],
    [0, 400, 180],
    [0, 600, 180],
  ],
  grid: [
    [-3, -10, 180],
    [3, -10, 180],
    [-3, -17, 180],
  ],
  length: 600,
};

/** A race with a and b on the grid, lights out at `startsAt`. */
function live() {
  const st = idleRally();
  startRally(st, "r1", "a", "alice", route, 0, false);
  joinRally(st, "b", "bob", 1000);
  tickRally(st, RALLY.invite, () => 0);
  tickRally(st, st.startsAt, () => 0);
  return st;
}

/** Drive `id` from z0 to z1 at `speed` m/s from time t0, a state every 66 ms. */
function drive(st: ReturnType<typeof live>, id: string, z0: number, z1: number, t0: number, speed: number, track: Map<string, RallyTrack>) {
  const events = [];
  let t = t0;
  for (let z = z0; z <= z1; z += speed * 0.066, t += 66) {
    events.push(...stepRally(st, id, 0, z, t, track.get(id)));
    track.set(id, { x: 0, z, at: t });
  }
  return { events, t };
}

describe("rally", () => {
  it("invites, then counts down, then goes live", () => {
    const st = idleRally();
    expect(startRally(st, "r1", "a", "alice", route, 0, false)).toBe(true);
    expect(st.phase).toBe("invite");
    expect(joinRally(st, "b", "bob", 1000)).toBe(true);
    expect(joinRally(st, "c", "carol", RALLY.invite)).toBe(false);
    tickRally(st, RALLY.invite, () => 0);
    expect(st.phase).toBe("countdown");
    expect(st.racers.b.slot).toBe(1);
    tickRally(st, st.startsAt);
    expect(st.phase).toBe("live");
  });

  it("starts at once when you're alone", () => {
    const st = idleRally();
    startRally(st, "r1", "a", "alice", route, 0, true);
    tickRally(st, 0, () => 0);
    expect(st.phase).toBe("countdown");
  });

  it("times the gates in order and the finish", () => {
    const st = live();
    const track = new Map<string, RallyTrack>();
    const { events } = drive(st, "a", -10, 610, st.startsAt, 25, track);
    expect(events.filter((e) => e.t === "gate").map((e) => (e.t === "gate" ? e.k : -1))).toEqual([0, 1]);
    const fin = events.find((e) => e.t === "finish");
    expect(fin && fin.t === "finish" && fin.place).toBe(1);
    expect(st.racers.a.ms).toBeGreaterThan(23_000);
    expect(st.endsAt).toBeLessThanOrEqual(st.startsAt + 30_000 + RALLY.afterWinner);
  });

  it("never counts a skipped gate", () => {
    const st = live();
    // Around gate 0 (x = 200), then onto the line.
    for (const [x, z, t] of [
      [0, 0, st.startsAt + 100],
      [100, 100, st.startsAt + 6000],
      [100, 300, st.startsAt + 12000],
      [0, 600, st.startsAt + 22000],
    ]) {
      stepRally(st, "a", x, z, t, undefined);
    }
    expect(st.racers.a.next).toBe(0);
    expect(st.racers.a.ms).toBeNull();
  });

  it("leaves a car that teleports untimed", () => {
    const st = live();
    const track = new Map<string, RallyTrack>([["a", { x: 0, z: 0, at: st.startsAt }]]);
    const ev = stepRally(st, "a", 0, 590, st.startsAt + 100, track.get("a"));
    expect(ev.some((e) => e.t === "void")).toBe(true);
    track.set("a", { x: 0, z: 590, at: st.startsAt + 100 });
    drive(st, "a", 590, 610, st.startsAt + 200, 20, track);
    expect(st.racers.a.ms).toBe(-1);
    expect(st.order).toEqual([]);
  });

  it("ends when everyone is in, and goes idle after the results", () => {
    const st = live();
    const track = new Map<string, RallyTrack>();
    const a = drive(st, "a", -10, 610, st.startsAt, 25, track);
    drive(st, "b", -10, 610, st.startsAt, 22, track);
    expect(rallyStandings(st)).toEqual(["a", "b"]);
    tickRally(st, a.t + 30_000);
    expect(st.phase).toBe("over");
    tickRally(st, st.endsAt + RALLY.over);
    expect(st.phase).toBe("idle");
  });

  it("drops the invite when its starter leaves, and a racer who leaves mid-race", () => {
    const st = idleRally();
    startRally(st, "r1", "a", "alice", route, 0, false);
    leaveRally(st, "a");
    expect(st.phase).toBe("idle");
    const l = live();
    leaveRally(l, "b");
    expect(l.racers.b.gone).toBe(true);
  });

  it("refuses a route that isn't one", () => {
    expect(validRoute(route, 50_000)).toEqual(route);
    expect(validRoute({ ...route, gates: [] }, 50_000)).toBeNull();
    expect(validRoute({ ...route, gates: [[0, 1e9, 0]] }, 50_000)).toBeNull();
    expect(validRoute({ ...route, gates: [[0, 10]] }, 50_000)).toBeNull();
    expect(validRoute({ ...route, from: route.to }, 50_000)).toBeNull();
    expect(validRoute({ ...route, key: "<script>" }, 50_000)).toBeNull();
  });

  it("puts rows of boxes across the road between gates, never on the way to the finish", () => {
    const long = { gates: Array.from({ length: 10 }, (_, i) => [0, -i * 100, 0] as [number, number, number]) };
    const spots = rallyBoxSpots(long);
    expect(spots.length % RALLY_BOXES.lanes.length).toBe(0);
    // First row just before gate 1 (heading north, -z), across x.
    expect(spots.slice(0, 4).map(([, z]) => Math.round(z))).toEqual([-75, -75, -75, -75]);
    expect(new Set(spots.slice(0, 4).map(([x]) => x)).size).toBe(4);
    for (const [, z] of spots) expect(z).toBeGreaterThan(-800);
  });

  it("takes a box once a generation, only while racing", () => {
    const st = live();
    expect(st.boxGen.length).toBe(rallyBoxSpots(route).length);
    if (!st.boxGen.length) return;
    expect(takeRallyBox(st, "a", 0, 0, st.startsAt + 10)).toBe(true);
    expect(takeRallyBox(st, "b", 0, 0, st.startsAt + 20)).toBe(false);
    expect(takeRallyBox(st, "b", 0, 1, st.startsAt + 30)).toBe(false);
    expect(takeRallyBox(st, "b", 0, 1, st.startsAt + 10 + RALLY_BOXES.respawn)).toBe(true);
    expect(takeRallyBox(st, "zz", 0, 2, st.startsAt + 99_999)).toBe(false);
  });

  it("gives the back of the field the missiles", () => {
    let s = 1;
    const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const count = (place: number) => Array.from({ length: 2000 }, () => rallyItem(place, 6, rand)).filter((x) => x === "missile").length;
    expect(count(6)).toBeGreaterThan(count(1) * 3);
  });
});
