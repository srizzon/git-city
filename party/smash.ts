import type { Connection, Room } from "./room";
import type { ServerMsg } from "../src/lib/league-city/drive/net";
import { FLAG_BOOST } from "../src/lib/league-city/drive/net";
import { M_TO_UNIT } from "../src/lib/league-city/drive/tuning";
import { SMASH, SmashStore, cols, type DamageEntry, type SmashTarget } from "../src/lib/league-city/smash";
import {
  BLAST_BUILDINGS,
  BLAST_ROWS,
  BLAST_WINDOW_MS,
  CONTRIB_MS,
  FloorBudget,
  REBUILD_REACH,
  REBUILD_SPEED,
  SAVE_MS,
  blastReaches,
  carReaches,
  toFootprint,
  type SmashMsg,
} from "../src/lib/league-city/smash-net";
import { FloorParts, FloorTally, FloorsToday } from "../src/lib/league-city/smash-floors";
import { HeistRoom, type HeistDayInfo } from "./heist";

// ─── Smash (drive room side) ────────────────────────────────
// The authority on a town's floors. Loads the town's buildings and saved
// damage from the site (/api/towns/[slug]/smash; a room that isn't a town gets
// a 404 and stays off), learns who each driver is from their access token
// (/smash/me: anyone signed in with a building may smash, never their own),
// checks every hit (near enough, a real blast, a floor budget), grows floors
// back (time, contributions, the owner parked against it) and sends each
// change to everyone. Saves go back to the site signed with the shared
// FORCE_PUSH_HMAC_SECRET every SAVE_MS, and at once when a building falls.
// Floors knocked off buildings outside the driver's own town ride in the same
// signed save as one batch (smash-floors.ts), for Towns play points.

export interface SmashDriver {
  login: string | null;
  canSmash: boolean;
  /** A member of this town (from /smash/me): their floors here score nothing. */
  home: boolean;
  /** Device hash from the connection (seenHash), for the review flags. */
  seen: string | null;
  /** Its auth is being checked with the site. */
  authing: boolean;
  /** Last floor taken per building column by this car (cooldown). */
  lastCol: Map<string, number>;
}

interface Blast {
  from: string;
  at: number;
  x: number;
  z: number;
  buildings: Set<string>;
}

/** Blocks a minute per account on the Brasil map (towns: FLOORS_PER_MINUTE). */
const BRASIL_FLOORS_PER_MINUTE = 600;

/** A failed ask to the site (not a bad token) is tried again this many times, 2 s, 4 s, 6 s apart. */
const AUTH_RETRIES = 3;

type Where = (id: string) => { x: number; z: number; speed: number; flags: number } | null;

export class SmashRoom {
  private store: SmashStore | null = null;
  private loading: Promise<void> | null = null;
  /** The site said this room isn't a town: no smash here. */
  private missing = false;
  /** Owners' week contributions as last seen (the base for growing floors back). */
  private contrib = new Map<string, number>();
  private dirty = new Set<string>();
  private fallen: { victim: string; attacker: string; attackerId: number; at: number; day?: boolean }[] = [];
  /** Developer id per signed-in login (from /smash/me), for the saves. */
  private ids = new Map<string, number>();
  /** Floors per minute, per account: more tabs don't make a faster wrecking ball. */
  private budgets = new Map<string, FloorBudget>();
  private blasts = new Map<number, Blast>();
  /** Floors that score (outside the driver's own town), saved with the damage. */
  private tally = new FloorTally();
  /** Each driver's floors today, for the "+N" and the HUD counter. */
  private floorsToday = new FloorsToday();
  /** Blocks taken off each building that don't make a whole floor yet. */
  private parts = new FloorParts();
  /** Device hashes that arrived before the driver's hello. */
  private early = new Map<string, string>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastSave = 0;
  private lastContrib = 0;
  readonly drivers = new Map<string, SmashDriver>();
  /** The Brasil map's city of the day (party/heist.ts): idle elsewhere. */
  readonly heist: HeistRoom;
  /** Told whenever a driver's auth comes back with a developer (the State War paints with it). */
  onAuthed: ((id: string, login: string, devId: number, conn: Connection) => void) | null = null;

  constructor(
    private room: Room,
    private where: Where,
  ) {
    this.heist = new HeistRoom(room, where, (id) => {
      const login = this.drivers.get(id)?.login;
      return login ? { login, devId: this.ids.get(login) ?? null } : null;
    });
  }

  get enabled(): boolean {
    return !this.missing;
  }

  private env(key: string): string | undefined {
    return (this.room.env as Record<string, unknown>)[key] as string | undefined;
  }

  private site(): string | null {
    const url = this.env("SITE_URL");
    return url ? url.replace(/\/+$/, "") : null;
  }

  /** Loads the town once; later calls wait for the same load. */
  ensure(): Promise<void> {
    if (!this.enabled) return Promise.resolve();
    this.loading ??= this.load().catch((err) => {
      console.error("[smash] load", err);
      this.loading = null;
    });
    return this.loading;
  }

  private async load() {
    const site = this.site();
    if (!site) return;
    const res = await fetch(`${site}/api/towns/${encodeURIComponent(this.room.id)}/smash`, { headers: { "cache-control": "no-cache" } });
    if (res.status === 404) {
      this.missing = true;
      return;
    }
    if (!res.ok) throw new Error(`smash load ${res.status}`);
    const body = (await res.json()) as { targets: SmashTarget[]; damage: DamageEntry[]; heist?: HeistDayInfo | null };
    this.heist.setDay(body.heist ?? null);
    const store = new SmashStore(body.targets);
    store.load(body.damage, Date.now());
    store.takeChanged();
    // A building in rubble keeps its saved base: the contributions since grow it back once the rubble ends.
    for (const d of body.damage) {
      const i = store.index.get(d.login);
      this.contrib.set(d.login, i !== undefined && store.isRubble(i, Date.now()) ? d.contribBase : d.contribNow);
    }
    this.store = store;
    this.lastContrib = Date.now();
    this.room.broadcast(JSON.stringify(this.all()));
    this.run();
  }

  /** Every damaged building, for a newcomer. */
  all(): ServerMsg {
    return { t: "damage_all", list: (this.store?.snapshot() ?? []).map((d) => [d.login, d.rows, d.demolishedBy, d.shieldUntil]) };
  }

  /** Sends the damage to someone who just arrived (after the load, if it's still running). */
  async greet(conn: Connection) {
    await this.ensure();
    if (this.store) conn.send(JSON.stringify(this.all()));
  }

  join(id: string) {
    this.drivers.set(id, { login: null, canSmash: false, home: false, seen: this.early.get(id) ?? null, authing: false, lastCol: new Map() });
    this.early.delete(id);
  }

  leave(id: string) {
    this.early.delete(id);
    const login = this.drivers.get(id)?.login;
    this.drivers.delete(id);
    // The budget stays while the account has another car here (a reconnect can't reset it).
    if (login && ![...this.drivers.values()].some((d) => d.login === login)) {
      const b = this.budgets.get(login);
      if (b && b.idle(Date.now())) this.budgets.delete(login);
    }
  }

  /** Asks the site who the token belongs to and tells the driver whether they may smash. */
  async auth(id: string, token: string, conn: Connection, attempt = 0) {
    const d = this.drivers.get(id);
    const site = this.site();
    // Once per car: each auth costs the site a token check.
    if (!d || d.authing || d.login || !site || !this.enabled) return;
    d.authing = true;
    let retry = false;
    try {
      const res = await fetch(`${site}/api/towns/${encodeURIComponent(this.room.id)}/smash/me`, { headers: { authorization: `Bearer ${token}` } });
      // A bad token is final; anything else (the site busy, a deploy, the network) is tried again, a few times.
      if (!res.ok) {
        retry = res.status !== 401;
        return;
      }
      const me = (await res.json()) as { login: string; devId: number; canSmash: boolean; home: boolean; floorsToday?: number; heist?: unknown };
      d.login = me.login.toLowerCase();
      d.canSmash = me.canSmash === true && Number.isSafeInteger(me.devId) && me.devId > 0;
      d.home = me.home === true;
      if (d.canSmash) this.ids.set(d.login, me.devId);
      // The city of the day: the side the site has for them today (residents are cops).
      if (me.heist) this.heist.setSide(id, me.heist);
      this.floorsToday.seed(d.login, Number(me.floorsToday) || 0, Date.now());
      const floors = this.floorsToday.today(d.login, Date.now());
      conn.send(JSON.stringify({ t: "smash_me", can: d.canSmash, home: me.home === true, login: d.login, floors } satisfies ServerMsg));
      if (Number.isSafeInteger(me.devId) && me.devId > 0) this.onAuthed?.(id, d.login, me.devId, conn);
    } catch (err) {
      console.error("[smash] auth", err);
      retry = true;
    } finally {
      d.authing = false;
      if (retry && attempt < AUTH_RETRIES) setTimeout(() => void this.auth(id, token, conn, attempt + 1), 2000 * (attempt + 1));
    }
  }

  /** The drive room saw this car move faster than a car can drive (a review flag). */
  jumped(id: string, now: number) {
    const d = this.drivers.get(id);
    const dev = d?.login ? this.ids.get(d.login) : undefined;
    if (d?.login && dev !== undefined && !d.home) this.tally.jump(d.login, dev, now);
  }

  /** The connection's device hash; kept until hello if the driver isn't in yet. */
  see(id: string, hash: string) {
    const d = this.drivers.get(id);
    if (d) d.seen = hash;
    else this.early.set(id, hash);
  }

  /** A blast was fired (the battle's `use`): it may break floors for a few seconds. */
  fired(fx: number, from: string, x: number, z: number) {
    if (!this.enabled) return;
    const now = Date.now();
    this.blasts.set(fx, { from, at: now, x, z, buildings: new Set() });
    for (const [k, b] of this.blasts) if (now - b.at > BLAST_WINDOW_MS) this.blasts.delete(k);
  }

  /** A driver's hit: checked, applied and sent to everyone. */
  smash(id: string, m: SmashMsg) {
    const store = this.store;
    const d = this.drivers.get(id);
    if (!store || !d?.canSmash || !d.login) return;
    const target = store.index.get(m.b);
    if (target === undefined || m.b === d.login) return;
    const now = Date.now();
    let columns: number[];
    let n: number;
    if (m.k === "car") {
      const car = this.where(id);
      if (!car || Math.abs(car.speed) < SMASH.minSpeed * 0.6) return;
      columns = carReaches(store, target, m.c, car.x, car.z).filter((c) => {
        const key = `${m.b}:${c}`;
        if (now - (d.lastCol.get(key) ?? 0) < SMASH.cooldownMs * 0.7) return false;
        d.lastCol.set(key, now);
        return true;
      });
      n = car.flags & FLAG_BOOST ? SMASH.boostRows : SMASH.rows;
    } else {
      const blast = this.blasts.get(m.fx ?? -1);
      if (!blast || blast.from !== id || now - blast.at > BLAST_WINDOW_MS) return;
      if (!blast.buildings.has(m.b) && blast.buildings.size >= BLAST_BUILDINGS) return;
      blast.buildings.add(m.b);
      columns = blastReaches(store, target, m.c, blast.x, blast.z);
      n = BLAST_ROWS;
    }
    let budget = this.budgets.get(d.login);
    // The Brasil map scores no floors (its smash pays per push or fall, under day caps): a robber smashes freely.
    if (!budget) this.budgets.set(d.login, (budget = new FloorBudget(this.room.id === "brasil-town" ? BRASIL_FLOORS_PER_MINUTE : undefined)));
    const allowed = Math.floor(budget.take(columns.length * n, now) / n);
    columns = columns.slice(0, allowed);
    if (columns.length === 0) return;
    const { took, down } = store.hitColumns(target, columns, n, now, d.login);
    // The city of the day: a robber holds every block they knock off there until they push.
    this.heist.took(id, d.login, took, store.targets[target].x, store.targets[target].z);
    const attackerId = this.ids.get(d.login);
    // Play points: floors off a building outside your own town (shielded ones give took = 0).
    // took is blocks (one floor of one column); a floor scores once every column of it is down.
    const floors = took > 0 && !d.home && attackerId !== undefined ? this.parts.add(d.login, m.b, took, cols(store.targets[target])) : 0;
    if (floors > 0 && attackerId !== undefined) {
      this.tally.add(d.login, attackerId, m.b, floors, now);
      if (d.seen) this.tally.see(d.login, attackerId, d.seen, now);
      // Tell the driver what scored, for the "+N" over the building and the HUD counter.
      const { n: scored, today } = this.floorsToday.add(d.login, floors, now);
      this.room.getConnection(id)?.send(JSON.stringify({ t: "floors", b: m.b, n: scored, today } satisfies ServerMsg));
    }
    if (down && attackerId !== undefined) {
      const t = store.targets[target];
      // In the city of the day it pays only once its robber pushes.
      const day = this.heist.inCity(t.x, t.z);
      this.fallen.push({ victim: m.b, attacker: d.login, attackerId, at: now, ...(day ? { day: true } : {}) });
      this.lastSave = 0; // save (and email) now
    }
    this.flush();
  }

  /** Sends every changed building and marks it for the next save. */
  private flush() {
    const store = this.store;
    if (!store) return;
    for (const i of store.takeChanged()) {
      const login = store.targets[i].login;
      this.dirty.add(login);
      this.room.broadcast(
        JSON.stringify({ t: "damage", b: login, r: store.rowsOf(i), by: store.demolishedBy.get(i) ?? null, s: store.shieldUntil[i] } satisfies ServerMsg),
      );
    }
  }

  /** Once a second while anyone is here: regrowth, owner rebuilds, saves, contributions. */
  private run() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      const store = this.store;
      if (!store) return;
      const now = Date.now();
      store.frame(now, 1);
      for (const [id, d] of this.drivers) {
        if (!d.login) continue;
        const i = store.index.get(d.login);
        const car = this.where(id);
        if (i === undefined || !car || !store.isDamaged(i) || Math.abs(car.speed) > REBUILD_SPEED) continue;
        if (toFootprint(store, i, car.x * M_TO_UNIT, car.z * M_TO_UNIT) <= REBUILD_REACH) store.regrow(i, 1, now);
      }
      this.flush();
      if (now - this.lastContrib >= CONTRIB_MS) {
        this.lastContrib = now;
        void this.refreshContrib();
      }
      if (now - this.lastSave >= SAVE_MS && (this.dirty.size > 0 || this.fallen.length > 0 || this.tally.hasWork() || this.heist.hasWork())) {
        this.lastSave = now;
        void this.save();
      }
      if (this.room.getConnections && [...this.room.getConnections()].length === 0 && this.dirty.size === 0 && !this.tally.hasWork() && !this.heist.hasWork()) {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
      }
    }, 1000);
  }

  /** Called when someone connects: keeps the clock going. */
  wake() {
    if (this.store) this.run();
  }

  /** Owners' new contributions grow their floors back; the city of the day is checked again (it changes at midnight). */
  private async refreshContrib() {
    const site = this.site();
    const store = this.store;
    if (!site || !store) return;
    if (this.room.id === "brasil-town") void this.refreshHeist(site);
    try {
      const res = await fetch(`${site}/api/towns/${encodeURIComponent(this.room.id)}/smash?contrib=1`, { headers: { "cache-control": "no-cache" } });
      if (!res.ok) return;
      const { contrib } = (await res.json()) as { contrib: Record<string, number> };
      const now = Date.now();
      for (const [login, n] of Object.entries(contrib)) {
        const i = store.index.get(login);
        // In rubble: the base stays, so these contributions count once it ends.
        if (i !== undefined && store.isRubble(i, now)) continue;
        const prev = this.contrib.get(login);
        this.contrib.set(login, n);
        if (prev !== undefined && i !== undefined && n > prev) store.regrow(i, n - prev, now);
      }
      this.flush();
    } catch (err) {
      console.error("[smash] contrib", err);
    }
  }

  private async refreshHeist(site: string) {
    try {
      const res = await fetch(`${site}/api/towns/${encodeURIComponent(this.room.id)}/smash?heist=1`, { headers: { "cache-control": "no-cache" } });
      if (res.ok) this.heist.setDay(((await res.json()) as { heist?: HeistDayInfo | null }).heist ?? null);
    } catch (err) {
      console.error("[smash] heist", err);
    }
  }

  private async save() {
    const site = this.site();
    const secret = this.env("FORCE_PUSH_HMAC_SECRET");
    const store = this.store;
    if (!site || !secret || !store) return;
    const logins = [...this.dirty];
    const fallen = this.fallen.splice(0);
    this.dirty.clear();
    const rows = logins.flatMap((login) => {
      const i = store.index.get(login);
      if (i === undefined) return [];
      // -1: a building first hit this session; the site reads its owner's contributions as the base.
      return [
        {
          login,
          rows: store.rowsOf(i),
          regenFrom: store.regenFrom(i),
          contribBase: this.contrib.get(login) ?? -1,
          demolishedBy: store.demolishedBy.get(i) ?? null,
          demolishedById: this.ids.get(store.demolishedBy.get(i) ?? ""),
          shieldUntil: store.shieldUntil[i],
        },
      ];
    });
    // Floors go as one frozen batch, resent unchanged until the site answers 200.
    const pending = this.tally.take(() => crypto.randomUUID());
    const heist = this.heist.take();
    const body = JSON.stringify({
      at: Date.now(),
      rows,
      demolished: fallen,
      ...(pending ? { floors: pending.entries, floorsBatch: pending.batch } : {}),
      ...(heist.heist.length ? { heist: heist.heist } : {}),
      ...(heist.busts.length ? { busts: heist.busts } : {}),
      ...(heist.turrets.length ? { turrets: heist.turrets } : {}),
    });
    try {
      const res = await fetch(`${site}/api/towns/${encodeURIComponent(this.room.id)}/smash`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-smash-signature": await sign(secret, `${this.room.id}.${body}`) },
        body,
      });
      if (!res.ok) throw new Error(`smash save ${res.status}`);
      if (pending) this.tally.done(pending.batch);
    } catch (err) {
      console.error("[smash] save", err);
      for (const l of logins) this.dirty.add(l);
      this.fallen.unshift(...fallen);
      heist.undo();
    }
  }
}

export async function sign(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
  return [...sig].map((b) => b.toString(16).padStart(2, "0")).join("");
}
