import type { Party, Connection, ConnectionContext } from "partykit/server";
import {
  MAX_DRIVERS,
  MAX_MESSAGE_BYTES,
  SEND_MS,
  WATCH_MS,
  BUMP_MIN_MS,
  decodeState,
  validBump,
  encodeState,
  validName,
  type ServerMsg,
  type BoxState,
} from "../src/lib/league-city/drive/net";
import {
  BOX_COUNT,
  BOX_RESPAWN_MS,
  TAKE_MIN_MS,
  USE_MIN_MS,
  isItem,
  randomItem,
  validUse,
  type BattleItem,
} from "../src/lib/league-city/drive/battle";
import {
  CROWN,
  dropCrown,
  grabCrown,
  idleCrown,
  leaveCrown,
  knockFrom,
  scatterFrom,
  startCrown,
  stealCrown,
  tickCrown,
} from "../src/lib/league-city/drive/crown";

// ─── League city driving ────────────────────────────────────
// One room per league city (room id = league slug). A relay: each driver says
// hello with a name, then streams its car state; the server validates,
// rate-limits and forwards it to everyone else. Names are display only (no
// rewards hang on them), like the fly party.
//
// Battle: the server owns the item box slots (generation, when each is back)
// and who holds which attack, so a box is taken once and an attack is used
// once. Where a box sits and what an attack does are worked out by clients.
//
// Crown Rush: the server runs the match (see crown.ts) and broadcasts its
// state on every change and once a second while it's live.
//
// Spectators connect with ?watch=1: people looking at the city without
// driving. They get the welcome, joins and leaves, and every car batched in
// one "cars" message each WATCH_MS instead of each car's 15 Hz stream, so a
// crowd watching costs a few messages a second, not drivers × watchers × 15.
// They never count toward MAX_DRIVERS and nothing they send is read.

interface Driver {
  name: string;
  /** Last valid state, re-encoded, for late joiners. */
  state: number[] | null;
  lastState: number;
  lastBump: number;
  held: BattleItem | null;
  lastTake: number;
  lastUse: number;
}

interface Box {
  gen: number;
  availableAt: number;
}

export default class DriveServer implements Party.Server {
  private drivers = new Map<string, Driver>();
  private boxes: Box[] = Array.from({ length: BOX_COUNT }, () => ({ gen: 0, availableAt: 0 }));
  private fxSeq = 0;
  private crown = idleCrown();
  private crownTimer: ReturnType<typeof setInterval> | null = null;
  private lastCrownSync = 0;
  private watchers = new Set<string>();
  private watchTimer: ReturnType<typeof setInterval> | null = null;

  /** Batches every car for the spectators while there are any. */
  private runWatchClock() {
    if (this.watchTimer) return;
    this.watchTimer = setInterval(() => {
      if (this.watchers.size === 0) {
        if (this.watchTimer) clearInterval(this.watchTimer);
        this.watchTimer = null;
        return;
      }
      const cars: [string, ...number[]][] = [];
      for (const [id, d] of this.drivers) if (d.state) cars.push([id, ...d.state]);
      if (cars.length === 0) return;
      const msg = JSON.stringify({ t: "cars", cars } satisfies ServerMsg);
      for (const id of this.watchers) this.room.getConnection(id)?.send(msg);
    }, WATCH_MS);
  }

  private sendCrown() {
    const now = Date.now();
    this.lastCrownSync = now;
    this.room.broadcast(JSON.stringify({ t: "crown", crown: this.crown, now } satisfies ServerMsg));
  }

  /** Tick while a match runs; stop when it's over. */
  private runCrownClock() {
    if (this.crownTimer) return;
    this.crownTimer = setInterval(() => {
      const now = Date.now();
      const changed = tickCrown(this.crown, now);
      if (changed || now - this.lastCrownSync >= 1000) this.sendCrown();
      if (this.crown.phase === "over" || this.crown.phase === "idle") {
        if (this.crownTimer) clearInterval(this.crownTimer);
        this.crownTimer = null;
      }
    }, 200);
  }

  /** Last known position (m) of a driver's car. */
  private where(id: string): [number, number] | null {
    const s = this.drivers.get(id)?.state;
    return s ? [s[0], s[2]] : null;
  }

  private boxStates(now: number): BoxState[] {
    return this.boxes.map((b) => ({ gen: b.gen, wait: Math.max(0, b.availableAt - now) }));
  }

  constructor(readonly room: Party.Room) {}

  onConnect(conn: Connection, ctx: ConnectionContext) {
    if (new URL(ctx.request.url).searchParams.get("watch") === "1") {
      this.watchers.add(conn.id);
      this.runWatchClock();
    }
    const msg: ServerMsg = {
      t: "welcome",
      you: conn.id,
      drivers: [...this.drivers.entries()].map(([id, d]) => ({ id, name: d.name, s: d.state })),
      boxes: this.boxStates(Date.now()),
      crown: this.crown,
      now: Date.now(),
    };
    conn.send(JSON.stringify(msg));
  }

  onMessage(message: string | ArrayBuffer | ArrayBufferView, sender: Connection) {
    if (this.watchers.has(sender.id)) return;
    if (typeof message !== "string" || message.length > MAX_MESSAGE_BYTES) return;
    let msg: unknown;
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }

    // Car state: ["s", ...11 numbers]
    if (Array.isArray(msg)) {
      const d = this.drivers.get(sender.id);
      if (!d || msg[0] !== "s") return;
      const now = Date.now();
      if (now - d.lastState < SEND_MS * 0.6) return; // faster than the client ever sends
      const s = decodeState(msg.slice(1));
      if (!s) return;
      d.lastState = now;
      d.state = encodeState(s);
      this.room.broadcast(JSON.stringify(["s", sender.id, ...d.state]), [sender.id, ...this.watchers]);
      return;
    }

    if (!msg || typeof msg !== "object") return;
    const { t, name, to, x, z, box, gen, item, dx, dz, id, target, victim, steal } = msg as Record<string, unknown>;

    // Crown Rush.
    if (t === "crown_start" || t === "crown_grab" || t === "crown_hit" || t === "crown_drop") {
      const d = this.drivers.get(sender.id);
      if (!d) return;
      const now = Date.now();
      let changed = false;
      if (t === "crown_start") {
        if (typeof x !== "number" || typeof z !== "number" || !Number.isFinite(x) || !Number.isFinite(z)) return;
        if (Math.abs(x) > 1000 || Math.abs(z) > 1000) return;
        changed = startCrown(this.crown, [...this.drivers.keys()], now, x, z);
        if (changed) this.runCrownClock();
      } else if (t === "crown_grab") {
        const at = this.where(sender.id);
        // Loosely near the crown by the last reported position.
        if (at && Math.hypot(at[0] - this.crown.x, at[1] - this.crown.z) < CROWN.reach * 3) changed = grabCrown(this.crown, sender.id, now);
      } else if (t === "crown_hit") {
        if (typeof victim !== "string" || victim !== this.crown.holder || victim === sender.id) return;
        const a = this.where(sender.id);
        const v = this.where(victim);
        if (!a || !v || Math.hypot(a[0] - v[0], a[1] - v[1]) > CROWN.hitRange) return;
        if (steal === true) changed = stealCrown(this.crown, sender.id, now);
        else {
          const [cx, cz] = knockFrom(a[0], a[1], v[0], v[1], now);
          changed = dropCrown(this.crown, now, cx, cz, v[0], v[1]);
        }
      } else if (t === "crown_drop") {
        if (this.crown.holder !== sender.id) return;
        const v = this.where(sender.id) ?? [this.crown.x, this.crown.z];
        const [cx, cz] = scatterFrom(v[0], v[1], now);
        changed = dropCrown(this.crown, now, cx, cz, v[0], v[1]);
      }
      if (changed) this.sendCrown();
      return;
    }

    // Battle: take a box, use what you hold, or report a ball that hit you.
    if (t === "take" || t === "use" || t === "hit") {
      const d = this.drivers.get(sender.id);
      if (!d) return;
      const now = Date.now();
      if (t === "take") {
        if (typeof box !== "number" || !Number.isInteger(box) || box < 0 || box >= BOX_COUNT) return;
        const b = this.boxes[box];
        if (gen !== b.gen || now < b.availableAt || now - d.lastTake < TAKE_MIN_MS || d.held) return;
        d.lastTake = now;
        b.gen += 1;
        b.availableAt = now + BOX_RESPAWN_MS;
        d.held = randomItem();
        sender.send(JSON.stringify({ t: "got", item: d.held } satisfies ServerMsg));
        this.room.broadcast(JSON.stringify({ t: "box", box, gen: b.gen, wait: BOX_RESPAWN_MS } satisfies ServerMsg));
        return;
      }
      if (t === "use") {
        const u = validUse(x, z, dx, dz);
        if (!u || !isItem(item) || d.held !== item || now - d.lastUse < USE_MIN_MS) return;
        d.lastUse = now;
        d.held = null;
        const aim = typeof target === "string" && target.length <= 64 && this.drivers.has(target) ? target : undefined;
        const fx: ServerMsg = { t: "fx", id: ++this.fxSeq, from: sender.id, item, ...u, ...(aim ? { target: aim } : {}) };
        this.room.broadcast(JSON.stringify(fx));
        return;
      }
      if (typeof id === "number" && Number.isInteger(id) && id > 0 && id <= this.fxSeq) {
        this.room.broadcast(JSON.stringify({ t: "gone", id } satisfies ServerMsg));
      }
      return;
    }

    // A bump: sender hit `to`; forward the velocity change to that driver only.
    if (t === "bump") {
      const d = this.drivers.get(sender.id);
      const now = Date.now();
      const v = validBump(x, z);
      if (!d || !v || typeof to !== "string" || to === sender.id || !this.drivers.has(to)) return;
      if (now - d.lastBump < BUMP_MIN_MS) return;
      d.lastBump = now;
      this.room.getConnection(to)?.send(JSON.stringify({ t: "bump", from: sender.id, x: v.x, z: v.z } satisfies ServerMsg));
      return;
    }

    if (t !== "hello" || !validName(name) || this.drivers.has(sender.id)) return;
    if (this.drivers.size >= MAX_DRIVERS) {
      sender.send(JSON.stringify({ t: "full" } satisfies ServerMsg));
      return;
    }
    this.drivers.set(sender.id, { name, state: null, lastState: 0, lastBump: 0, held: null, lastTake: 0, lastUse: 0 });
    this.room.broadcast(JSON.stringify({ t: "join", id: sender.id, name } satisfies ServerMsg), [sender.id]);
  }

  onClose(conn: Connection) {
    this.watchers.delete(conn.id);
    const at = this.where(conn.id) ?? [this.crown.x, this.crown.z];
    if (!this.drivers.delete(conn.id)) return;
    if (leaveCrown(this.crown, conn.id, Date.now(), at[0], at[1])) this.sendCrown();
    this.room.broadcast(JSON.stringify({ t: "leave", id: conn.id } satisfies ServerMsg));
  }
}

DriveServer satisfies Party.Worker;
