import type { Connection, Room } from "./room";
import type { ServerMsg } from "../src/lib/league-city/drive/net";
import {
  PAINT,
  PAINT_ROOM,
  PaintGrid,
  capture,
  dayPoints,
  decodeRuns,
  dropTrail,
  enclosed,
  encodeRuns,
  newRun,
  stateAt,
  stateIndex,
  step,
  weightOf,
  type LostWhy,
  type PaintGeom,
  type PaintLoad,
  type PaintSave,
  type Run,
} from "../src/lib/towns/brasil-paint";
import { brasiliaDay, pointsWeek } from "../src/lib/towns/brasil-points";
import { sign } from "./smash";

// ─── The State War (drive room side) ────────────────────────
// The authority on the Brasil map's paint (lib/towns/brasil-paint). Loads the
// buildings and the map's scale from the site (/api/towns/brasil-town/paint),
// keeps the board in the room's storage, builds every signed-in driver's
// trail from their car's stream, fills the loops they close, and sends each
// change to everyone, spectators too. Points, the players' week and the
// states' shares go back to the site signed with FORCE_PUSH_HMAC_SECRET every
// SAVE_MS; a failed save is resent whole (points are unique per loop).

/** Saves to the site this often while there's something new (ms). */
const SAVE_MS = 30_000;
/** The board goes to the room's storage this often while it changes (ms). */
const STORE_MS = 10_000;
/** New buildings (and a bigger Brazil) are read again this often while anyone is here (ms). */
const HOMES_MS = 5 * 60_000;

interface Painter {
  login: string | null;
  devId: number | null;
  run: Run | null;
}

interface Stored {
  week: string;
  geom: PaintGeom;
  runs: number[];
}

export class PaintRoom {
  private grid: PaintGrid | null = null;
  private week = "";
  private loading: Promise<void> | null = null;
  private homes = new Map<string, { devId: number; s: number }>();
  private painters = new Map<string, Painter>();
  /** The Brasília day the counts below are for. */
  private day = "";
  private weight = new Map<string, number>();
  private awarded = new Map<string, number>();
  /** The week so far per login. */
  private players = new Map<string, { devId: number; taken: number; invaded: number; loops: number }>();
  private points: PaintSave["points"] = [];
  private invasions: PaintSave["invasions"] = [];
  private changed = false;
  private unsaved = false;
  private lastStore = 0;
  private lastSave = 0;
  private lastHomes = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  /** Land that paints on the current board (0: count it again). */
  private land = 0;

  constructor(private room: Room) {}

  /** Only the Brasil map paints. */
  get enabled(): boolean {
    return this.room.id === PAINT_ROOM;
  }

  private env(key: string): string | undefined {
    return (this.room.env as Record<string, unknown>)[key] as string | undefined;
  }

  private site(): string | null {
    const url = this.env("SITE_URL");
    return url ? url.replace(/\/+$/, "") : null;
  }

  /** Loads once; later calls wait for the same load (a failed one is tried again next time). */
  ensure(): Promise<void> {
    if (!this.enabled) return Promise.resolve();
    this.loading ??= this.load().catch((err) => {
      console.error("[paint] load", err);
      this.loading = null;
    });
    return this.loading;
  }

  private async fetchLoad(): Promise<PaintLoad> {
    const site = this.site();
    if (!site) throw new Error("no SITE_URL");
    const res = await fetch(`${site}/api/towns/${encodeURIComponent(this.room.id)}/paint`, { headers: { "cache-control": "no-cache" } });
    if (!res.ok) throw new Error(`paint load ${res.status}`);
    return (await res.json()) as PaintLoad;
  }

  private async load() {
    const load = await this.fetchLoad();
    const now = Date.now();
    this.week = pointsWeek(new Date(now));
    const grid = this.boardFor(load);
    const stored = await this.room.storage.get<Stored>("paint:board");
    if (stored && stored.week === this.week) {
      const old = new PaintGrid(stored.geom);
      decodeRuns(stored.runs, old.owner);
      grid.copyFrom(old);
      // Boards saved before buildings could be painted over held each building for its own state: that's no paint.
      for (let c = 0; c < grid.size; c++) if (grid.owner[c] && grid.owner[c] === grid.home[c]) grid.owner[c] = 0;
    }
    this.grid = grid;
    this.land = 0;
    this.day = brasiliaDay(new Date(now));
    for (const [login, pts] of Object.entries(load.today)) {
      this.awarded.set(login, pts);
      this.weight.set(login, pts * PAINT.cellsPerPoint);
    }
    for (const p of load.players) this.players.set(p.login, { devId: p.devId, taken: p.taken, invaded: p.invaded, loops: p.loops });
    this.lastHomes = now;
    this.room.broadcast(JSON.stringify(this.all()));
    this.run();
  }

  /** A fresh board at the load's scale with its buildings; who lives where. */
  private boardFor(load: PaintLoad): PaintGrid {
    const grid = PaintGrid.forScale(load.scale);
    grid.setHomes(load.homes);
    this.homes = new Map(load.homes.filter((h) => h.uf).map((h) => [h.login.toLowerCase(), { devId: h.devId, s: stateIndex(h.uf!) }]));
    return grid;
  }

  /** New buildings, or Brazil grew: the board follows, its paint kept. */
  private async refreshHomes() {
    try {
      const load = await this.fetchLoad();
      const old = this.grid;
      if (!old) return;
      const grid = this.boardFor(load);
      grid.copyFrom(old);
      this.grid = grid;
      this.land = 0;
      const grew = grid.geom.scale !== old.geom.scale;
      for (const [id, p] of this.painters) {
        // Trails were drawn on the old board's cells: a bigger Brazil starts them over.
        if (grew && p.run?.cells.length) this.lose(id, p, "gap");
        // Whoever just put their building in gets to paint.
        if (grew || (!p.run && p.login && this.homes.has(p.login))) this.equip(id, p);
      }
      this.changed = true;
      this.room.broadcast(JSON.stringify(this.all()));
    } catch (err) {
      console.error("[paint] homes", err);
    }
  }

  /** The board, the buildings' lots apart (what an unpainted lot shows), and every live trail. */
  all(): ServerMsg {
    const g = this.grid;
    if (!g) return { t: "paint_all", g: null, r: [], hm: [], land: 0, wk: this.week, tr: [] };
    const tr: [string, number, number[]][] = [];
    for (const [id, p] of this.painters) if (p.run?.cells.length) tr.push([id, p.run.s, p.run.cells]);
    this.land ||= g.landCount();
    return { t: "paint_all", g: g.geom, r: encodeRuns(g.owner), hm: encodeRuns(g.home), land: this.land, wk: this.week, tr };
  }

  async greet(conn: Connection) {
    await this.ensure();
    if (this.grid) conn.send(JSON.stringify(this.all()));
  }

  join(id: string) {
    if (this.enabled) this.painters.set(id, { login: null, devId: null, run: null });
  }

  leave(id: string) {
    const p = this.painters.get(id);
    if (p?.run?.cells.length) this.room.broadcast(JSON.stringify({ t: "paint_lost", id, why: "gap" } satisfies ServerMsg));
    this.painters.delete(id);
    if (this.unsaved && [...this.room.getConnections()].length <= 1) {
      this.lastSave = 0;
      void this.save();
    }
  }

  /** The drive room learned who a driver is (smash's auth): with a building in a state, they paint. */
  async authed(id: string, login: string, devId: number, conn: Connection) {
    const p = this.painters.get(id);
    if (!p) return;
    await this.ensure();
    p.login = login.toLowerCase();
    p.devId = devId;
    this.equip(id, p, conn);
    // Not on the board yet: maybe they just put their building in (read again, at most every half minute).
    if (!this.homes.has(p.login) && Date.now() - this.lastHomes > 30_000) {
      this.lastHomes = Date.now();
      void this.refreshHomes();
    }
  }

  /** Gives a driver their run (or none) and tells them. */
  private equip(id: string, p: Painter, conn = this.room.getConnection(id)) {
    if (!p.login) return;
    const home = this.homes.get(p.login);
    p.run = home ? newRun(home.s) : null;
    if (home) p.devId = home.devId;
    this.rollDay(Date.now());
    const uf = home ? stateAt(home.s) : null;
    conn?.send(JSON.stringify({ t: "paint_me", uf, pts: this.awarded.get(p.login) ?? 0, cap: PAINT.dayCap } satisfies ServerMsg));
  }

  private lose(id: string, p: Painter, why: LostWhy) {
    if (!p.run) return;
    dropTrail(p.run);
    this.room.broadcast(JSON.stringify({ t: "paint_lost", id, why } satisfies ServerMsg));
  }

  /** A car's new position (m), already checked by the drive room. */
  moved(id: string, x: number, z: number, now: number) {
    const g = this.grid;
    const p = this.painters.get(id);
    if (!g || !p?.run || !p.login) return;
    this.rollWeek(now);
    const { passed, events } = step(g, p.run, x, z, now);
    // Driving over someone's open trail cuts it (paper.io).
    if (passed.length) {
      for (const [other, q] of this.painters) {
        if (other === id || !q.run?.cells.length) continue;
        if (passed.some((c) => q.run!.set.has(c))) this.lose(other, q, "cut");
      }
    }
    for (const e of events) {
      if (e.k === "add") this.room.broadcast(JSON.stringify({ t: "paint_trail", id, s: p.run.s, a: e.cells } satisfies ServerMsg));
      else if (e.k === "lost") this.room.broadcast(JSON.stringify({ t: "paint_lost", id, why: e.why } satisfies ServerMsg));
      else this.close(id, p, e.trail, now);
    }
  }

  private close(id: string, p: Painter, trail: number[], now: number) {
    const g = this.grid;
    if (!g || !p.run || !p.login || !p.devId) return;
    const s = p.run.s;
    const got = capture(g, s, enclosed(g, s, trail));
    this.room.broadcast(JSON.stringify({ t: "paint_fill", s, c: got.changed, by: id } satisfies ServerMsg));
    if (got.changed.length === 0) return;
    this.changed = true;
    this.unsaved = true;
    this.rollDay(now);
    const before = this.awarded.get(p.login) ?? 0;
    const weight = (this.weight.get(p.login) ?? 0) + weightOf(got.taken, got.invaded);
    this.weight.set(p.login, weight);
    const after = Math.max(before, dayPoints(weight));
    const add = after - before;
    this.awarded.set(p.login, after);
    const ref = `${p.login}:${now}:${got.changed[0]}`;
    if (add > 0) this.points.push({ devId: p.devId, ref, points: add, at: now });
    const pl = this.players.get(p.login) ?? { devId: p.devId, taken: 0, invaded: 0, loops: 0 };
    pl.taken += got.taken;
    pl.invaded += got.invaded;
    pl.loops += 1;
    this.players.set(p.login, pl);
    const [lx, lz] = g.lotOf(got.changed[Math.floor(got.changed.length / 2)]);
    for (const [victim, lots] of got.from) this.invasions.push({ devId: p.devId, by: stateAt(s)!, victim, lots, x: lx, z: lz, at: now });
    this.room.getConnection(id)?.send(
      JSON.stringify({ t: "paint_got", n: got.taken, v: got.invaded, add, pts: after, cap: PAINT.dayCap } satisfies ServerMsg),
    );
  }

  /** A new Brasília day: the day's points start over. */
  private rollDay(now: number) {
    const day = brasiliaDay(new Date(now));
    if (day === this.day) return;
    this.day = day;
    this.weight.clear();
    this.awarded.clear();
  }

  /** A new week: the board starts over (buildings stay) and everyone gets it. */
  private rollWeek(now: number) {
    const week = pointsWeek(new Date(now));
    if (week === this.week || !this.grid) return;
    // The old week's last shares go first.
    if (this.unsaved) void this.save();
    this.week = week;
    this.grid.clear();
    this.players.clear();
    for (const [id, p] of this.painters) if (p.run?.cells.length) this.lose(id, p, "gap");
    this.changed = true;
    this.unsaved = true;
    this.room.broadcast(JSON.stringify(this.all()));
  }

  /** Once a second while anyone is here: the week, storage, saves, new buildings. */
  private run() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      const now = Date.now();
      this.rollWeek(now);
      if (this.changed && now - this.lastStore >= STORE_MS) {
        this.lastStore = now;
        this.changed = false;
        void this.store();
      }
      if (this.unsaved && now - this.lastSave >= SAVE_MS) {
        this.lastSave = now;
        void this.save();
      }
      if (now - this.lastHomes >= HOMES_MS) {
        this.lastHomes = now;
        void this.refreshHomes();
      }
      if ([...this.room.getConnections()].length === 0 && !this.unsaved && !this.changed) {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
      }
    }, 1000);
  }

  /** Someone connected: keep the clock going. */
  wake() {
    if (this.grid) this.run();
  }

  private async store() {
    const g = this.grid;
    if (!g) return;
    try {
      await this.room.storage.put("paint:board", { week: this.week, geom: g.geom, runs: encodeRuns(g.owner) } satisfies Stored);
    } catch (err) {
      console.error("[paint] store", err);
      this.changed = true;
    }
  }

  private async save() {
    const site = this.site();
    const secret = this.env("FORCE_PUSH_HMAC_SECRET");
    const g = this.grid;
    if (!site || !secret || !g) return;
    const points = this.points.splice(0);
    const invasions = this.invasions.splice(0);
    const save: PaintSave = {
      at: Date.now(),
      week: this.week,
      land: (this.land ||= g.landCount()),
      shares: Object.fromEntries(g.shares()),
      players: [...this.players.values()],
      points,
      invasions,
    };
    this.unsaved = false;
    const body = JSON.stringify(save);
    try {
      const res = await fetch(`${site}/api/towns/${encodeURIComponent(this.room.id)}/paint`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-paint-signature": await sign(secret, `${this.room.id}.${body}`) },
        body,
      });
      if (!res.ok) throw new Error(`paint save ${res.status}`);
    } catch (err) {
      console.error("[paint] save", err);
      this.points.unshift(...points);
      this.invasions.unshift(...invasions);
      this.unsaved = true;
    }
  }
}
