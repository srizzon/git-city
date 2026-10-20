import type { DurableObjectState } from "@cloudflare/workers-types";
import { PartyRoom, type Connection, type ConnectionContext, type Env } from "./room";
import {
  MAX_AUTH_BYTES,
  MAX_DRIVERS,
  MAX_ROUTE_BYTES,
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
  COORD_MAX,
} from "../src/lib/league-city/drive/net";
import {
  boxCountFor,
  BOX_RESPAWN_MS,
  TAKE_MIN_MS,
  USE_MIN_MS,
  BOX_REACH,
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
import { EMOTE_MIN_MS, validEmote } from "../src/lib/league-city/drive/emotes";
import {
  RALLY_RECEIPT_TTL_MS,
  idleRally,
  joinRally,
  leaveRally,
  rallyBoxSpots,
  rallyBusy,
  rallyItem,
  rallyStandings,
  startRally,
  takeRallyBox,
  stepRally,
  tickRally,
  validRoute,
  type RallyTrack,
} from "../src/lib/league-city/drive/rally";
import { raceId, signRallyReceipt } from "./rallyToken";
import { parseSmash } from "../src/lib/league-city/smash-net";
import { JumpWatch, seenHash } from "../src/lib/league-city/smash-floors";
import { SmashRoom } from "./smash";
import { LIVE_SECRET_HEADER, createReporter, type TownLive } from "../src/lib/towns/live";

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
// City races (see rally.ts): someone sends a route, the room invites
// everyone, times each racer on its own clock from their states, and signs
// a receipt for each timed finish by a GitHub login (the site saves it only
// for the signed-in viewer). Never at the same time as a Crown Rush.
//
// Smash (party/smash.ts): in every town the room is also the authority on the
// buildings' floors; spectators get those changes too.
//
// Spectators connect with ?watch=1: people looking at the city without
// driving. They get the welcome, joins and leaves, and every car batched in
// one "cars" message each WATCH_MS instead of each car's 15 Hz stream, so a
// crowd watching costs a few messages a second, not drivers × watchers × 15.
// They never count toward MAX_DRIVERS and nothing they send is read.
//
// Live count: how many drive and watch here goes to the town tally
// (party/townlive) on every change, batched, for the /towns cards.

interface Driver {
  name: string;
  /** Last valid state, re-encoded, for late joiners. */
  state: number[] | null;
  lastState: number;
  lastBump: number;
  held: BattleItem | null;
  lastTake: number;
  lastUse: number;
  lastEmote: number;
  /** Speed over the last second, for the jump flag. */
  jumps: JumpWatch;
}

interface Box {
  gen: number;
  availableAt: number;
}

export class DriveServer extends PartyRoom {
  private drivers = new Map<string, Driver>();
  /** One per box slot; how many depends on the room (boxCountFor), set in the constructor. */
  private boxes: Box[] = [];
  private fxSeq = 0;
  private crown = idleCrown();
  private crownTimer: ReturnType<typeof setInterval> | null = null;
  private lastCrownSync = 0;
  private rally = idleRally();
  private rallyTimer: ReturnType<typeof setInterval> | null = null;
  private lastRallySync = 0;
  /** Each racer's last state (m, server ms), for the race's speed check. */
  private rallyTracks = new Map<string, RallyTrack>();
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

  private sendRally() {
    const now = Date.now();
    this.lastRallySync = now;
    this.room.broadcast(JSON.stringify({ t: "rally", rally: this.rally, now } satisfies ServerMsg));
  }

  /** Tick while a race is on; stop once it's back to idle. */
  private runRallyClock() {
    if (this.rallyTimer) return;
    this.rallyTimer = setInterval(() => {
      const now = Date.now();
      const was = this.rally.phase;
      const changed = tickRally(this.rally, now);
      if (was !== "live" && this.rally.phase === "live") this.rallyTracks.clear();
      if (changed || (this.rally.phase !== "idle" && now - this.lastRallySync >= 1000)) this.sendRally();
      if (this.rally.phase === "idle") {
        if (this.rallyTimer) clearInterval(this.rallyTimer);
        this.rallyTimer = null;
      }
    }, 200);
  }

  /** A racer's car state during the race: gates, the finish, and a receipt for a timed one. */
  private rallyState(id: string, x: number, z: number, now: number) {
    const st = this.rally;
    if (st.phase !== "live" || !st.racers[id]) return;
    const events = stepRally(st, id, x, z, now, this.rallyTracks.get(id));
    this.rallyTracks.set(id, { x, z, at: now });
    if (!events.length) return;
    this.sendRally();
    const fin = events.find((e) => e.t === "finish");
    const d = this.drivers.get(id);
    const secret = this.room.env.FORCE_PUSH_HMAC_SECRET as string | undefined;
    if (!fin || fin.t !== "finish" || !d || !st.route || !secret || d.name.startsWith("guest-")) return;
    const receipt = {
      room: this.room.id.toLowerCase(),
      race: st.id,
      key: st.route.key,
      from: st.route.from,
      to: st.route.to,
      dln: d.name.toLowerCase(),
      ms: fin.ms,
      place: fin.place,
      n: Object.keys(st.racers).length,
      exp: now + RALLY_RECEIPT_TTL_MS,
    };
    void signRallyReceipt(receipt, secret)
      .then((token) => this.room.getConnection(id)?.send(JSON.stringify({ t: "rally_receipt", token, race: st.id } satisfies ServerMsg)))
      .catch((err) => console.error("[rally] receipt", err));
  }

  /** Last known position (m) of a driver's car. */
  private where(id: string): [number, number] | null {
    const s = this.drivers.get(id)?.state;
    return s ? [s[0], s[2]] : null;
  }

  private boxStates(now: number): BoxState[] {
    return this.boxes.map((b) => ({ gen: b.gen, wait: Math.max(0, b.availableAt - now) }));
  }

  private smash: SmashRoom;
  private live = createReporter((l) => void this.reportLive(l));

  /** Tell the town tally who's here (best effort). */
  private async reportLive(l: TownLive) {
    const secret = (this.room.env.LIVE_SECRET as string | undefined)?.trim();
    const tally = this.room.party("Townlive", "main");
    if (!secret || !tally) return;
    try {
      await tally.fetch("/update", {
        method: "POST",
        headers: { "Content-Type": "application/json", [LIVE_SECRET_HEADER]: secret },
        body: JSON.stringify({ slug: this.room.id, ...l }),
      });
    } catch {
      // the next change or heartbeat tries again
    }
  }

  private countChanged() {
    this.live.update({ driving: this.drivers.size, watching: this.watchers.size });
  }

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.boxes = Array.from({ length: boxCountFor(this.room.id) }, () => ({ gen: 0, availableAt: 0 }));
    this.smash = new SmashRoom(this.room, (id) => {
      const s = this.drivers.get(id)?.state;
      return s ? { x: s[0], z: s[2], speed: s[7], flags: s[10] } : null;
    });
  }

  onConnect(conn: Connection, ctx: ConnectionContext) {
    const watch = new URL(ctx.request.url).searchParams.get("watch") === "1";
    if (this.smash.enabled) {
      void this.smash.greet(conn);
      this.smash.wake();
      // A device hash for the review flags; never the raw ip or user-agent.
      const secret = this.room.env.FORCE_PUSH_HMAC_SECRET as string | undefined;
      if (!watch && secret) {
        const ip = ctx.request.headers.get("cf-connecting-ip") ?? "";
        const ua = ctx.request.headers.get("user-agent") ?? "";
        void seenHash(secret, ip, ua)
          .then((h) => {
            if (this.room.getConnection(conn.id)) this.smash.see(conn.id, h);
          })
          .catch(() => {});
      }
    }
    if (watch) {
      this.watchers.add(conn.id);
      this.runWatchClock();
      this.countChanged();
    }
    const msg: ServerMsg = {
      t: "welcome",
      you: conn.id,
      drivers: [...this.drivers.entries()].map(([id, d]) => ({ id, name: d.name, s: d.state })),
      boxes: this.boxStates(Date.now()),
      crown: this.crown,
      rally: this.rally,
      now: Date.now(),
    };
    conn.send(JSON.stringify(msg));
  }

  /** GET: who's in the city right now, for /towns (cached by /api/towns/live). */
  onRequest(request: Request) {
    if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });
    return Response.json({ driving: this.drivers.size, watching: this.watchers.size });
  }

  onMessage(sender: Connection, message: string | ArrayBuffer | ArrayBufferView) {
    if (this.watchers.has(sender.id)) return;
    if (typeof message !== "string") return;
    // Only `auth` (an access token) and a race's route may be longer than a normal message.
    if (
      message.length > MAX_MESSAGE_BYTES &&
      !(message.length <= MAX_AUTH_BYTES && message.startsWith('{"t":"auth"')) &&
      !(message.length <= MAX_ROUTE_BYTES && message.startsWith('{"t":"rally_start"'))
    )
      return;
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
      if (d.jumps.see({ x: s.x, z: s.z, at: now })) this.smash.jumped(sender.id, now);
      this.rallyState(sender.id, s.x, s.z, now);
      this.room.broadcast(JSON.stringify(["s", sender.id, ...d.state]), [sender.id, ...this.watchers]);
      return;
    }

    if (!msg || typeof msg !== "object") return;
    const { t, name, to, x, z, box, gen, item, dx, dz, id, target, victim, steal, token, e, route, solo } = msg as Record<string, unknown>;

    // A quick reaction: to everyone else driving (spectators don't draw cars' bubbles).
    if (t === "emote") {
      const d = this.drivers.get(sender.id);
      const now = Date.now();
      if (!d || !validEmote(e) || now - d.lastEmote < EMOTE_MIN_MS) return;
      d.lastEmote = now;
      this.room.broadcast(JSON.stringify({ t: "emote", from: sender.id, e } satisfies ServerMsg), [sender.id, ...this.watchers]);
      return;
    }

    // Smash: who you are (asked of the site), and your hits.
    if (t === "auth") {
      if (this.drivers.has(sender.id) && typeof token === "string" && token.length < MAX_AUTH_BYTES) void this.smash.auth(sender.id, token, sender);
      return;
    }
    if (t === "smash") {
      const m = parseSmash(msg as Record<string, unknown>);
      if (m && this.drivers.has(sender.id)) this.smash.smash(sender.id, m);
      return;
    }

    // City races: start one with a route, or accept the open invite.
    // A race's item box: near it by your last state, holding nothing, then an item by your place.
    if (t === "rally_take") {
      const d = this.drivers.get(sender.id);
      const st = this.rally;
      const now = Date.now();
      const at = this.where(sender.id);
      if (!d || !st.route || d.held || !at || now - d.lastTake < TAKE_MIN_MS || typeof box !== "number" || typeof gen !== "number") return;
      const spot = rallyBoxSpots(st.route)[box];
      if (!spot || Math.hypot(spot[0] - at[0], spot[1] - at[1]) > BOX_REACH * 4) return;
      if (!takeRallyBox(st, sender.id, box, gen, now)) return;
      d.lastTake = now;
      const racing = rallyStandings(st).filter((id) => st.racers[id].ms === null && !st.racers[id].gone);
      d.held = rallyItem(Math.max(1, racing.indexOf(sender.id) + 1), Math.max(1, racing.length));
      sender.send(JSON.stringify({ t: "got", item: d.held } satisfies ServerMsg));
      this.sendRally();
      return;
    }

    if (t === "rally_start" || t === "rally_join") {
      const d = this.drivers.get(sender.id);
      if (!d) return;
      const now = Date.now();
      let changed = false;
      if (t === "rally_start") {
        const r = validRoute(route, COORD_MAX);
        if (!r || this.crown.phase === "live" || this.crown.phase === "countdown") return;
        changed = startRally(this.rally, raceId(), sender.id, d.name, r, now, solo === true || this.drivers.size === 1);
        if (changed) {
          this.rallyTracks.clear();
          this.runRallyClock();
        }
      } else changed = joinRally(this.rally, sender.id, d.name, now);
      if (changed) this.sendRally();
      return;
    }

    // Crown Rush.
    if (t === "crown_start" || t === "crown_grab" || t === "crown_hit" || t === "crown_drop") {
      const d = this.drivers.get(sender.id);
      if (!d) return;
      const now = Date.now();
      let changed = false;
      if (t === "crown_start") {
        if (rallyBusy(this.rally)) return;
        if (typeof x !== "number" || typeof z !== "number" || !Number.isFinite(x) || !Number.isFinite(z)) return;
        if (Math.abs(x) > COORD_MAX || Math.abs(z) > COORD_MAX) return;
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
        if (typeof box !== "number" || !Number.isInteger(box) || box < 0 || box >= this.boxes.length) return;
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
        this.smash.fired(this.fxSeq, sender.id, u.x, u.z);
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
    this.drivers.set(sender.id, { name, state: null, lastState: 0, lastBump: 0, held: null, lastTake: 0, lastUse: 0, lastEmote: 0, jumps: new JumpWatch() });
    this.smash.join(sender.id);
    this.countChanged();
    this.room.broadcast(JSON.stringify({ t: "join", id: sender.id, name } satisfies ServerMsg), [sender.id]);
  }

  onClose(conn: Connection) {
    const watched = this.watchers.delete(conn.id);
    this.smash.leave(conn.id);
    const at = this.where(conn.id) ?? [this.crown.x, this.crown.z];
    if (!this.drivers.delete(conn.id)) {
      if (watched) this.countChanged();
      return;
    }
    this.countChanged();
    if (leaveCrown(this.crown, conn.id, Date.now(), at[0], at[1])) this.sendCrown();
    this.rallyTracks.delete(conn.id);
    if (leaveRally(this.rally, conn.id)) this.sendRally();
    this.room.broadcast(JSON.stringify({ t: "leave", id: conn.id } satisfies ServerMsg));
  }
}

