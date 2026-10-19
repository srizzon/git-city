// ─── Brasil town: race routes ───────────────────────────────
// A race runs from one city to another along the map's roads (each city's
// streets and the highways between them). The route is worked out from the
// layout alone, so the page that starts a race and the API that saves its
// times build the same one: the cheapest path over the lot grid (a road lot
// costs 1, open land ROUTE.grass, the sea, buildings, lawns and squares
// can't be crossed), gates at its turns and along its straights, the
// finish on the destination's hub, and the grid behind the start line.
// Pure.

import { LOT } from "../league-city/grid";
import { UNIT_TO_M } from "../league-city/drive/tuning";
import { landGrid } from "./brasil-geo";
import { inDriftSite } from "./brasil-drift";
import type { BrasilLayout, CityLayout } from "./brasil-map";

export const ROUTE = {
  /** Open land costs this many road lots (a car does 25 m/s on road, 14 on grass, and the woods are out there). */
  grass: 4,
  /** A gate on every turn and at least every this many lots on a straight. */
  gateEvery: 8,
  /** No two gates closer than this (lots). */
  gateMin: 3,
  /** The start line sits this far along the route (m): the grid fits behind it. */
  startAt: 130,
  /** Grid rows (m apart), two cars a row, this far either side of the line (m). */
  rowGap: 7,
  lane: 2.8,
  /** A gate counts within this distance of its middle (m): a road lot is ~19 m across. */
  reach: 14,
  /** Average race speed on road (m/s), for the lengths below. */
  pace: 22,
} as const;

/** How long a race is: Curta, Média, Longa (seconds of driving at ROUTE.pace). */
export const LENGTHS = {
  short: [35, 75],
  medium: [75, 140],
  long: [140, 260],
} as const;
export type RaceLength = keyof typeof LENGTHS;

/** One car's place behind the start line: meters, heading clockwise from north (deg, like a Spawn). */
export interface GridSlot {
  x: number;
  z: number;
  rot: number;
}

export interface RaceRoute {
  from: string;
  to: string;
  /** `from-to:hash`: the route's board. A rerouted highway makes a new hash, and a fresh board. */
  key: string;
  hash: string;
  /** The gates in order (m); the last one is the finish. */
  gates: [number, number][];
  /** The whole path, lot centers (m), for the minimap's line. */
  line: [number, number][];
  /** From the start line to the finish (m). */
  length: number;
  /** Two abreast behind the line, the front row first. */
  grid: GridSlot[];
}

const LOT_M = LOT * UNIT_TO_M;
const k = (x: number, z: number) => `${x},${z}`;

/** Every lot a car drives on: the cities' streets and the highways. */
function roadLots(layout: BrasilLayout): Set<string> {
  const out = new Set(layout.highways.map(([x, z]) => k(x, z)));
  for (const c of [...layout.cities, layout.island]) for (const [x, z] of c.roads) out.add(k(x, z));
  return out;
}

/** Lots nobody drives through: buildings, lawns (trees), squares (fountains). */
function solidLots(layout: BrasilLayout): Set<string> {
  const out = new Set<string>();
  for (const c of [...layout.cities, layout.island]) {
    for (const d of c.devs) out.add(k(d.x, d.z));
    for (const [x, z] of c.lawns) out.add(k(x, z));
    out.add(k(c.center[0], c.center[1]));
  }
  return out;
}

interface Graph {
  x0: number;
  z0: number;
  w: number;
  d: number;
  /** Cost to enter each cell; 0 = can't. */
  cost: Uint8Array;
}

const graphs = new WeakMap<BrasilLayout, Graph>();

function graphOf(layout: BrasilLayout): Graph {
  const cached = graphs.get(layout);
  if (cached) return cached;
  const land = landGrid(layout.scale);
  const roads = roadLots(layout);
  const solid = solidLots(layout);
  const { x0, z0, w, d } = land;
  const cost = new Uint8Array(w * d);
  for (let j = 0; j < d; j++) {
    for (let i = 0; i < w; i++) {
      const x = x0 + i;
      const z = z0 + j;
      const key = k(x, z);
      if (roads.has(key)) cost[j * w + i] = 1;
      else if (land.cells[j * w + i] && !solid.has(key) && !inDriftSite(x, z)) cost[j * w + i] = ROUTE.grass;
    }
  }
  const g = { x0, z0, w, d, cost };
  graphs.set(layout, g);
  return g;
}

const DIRS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;

/** Cheapest cost from `from` to every cell, and the step that got there (Dijkstra on a binary heap). */
function search(g: Graph, from: [number, number]): { dist: Float64Array; prev: Int32Array } {
  const n = g.w * g.d;
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const start = (from[1] - g.z0) * g.w + (from[0] - g.x0);
  if (start < 0 || start >= n) return { dist, prev };
  dist[start] = 0;
  const heap: number[] = [start];
  const less = (a: number, b: number) => dist[heap[a]] < dist[heap[b]] || (dist[heap[a]] === dist[heap[b]] && heap[a] < heap[b]);
  const swap = (a: number, b: number) => {
    const t = heap[a];
    heap[a] = heap[b];
    heap[b] = t;
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      for (let i = 0; ; ) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && less(l, m)) m = l;
        if (r < heap.length && less(r, m)) m = r;
        if (m === i) break;
        swap(i, m);
        i = m;
      }
    }
    return top;
  };
  const push = (c: number) => {
    heap.push(c);
    for (let i = heap.length - 1; i > 0; ) {
      const p = (i - 1) >> 1;
      if (!less(i, p)) break;
      swap(i, p);
      i = p;
    }
  };
  const done = new Uint8Array(n);
  while (heap.length) {
    const c = pop();
    if (done[c]) continue;
    done[c] = 1;
    const ci = c % g.w;
    const cj = (c - ci) / g.w;
    for (const [dx, dz] of DIRS) {
      const i = ci + dx;
      const j = cj + dz;
      if (i < 0 || j < 0 || i >= g.w || j >= g.d) continue;
      const nb = j * g.w + i;
      const step = g.cost[nb];
      if (!step || done[nb]) continue;
      const nd = dist[c] + step;
      if (nd < dist[nb]) {
        dist[nb] = nd;
        prev[nb] = c;
        push(nb);
      }
    }
  }
  return { dist, prev };
}

const searches = new WeakMap<BrasilLayout, Map<string, ReturnType<typeof search>>>();

function searchFrom(layout: BrasilLayout, city: CityLayout) {
  let byCity = searches.get(layout);
  if (!byCity) searches.set(layout, (byCity = new Map()));
  let s = byCity.get(city.key);
  if (!s) byCity.set(city.key, (s = search(graphOf(layout), city.hub)));
  return s;
}

/** Every city a race can start from: the mainland ones (the island has no road off it). */
export function raceCities(layout: BrasilLayout): CityLayout[] {
  return layout.cities;
}

export function cityByKey(layout: BrasilLayout, key: string): CityLayout | null {
  return layout.cities.find((c) => c.key === key) ?? null;
}

/** The city a point (m) is in, or the nearest one's hub. */
export function nearestCity(layout: BrasilLayout, x: number, z: number): CityLayout | null {
  let best: CityLayout | null = null;
  let bd = Infinity;
  for (const c of layout.cities) {
    const d = Math.hypot(c.hub[0] * LOT_M - x, c.hub[1] * LOT_M - z);
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}

/** Seconds a route takes at race pace, for every other city reachable from `from` by road. */
export function reachable(layout: BrasilLayout, from: CityLayout): { city: CityLayout; secs: number }[] {
  const g = graphOf(layout);
  const { dist } = searchFrom(layout, from);
  const out: { city: CityLayout; secs: number }[] = [];
  for (const c of layout.cities) {
    if (c === from) continue;
    const i = c.hub[0] - g.x0;
    const j = c.hub[1] - g.z0;
    if (i < 0 || j < 0 || i >= g.w || j >= g.d) continue;
    const cost = dist[j * g.w + i];
    if (!Number.isFinite(cost)) continue;
    out.push({ city: c, secs: (cost * LOT_M) / ROUTE.pace });
  }
  return out.sort((a, b) => a.secs - b.secs || (a.city.key < b.city.key ? -1 : 1));
}

/**
 * A destination for a race of this length from `from`: a random one inside
 * the range, else the one closest to it; null when no city is reachable.
 */
export function pickDestination(layout: BrasilLayout, from: CityLayout, length: RaceLength, rand: () => number = Math.random): CityLayout | null {
  const all = reachable(layout, from);
  if (!all.length) return null;
  const [lo, hi] = LENGTHS[length];
  const inside = all.filter((r) => r.secs >= lo && r.secs <= hi);
  if (inside.length) return inside[Math.floor(rand() * inside.length)].city;
  const mid = (lo + hi) / 2;
  return [...all].sort((a, b) => Math.abs(a.secs - mid) - Math.abs(b.secs - mid))[0].city;
}

/** FNV-1a over the gates' lots, 8 hex digits. */
function hashOf(parts: readonly number[]): string {
  let h = 2166136261;
  for (const p of parts) {
    h = Math.imul(h ^ (p & 0xffff), 16777619);
    h = Math.imul(h ^ ((p >>> 16) & 0xffff), 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Point and heading (deg clockwise from north) `s` meters along a polyline. */
function along(line: readonly [number, number][], s: number): { x: number; z: number; rot: number } {
  let left = s;
  for (let i = 1; i < line.length; i++) {
    const [ax, az] = line[i - 1];
    const [bx, bz] = line[i];
    const seg = Math.hypot(bx - ax, bz - az);
    if (left <= seg || i === line.length - 1) {
      const t = seg > 0 ? Math.max(0, Math.min(1, left / seg)) : 0;
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, rot: (Math.atan2(bx - ax, -(bz - az)) * 180) / Math.PI };
    }
    left -= seg;
  }
  const [x, z] = line[0];
  return { x, z, rot: 0 };
}

/** The route between two cities, or null when no road joins them. */
export function raceRoute(layout: BrasilLayout, fromKey: string, toKey: string): RaceRoute | null {
  const from = cityByKey(layout, fromKey);
  const to = cityByKey(layout, toKey);
  if (!from || !to || from === to) return null;
  const g = graphOf(layout);
  const { prev, dist } = searchFrom(layout, from);
  const end = (to.hub[1] - g.z0) * g.w + (to.hub[0] - g.x0);
  if (end < 0 || end >= dist.length || !Number.isFinite(dist[end])) return null;

  const lots: [number, number][] = [];
  for (let c = end; c !== -1; c = prev[c]) {
    const i = c % g.w;
    lots.push([g.x0 + i, g.z0 + (c - i) / g.w]);
  }
  lots.reverse();
  const line = lots.map(([x, z]) => [x * LOT_M, z * LOT_M] as [number, number]);
  let total = 0;
  const at: number[] = [0];
  for (let i = 1; i < line.length; i++) at.push((total += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1])));
  // Too short to race (two cities side by side): no route.
  if (total < ROUTE.startAt + ROUTE.gateEvery * LOT_M) return null;

  // Gates: every turn and every gateEvery lots on a straight, past the start line, none too close together.
  const gates: [number, number][] = [];
  let lastS = ROUTE.startAt;
  let lastI = -Infinity;
  for (let i = 1; i < lots.length - 1; i++) {
    if (at[i] <= ROUTE.startAt + ROUTE.gateMin * LOT_M) continue;
    const [px, pz] = lots[i - 1];
    const [x, z] = lots[i];
    const [nx, nz] = lots[i + 1];
    const turn = x - px !== nx - x || z - pz !== nz - z;
    const due = i - lastI >= ROUTE.gateEvery && at[i] - lastS >= ROUTE.gateEvery * LOT_M;
    if (!(turn || due) || at[i] - lastS < ROUTE.gateMin * LOT_M || at[lots.length - 1] - at[i] < ROUTE.gateMin * LOT_M) continue;
    gates.push(line[i]);
    lastS = at[i];
    lastI = i;
  }
  gates.push(line[line.length - 1]);

  const grid: GridSlot[] = [];
  for (let row = 0; row < 15; row++) {
    const p = along(line, ROUTE.startAt - 8 - row * ROUTE.rowGap);
    const r = (p.rot * Math.PI) / 180;
    // Right of the heading: (cos, sin) turned a quarter clockwise from north.
    const rx = Math.cos(r);
    const rz = Math.sin(r);
    for (const side of [-1, 1]) grid.push({ x: p.x + rx * ROUTE.lane * side, z: p.z + rz * ROUTE.lane * side, rot: p.rot });
  }

  const hash = hashOf(gates.flatMap(([x, z]) => [Math.round(x / LOT_M), Math.round(z / LOT_M)]));
  return { from: from.key, to: to.key, key: `${from.key}-${to.key}:${hash}`, hash, gates, line, length: total - ROUTE.startAt, grid };
}

/** The start line (m): where the race clock's gates begin, on the route. */
export function startLine(route: RaceRoute): { x: number; z: number; rot: number } {
  return along(route.line, ROUTE.startAt);
}

/** The fastest a car could do the route (ms): no time under this is real. */
export function minRaceMs(lengthM: number): number {
  return Math.floor((lengthM / 40) * 1000);
}

/** "3550308-3509502:ab12cd34" → its two cities, or null. */
export function parseRouteKey(key: string): { from: string; to: string; hash: string } | null {
  const m = /^(\d{7})-(\d{7}):([0-9a-f]{8})$/.exec(key);
  return m ? { from: m[1], to: m[2], hash: m[3] } : null;
}

/** A race's ghost keeps at most this many frames (20 a second: 6 minutes). */
export const RACE_GHOST_FRAMES = 20 * 60 * 6;

/**
 * A record's ghost as sent by the client, or null when it isn't one: frames
 * in time order, on the map, ending near the finish time. Only ever drawn,
 * never timed, so this keeps out junk, not cheats.
 */
export function cleanRaceGhost(input: unknown, ms: number): { ms: number; splits: number[]; frames: number[] } | null {
  if (!input || typeof input !== "object") return null;
  const { frames, splits } = input as { frames?: unknown; splits?: unknown };
  if (!Array.isArray(frames) || !Array.isArray(splits)) return null;
  if (frames.length < 32 || frames.length % 4 !== 0 || frames.length > RACE_GHOST_FRAMES * 4) return null;
  if (splits.length > 130 || !splits.every((v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= ms)) return null;
  let last = -1;
  for (let i = 0; i < frames.length; i += 4) {
    const [t, x, z, yaw] = frames.slice(i, i + 4) as unknown[];
    if (![t, x, z, yaw].every((v) => typeof v === "number" && Number.isFinite(v))) return null;
    if ((t as number) < last || Math.abs(x as number) > 50_000 || Math.abs(z as number) > 50_000) return null;
    last = t as number;
  }
  if (last < ms - 1500 || last > ms + 1500) return null;
  return { ms, splits: splits as number[], frames: frames as number[] };
}
