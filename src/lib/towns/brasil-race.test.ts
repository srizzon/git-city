import { describe, expect, it } from "vitest";
import { LOT } from "../league-city/grid";
import { UNIT_TO_M } from "../league-city/drive/tuning";
import { layoutBrasil, type MapDev, type UF } from "./brasil-map";
import { ROUTE, cityByKey, minRaceMs, nearestCity, parseRouteKey, pickDestination, raceRoute, reachable, startLine } from "./brasil-race";

const SP = "3550308";
const CAMPINAS = 3509502;
const GUARULHOS = 3518800;
const RIO = "3304557";
const LOT_M = LOT * UNIT_TO_M;

const devs = (spec: [UF | null, number, number?][]): (MapDev & { city?: number | null })[] => {
  let id = 0;
  return spec.flatMap(([uf, n, city]) => Array.from({ length: n }, () => ({ id: ++id, login: `dev${id}`, uf, city })));
};

const layout = layoutBrasil(devs([["SP", 30], ["SP", 6, CAMPINAS], ["SP", 4, GUARULHOS], ["RJ", 12], ["MG", 8], ["PR", 5]]));

describe("raceRoute", () => {
  it("joins two capitals by road, the same route every time", () => {
    const a = raceRoute(layout, SP, RIO)!;
    const b = raceRoute(layout, SP, RIO)!;
    expect(a).not.toBeNull();
    expect(a.key).toBe(b.key);
    expect(a.gates).toEqual(b.gates);
    expect(parseRouteKey(a.key)).toEqual({ from: SP, to: RIO, hash: a.hash });
  });

  it("ends on the destination's hub, with gates no closer than the minimum", () => {
    const r = raceRoute(layout, SP, RIO)!;
    const rio = cityByKey(layout, RIO)!;
    expect(r.gates[r.gates.length - 1].slice(0, 2)).toEqual([rio.hub[0] * LOT_M, rio.hub[1] * LOT_M]);
    for (let i = 1; i < r.gates.length; i++) {
      const [ax, az] = r.gates[i - 1];
      const [bx, bz] = r.gates[i];
      expect(Math.hypot(bx - ax, bz - az)).toBeGreaterThanOrEqual(ROUTE.gateMin * LOT_M - 0.01);
    }
  });

  it("faces every gate along its own road, never on a corner", () => {
    const r = raceRoute(layout, SP, RIO)!;
    for (const [x, z, rot] of r.gates.slice(0, -1)) {
      const f = (rot * Math.PI) / 180;
      // A lot behind and a lot ahead of the gate, along its heading, are both on the route's line.
      const on = (px: number, pz: number) => r.line.some(([lx, lz]) => Math.hypot(lx - px, lz - pz) < 1);
      expect(on(x - Math.sin(f) * LOT_M, z + Math.cos(f) * LOT_M)).toBe(true);
      expect(on(x + Math.sin(f) * LOT_M, z - Math.cos(f) * LOT_M)).toBe(true);
    }
  });

  it("puts the grid behind the start line, facing along the route", () => {
    const r = raceRoute(layout, SP, RIO)!;
    const line = startLine(r);
    const front = r.grid[0];
    const f = (line.rot * Math.PI) / 180;
    // Behind the line: the line is ahead of the front row along its heading.
    const ahead = (line.x - front.x) * Math.sin(f) + (line.z - front.z) * -Math.cos(f);
    expect(ahead).toBeGreaterThan(0);
    expect(r.grid).toHaveLength(30);
  });

  it("has no route to itself or to a city that isn't there", () => {
    expect(raceRoute(layout, SP, SP)).toBeNull();
    expect(raceRoute(layout, SP, "9999999")).toBeNull();
  });
});

describe("destinations", () => {
  it("finds the cities in reach, nearest first", () => {
    const sp = cityByKey(layout, SP)!;
    const all = reachable(layout, sp);
    expect(all.length).toBeGreaterThan(3);
    for (let i = 1; i < all.length; i++) expect(all[i].secs).toBeGreaterThanOrEqual(all[i - 1].secs);
  });

  it("picks a destination for every length", () => {
    const sp = cityByKey(layout, SP)!;
    for (const len of ["short", "medium", "long"] as const) {
      const to = pickDestination(layout, sp, len, () => 0.5);
      expect(to).not.toBeNull();
      expect(raceRoute(layout, SP, to!.key)).not.toBeNull();
    }
  });

  it("finds the city a car is in", () => {
    const sp = cityByKey(layout, SP)!;
    expect(nearestCity(layout, sp.hub[0] * LOT_M + 30, sp.hub[1] * LOT_M)?.key).toBe(SP);
  });

  it("never times a route faster than a car can go", () => {
    expect(minRaceMs(4000)).toBe(100_000);
  });
});
