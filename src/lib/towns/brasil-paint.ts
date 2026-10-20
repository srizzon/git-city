// ─── Brasil town: the State War ─────────────────────────────
// paper.io on the map of Brazil. The board is the land cut in cells, SUB × SUB
// to a lot (~5 m, about a car wide): every cell is held by a state or by
// nobody. Out of your state's land the car leaves a trail; back on it (or next
// to a building of your state), or across the trail itself (closing the
// circle, the way people draw one), the trail and everything it closes in
// become your state's. Someone driving over it, a trail longer than
// PAINT.trailMax, a jump or a gap in the car's stream lose it (nothing
// paints) and a new one starts where the car is. A building's lot shows its
// state's color until someone paints over it, and beside it its state is
// always home: anyone can always close a loop at their own building. Weeks
// run like the points' (Monday 00:00 UTC) and the board starts over each week.
//
// The drive room (party/paint.ts) is the only one that paints: it builds the
// trails from the cars' stream, never from what a client says it painted.
// The map draws the board it sends (PaintBoard). Pure.

import { LOT } from "../league-city/grid";
import { M_TO_UNIT } from "../league-city/drive/tuning";
import { inDriftSite } from "./brasil-drift";
import { landGrid } from "./brasil-geo";
import { UFS, stateOf, type UF } from "./brasil-map";

/** Cells to a lot's side. */
export const SUB = 4;
/** A cell's side, in city units (4.8 m). */
export const CELL = LOT / SUB;
/** A cell's area, m². */
export const CELL_M2 = (CELL / M_TO_UNIT) ** 2;

export const PAINT = {
  /** A trail longer than this (cells, ~2 min driving) is lost: a loop holds ~22k cells (~0.5 km²) at most. */
  trailMax: 600,
  /** No car state for this long (ms) loses the trail. */
  gapMs: 3_000,
  /** Fastest a car moves between two states (m/s): boost's top speed with room for lag. */
  speedMax: 35 * 1.5,
  /** Plus this much (m) for the stream's jitter. */
  slackM: 8,
  /** Cells taken per point (an invaded cell counts twice): 20 lots' worth. */
  cellsPerPoint: 20 * SUB * SUB,
  /** Most points painting gives in a Brasília day. */
  dayCap: 20,
} as const;

export type LostWhy = "cut" | "long" | "jump" | "gap";

/** The one drive room that paints (the Brasil town's). */
export const PAINT_ROOM = "brasil-town";

/** What the drive room loads from the site (GET /api/towns/brasil-town/paint). */
export interface PaintLoad {
  scale: number;
  homes: (PaintHome & { login: string; devId: number })[];
  /** Painting points each login got today (Brasília day), lowercase. */
  today: Record<string, number>;
  /** This week so far, per login. */
  players: { login: string; devId: number; taken: number; invaded: number; loops: number }[];
}

/** What the drive room saves (POST, signed): the whole week's numbers, plus the new points and invasions. */
export interface PaintSave {
  at: number;
  /** The points week (its Monday). */
  week: string;
  /** Land that paints, for the percentages. */
  land: number;
  shares: Partial<Record<UF, number>>;
  players: { devId: number; taken: number; invaded: number; loops: number }[];
  /** One row per loop that scored (ref unique: a resent save never scores twice). */
  points: { devId: number; ref: string; points: number; at: number }[];
  /** A loop over another state's land: `lots` cells of `victim`'s around lot (x, z). */
  invasions: { devId: number; by: UF; victim: UF; lots: number; x: number; z: number; at: number }[];
}

/** A state's number on the board (1…27); 0 is nobody. */
export const stateIndex = (uf: UF): number => UFS.indexOf(uf) + 1;
export const stateAt = (s: number): UF | null => UFS[s - 1] ?? null;

/** Where the board sits, in cells: cell (cx, cz) covers city units [cx·CELL − LOT/2, (cx+1)·CELL − LOT/2) (a lot's SUB cells share its span). */
export interface PaintGeom {
  scale: number;
  x0: number;
  z0: number;
  w: number;
  d: number;
}

/** A building's lot and its owner's state (null: the island, which never paints). */
export interface PaintHome {
  x: number;
  z: number;
  uf: UF | null;
}

/** The board: who holds each cell. */
export class PaintGrid {
  /** 0 nobody, else stateIndex. */
  readonly owner: Uint8Array;
  /** 1: land that paints (clear of the coast, off the drift track). */
  readonly open: Uint8Array;
  /** A building's lot's cells: its state's for good (stateIndex), else 0. */
  readonly home: Uint8Array;

  constructor(readonly geom: PaintGeom) {
    const n = geom.w * geom.d;
    this.owner = new Uint8Array(n);
    this.open = new Uint8Array(n);
    this.home = new Uint8Array(n);
  }

  static forScale(scale: number): PaintGrid {
    const land = landGrid(scale);
    const g = new PaintGrid({ scale, x0: land.x0 * SUB, z0: land.z0 * SUB, w: land.w * SUB, d: land.d * SUB });
    for (let j = 0; j < land.d; j++) {
      for (let i = 0; i < land.w; i++) {
        if (land.cells[j * land.w + i] === 1 && !inDriftSite(land.x0 + i, land.z0 + j)) for (const c of g.lotCells(land.x0 + i, land.z0 + j)) g.open[c] = 1;
      }
    }
    return g;
  }

  get size(): number {
    return this.owner.length;
  }

  /** Cell (cx, cz)'s index, or -1 off the board. */
  index(cx: number, cz: number): number {
    const i = cx - this.geom.x0;
    const j = cz - this.geom.z0;
    return i >= 0 && j >= 0 && i < this.geom.w && j < this.geom.d ? j * this.geom.w + i : -1;
  }

  /** An index's cell (cx, cz). */
  xyOf(c: number): [number, number] {
    return [this.geom.x0 + (c % this.geom.w), this.geom.z0 + Math.floor(c / this.geom.w)];
  }

  /** The lot a cell is in. */
  lotOf(c: number): [number, number] {
    const [cx, cz] = this.xyOf(c);
    return [Math.floor(cx / SUB), Math.floor(cz / SUB)];
  }

  /** A lot's cells on the board. */
  lotCells(lx: number, lz: number): number[] {
    const out: number[] = [];
    for (let j = 0; j < SUB; j++) {
      for (let i = 0; i < SUB; i++) {
        const c = this.index(lx * SUB + i, lz * SUB + j);
        if (c >= 0) out.push(c);
      }
    }
    return out;
  }

  /** The cell under a car (meters), or -1. */
  cellAt(xm: number, zm: number): number {
    return this.index(Math.floor((xm * M_TO_UNIT + LOT / 2) / CELL), Math.floor((zm * M_TO_UNIT + LOT / 2) / CELL));
  }

  /** Marks the buildings' lots (each shows its state until painted over); the old marks go. */
  setHomes(homes: readonly PaintHome[]) {
    this.home.fill(0);
    for (const h of homes) {
      if (!h.uf) continue;
      for (const c of this.lotCells(h.x, h.z)) this.home[c] = stateIndex(h.uf);
    }
  }

  /** Who a cell shows as held: its painter, else its building's state, else 0. */
  heldAt(c: number): number {
    return this.owner[c] || this.home[c];
  }

  /** A new week: nobody has painted anything. */
  clear() {
    this.owner.fill(0);
  }

  /** Cells each state painted (an unpainted building counts for nobody: a big state doesn't start ahead). */
  shares(): Map<UF, number> {
    const out = new Map<UF, number>();
    for (let c = 0; c < this.size; c++) {
      const s = this.owner[c];
      if (!s) continue;
      const uf = stateAt(s);
      if (uf) out.set(uf, (out.get(uf) ?? 0) + 1);
    }
    return out;
  }

  /** Land that paints, for the shares' percentages. */
  landCount(): number {
    let n = 0;
    for (let c = 0; c < this.size; c++) n += this.open[c];
    return n;
  }

  /** Takes over another board's paint (Brazil grew: each cell reads the old cell at its real place). */
  copyFrom(old: PaintGrid) {
    const k = old.geom.scale / this.geom.scale;
    // A cell's middle in city units, scaled back to the old map, and the old cell there.
    const back = (v: number) => Math.floor((((v + 0.5) * CELL - LOT / 2) * k + LOT / 2) / CELL);
    for (let c = 0; c < this.size; c++) {
      if (!this.open[c]) continue;
      const [cx, cz] = this.xyOf(c);
      const o = old.index(back(cx), back(cz));
      const s = o >= 0 ? old.owner[o] : 0;
      if (s) this.owner[c] = s;
    }
  }
}

/** Run-length code of a board's owners: [value, count, value, count, …]. */
export function encodeRuns(a: Uint8Array): number[] {
  const out: number[] = [];
  let i = 0;
  while (i < a.length) {
    const v = a[i];
    let j = i + 1;
    while (j < a.length && a[j] === v) j++;
    out.push(v, j - i);
    i = j;
  }
  return out;
}

/** Reads encodeRuns back into `into` (anything malformed stops it; the rest stays 0). */
export function decodeRuns(runs: readonly number[], into: Uint8Array): Uint8Array {
  let i = 0;
  for (let r = 0; r + 1 < runs.length; r += 2) {
    const v = runs[r];
    const n = runs[r + 1];
    if (!Number.isInteger(v) || v < 0 || v > UFS.length || !Number.isInteger(n) || n <= 0 || i + n > into.length) break;
    into.fill(v, i, i + n);
    i += n;
  }
  return into;
}

/** The cells from a to b, b included, a not: side by side, never corner to corner (so a trail has no gap a fill leaks through). */
export function lineCells(g: PaintGrid, a: number, b: number): number[] {
  const [ax, az] = g.xyOf(a);
  const [bx, bz] = g.xyOf(b);
  const dx = Math.abs(bx - ax);
  const dz = Math.abs(bz - az);
  const sx = Math.sign(bx - ax);
  const sz = Math.sign(bz - az);
  const out: number[] = [];
  let x = ax;
  let z = az;
  for (let ix = 0, iz = 0; ix < dx || iz < dz; ) {
    if (iz >= dz || (ix < dx && (0.5 + ix) / dx < (0.5 + iz) / dz)) {
      x += sx;
      ix++;
    } else {
      z += sz;
      iz++;
    }
    const c = g.index(x, z);
    if (c >= 0) out.push(c);
  }
  return out;
}

/** One car's trail. */
export interface Run {
  /** The driver's state (stateIndex). */
  s: number;
  cells: number[];
  set: Set<number>;
  /** The cell the car is on (-1 off the board), its last position (m) and when (ms; 0: none yet). */
  cell: number;
  x: number;
  z: number;
  at: number;
}

export const newRun = (s: number): Run => ({ s, cells: [], set: new Set(), cell: -1, x: 0, z: 0, at: 0 });

export type PaintEvent = { k: "add"; cells: number[] } | { k: "lost"; why: LostWhy } | { k: "close"; trail: number[] };

/** Whether the car is home: on its state's land, or right next to one of its state's buildings (painted over or not). */
export function atHome(g: PaintGrid, s: number, c: number): boolean {
  if (g.heldAt(c) === s) return true;
  const w = g.geom.w;
  const x = c % w;
  return (x > 0 && g.home[c - 1] === s) || (x < w - 1 && g.home[c + 1] === s) || (c >= w && g.home[c - w] === s) || (c + w < g.size && g.home[c + w] === s);
}

/** Drops a run's trail (the car keeps going: a new one starts from where it is). */
export function dropTrail(run: Run) {
  run.cells = [];
  run.set.clear();
}

/**
 * A car's new position (m) at `now` (ms): the cells it went through
 * (`passed`, for cutting other trails) and what happened to its trail, in
 * order: cells added, the trail lost, a trail closed (the room fills it).
 */
export function step(g: PaintGrid, run: Run, xm: number, zm: number, now: number): { passed: number[]; events: PaintEvent[] } {
  const events: PaintEvent[] = [];
  const passed: number[] = [];
  const lose = (why: LostWhy) => {
    if (run.cells.length) events.push({ k: "lost", why });
    dropTrail(run);
  };
  const c = g.cellAt(xm, zm);
  if (run.at > 0) {
    const dt = now - run.at;
    if (dt > PAINT.gapMs) lose("gap");
    else if (Math.hypot(xm - run.x, zm - run.z) > (PAINT.speedMax * Math.max(dt, 0)) / 1000 + PAINT.slackM) lose("jump");
    else {
      const path = c < 0 ? [] : run.cell < 0 ? [c] : c === run.cell ? [] : lineCells(g, run.cell, c);
      let added: number[] = [];
      const flush = () => {
        if (added.length) events.push({ k: "add", cells: added });
        added = [];
      };
      for (const p of path) {
        passed.push(p);
        if (!g.open[p]) continue;
        if (atHome(g, run.s, p)) {
          flush();
          if (run.cells.length) events.push({ k: "close", trail: run.cells });
          run.cells = [];
          run.set = new Set();
          continue;
        }
        // Across your own trail: the circle is closed.
        if (run.set.has(p)) {
          flush();
          events.push({ k: "close", trail: run.cells });
          run.cells = [];
          run.set = new Set();
          continue;
        }
        run.cells.push(p);
        run.set.add(p);
        added.push(p);
        if (run.cells.length > PAINT.trailMax) {
          added = [];
          lose("long");
        }
      }
      flush();
    }
  }
  run.cell = c;
  run.x = xm;
  run.z = zm;
  run.at = now;
  return { passed, events };
}

/** What a closed trail paints: the trail and every cell it closes in with the state's land (not the sea). */
export function enclosed(g: PaintGrid, s: number, trail: readonly number[]): number[] {
  if (trail.length === 0) return [];
  const { w, d } = g.geom;
  let minI = w;
  let maxI = -1;
  let minJ = d;
  let maxJ = -1;
  for (const c of trail) {
    const i = c % w;
    const j = Math.floor(c / w);
    minI = Math.min(minI, i);
    maxI = Math.max(maxI, i);
    minJ = Math.min(minJ, j);
    maxJ = Math.max(maxJ, j);
  }
  // One cell of room round the trail: whatever the outside reaches from there isn't closed in.
  minI = Math.max(0, minI - 1);
  minJ = Math.max(0, minJ - 1);
  maxI = Math.min(w - 1, maxI + 1);
  maxJ = Math.min(d - 1, maxJ + 1);
  const bw = maxI - minI + 1;
  const bd = maxJ - minJ + 1;
  const mine = new Set(trail);
  // Home closes a trail (atHome), so home walls a loop in: the state's land and the cells beside its buildings.
  const wall = (c: number) => mine.has(c) || atHome(g, s, c);
  const seen = new Uint8Array(bw * bd);
  const stack: number[] = [];
  const visit = (i: number, j: number) => {
    const k = (j - minJ) * bw + (i - minI);
    if (seen[k]) return;
    seen[k] = 1;
    if (!wall(j * w + i)) stack.push(i, j);
  };
  for (let i = minI; i <= maxI; i++) {
    visit(i, minJ);
    visit(i, maxJ);
  }
  for (let j = minJ; j <= maxJ; j++) {
    visit(minI, j);
    visit(maxI, j);
  }
  while (stack.length) {
    const j = stack.pop() as number;
    const i = stack.pop() as number;
    if (i > minI) visit(i - 1, j);
    if (i < maxI) visit(i + 1, j);
    if (j > minJ) visit(i, j - 1);
    if (j < maxJ) visit(i, j + 1);
  }
  const out = [...trail];
  for (let j = minJ; j <= maxJ; j++) {
    for (let i = minI; i <= maxI; i++) {
      const c = j * w + i;
      if (!seen[(j - minJ) * bw + (i - minI)] && !mine.has(c) && g.open[c] && g.heldAt(c) !== s) out.push(c);
    }
  }
  return out;
}

/** Paints `cells` for state `s`: the cells that changed hands, how many were nobody's and how many another state's. */
export function capture(g: PaintGrid, s: number, cells: readonly number[]): { changed: number[]; taken: number; invaded: number; from: Map<UF, number> } {
  const changed: number[] = [];
  const from = new Map<UF, number>();
  let taken = 0;
  let invaded = 0;
  for (const c of cells) {
    const was = g.heldAt(c);
    if (was === s || !g.open[c]) continue;
    if (was) {
      invaded++;
      const uf = stateAt(was);
      if (uf) from.set(uf, (from.get(uf) ?? 0) + 1);
    } else taken++;
    g.owner[c] = s;
    changed.push(c);
  }
  return { changed, taken, invaded, from };
}

/** A loop's weight toward points: an invaded cell counts twice. */
export const weightOf = (taken: number, invaded: number) => taken + 2 * invaded;

/** A day's painting points from its weight, capped. */
export const dayPoints = (weight: number) => Math.min(PAINT.dayCap, Math.floor(Math.max(0, weight) / PAINT.cellsPerPoint));

const HOUR = 3_600_000;

/**
 * A week's war from its hourly saves: each state's share of the land at the
 * end of every hour from the week's start to `now` (or the week's end),
 * averaged (Ingress' checkpoints: holding counts, a last-minute grab
 * barely). An hour with no save is the last one before it (nobody painted,
 * nothing changed). Most first.
 */
export function weekStandings(week: string, hours: readonly { at: number; land: number; shares: Partial<Record<UF, number>> }[], now: number): { uf: UF; share: number }[] {
  const start = Date.parse(`${week}T00:00:00Z`);
  const n = Math.floor((Math.min(now, start + 7 * 24 * HOUR) - start) / HOUR);
  if (!(n > 0)) return [];
  const sorted = [...hours].sort((a, b) => a.at - b.at);
  const sum = new Map<UF, number>();
  let k = 0;
  let cur: (typeof hours)[number] | null = null;
  for (let h = 1; h <= n; h++) {
    while (k < sorted.length && sorted[k].at < start + h * HOUR) cur = sorted[k++];
    if (!cur || cur.land <= 0) continue;
    for (const [uf, lots] of Object.entries(cur.shares) as [UF, number][]) sum.set(uf, (sum.get(uf) ?? 0) + lots / cur.land);
  }
  return [...sum]
    .map(([uf, v]) => ({ uf, share: v / n }))
    .filter((x) => x.share > 0)
    .sort((a, b) => b.share - a.share);
}

// ─── The map's side ─────────────────────────────────────────

/** Lime: your state, everywhere (the site's accent). */
export const PAINT_MINE = "#c8e64a";
/** Every other state while you drive: one rival color. */
export const PAINT_RIVAL = "#e5484d";

const NEUTRAL = new Set(["#ffffff", "#111111"]);
/** A state's color on the map: its flag's first color that isn't white or black. */
export function stateColor(uf: UF): string {
  return stateOf(uf).colors.find((c) => !NEUTRAL.has(c.toLowerCase())) ?? "#9aa0a6";
}

/** The board as the map holds it: what the room sent, kept up to date, with everyone's live trails. */
export class PaintBoard {
  geom: PaintGeom | null = null;
  owner: Uint8Array = new Uint8Array(0);
  /** The buildings' lots: their state's for good (drawn, never counted). */
  home: Uint8Array = new Uint8Array(0);
  week = "";
  /** Land that paints, for the percentages. */
  land = 0;
  /** Live trails by driver id, with their state. */
  readonly trails = new Map<string, { s: number; cells: number[]; set: Set<number> }>();
  /** Bumped on every change. */
  version = 0;
  /** Cells changed since the layer last drew (null: everything). */
  private dirty: Set<number> | null = null;
  private ranked: { v: number; list: { uf: UF; cells: number }[] } = { v: -1, list: [] };

  all(geom: PaintGeom, runs: readonly number[], land: number, week: string, trails: readonly [string, number, number[]][], home: readonly number[] = []) {
    this.geom = geom;
    this.land = land;
    this.owner = decodeRuns(runs, new Uint8Array(geom.w * geom.d));
    this.home = decodeRuns(home, new Uint8Array(geom.w * geom.d));
    this.week = week;
    this.trails.clear();
    for (const [id, s, cells] of trails) this.trails.set(id, { s, cells: [...cells], set: new Set(cells) });
    this.dirty = null;
    this.version++;
  }

  private touch(cells: Iterable<number>) {
    if (this.dirty) for (const c of cells) this.dirty.add(c);
    this.version++;
  }

  fill(s: number, cells: readonly number[], by: string | null) {
    for (const c of cells) if (c >= 0 && c < this.owner.length) this.owner[c] = s;
    this.touch(cells);
    if (by) this.lost(by);
  }

  trail(id: string, s: number, add: readonly number[]) {
    let t = this.trails.get(id);
    if (!t || t.s !== s) this.trails.set(id, (t = { s, cells: [], set: new Set() }));
    for (const c of add) {
      t.cells.push(c);
      t.set.add(c);
    }
    this.touch(add);
  }

  lost(id: string) {
    const t = this.trails.get(id);
    if (!t) return;
    this.trails.delete(id);
    this.touch(t.cells);
  }

  /** Who a cell shows as held: its painter, else its building's state, else 0. */
  heldAt(c: number): number {
    return this.owner[c] || this.home[c] || 0;
  }

  /** The state whose live trail covers a cell, else 0. */
  trailAt(c: number): number {
    for (const t of this.trails.values()) if (t.set.has(c)) return t.s;
    return 0;
  }

  /** What changed since the last call (null: draw it all), and starts counting again. */
  takeDirty(): Set<number> | null {
    const d = this.dirty;
    this.dirty = new Set();
    return d;
  }

  /** Cells per state, most first (the War table); counted again only when the board changed. */
  shares(): { uf: UF; cells: number }[] {
    if (this.ranked.v === this.version) return this.ranked.list;
    const n = new Map<number, number>();
    for (const s of this.owner) if (s) n.set(s, (n.get(s) ?? 0) + 1);
    const list = [...n]
      .map(([s, cells]) => ({ uf: stateAt(s) as UF, cells }))
      .filter((x) => x.uf)
      .sort((a, b) => b.cells - a.cells);
    this.ranked = { v: this.version, list };
    return list;
  }
}
