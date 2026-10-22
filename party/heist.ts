import type { Room } from "./room";
import { UNIT_TO_M } from "../src/lib/league-city/drive/tuning";
import { HEIST, KIT, RULES, inRing, isSide, type HeistSide, type KitItem, type Ring } from "../src/lib/towns/heist";

// ─── City of the day (drive room side) ──────────────────────
// The Brasil map's cops and robbers, decided here, never by a client:
//   sides     each driver's side for the day (the site's /smash/me, or a
//             token the site signed when they picked mid-drive)
//   holding   a building a robber knocks down inside the ring pays nothing
//             yet: it waits, per login, until they push
//   push      the room keeps when each car left the ring; a push lands only
//             after HEIST.pushSecs out of it with no real cop near (game
//             cops live on the robber's screen, which pauses its own bar)
//   bust      the robber's car says it's out of hearts; what it held is gone,
//             and the real cop it names gets the bust if they're close (only
//             when there was something to lose)
//   kit       each side's weapons, once per RULES.kitMs each, near the city
// Pushes and busts ride the smash save to the site, which pays them.

export interface HeistDayInfo {
  day: string;
  key: string;
  ring: Ring;
}

export interface HeistPushOut {
  attackerId: number;
  buildings: number;
  at: number;
}

/** A building's shot ended a robber's run (its owner's login). */
export interface HeistTurretOut {
  login: string;
  at: number;
}

export interface HeistBustOut {
  copId: number;
  robberId: number | null;
  at: number;
}

type Where = (id: string) => { x: number; z: number } | null;
type Who = (id: string) => { login: string; devId: number | null } | null;

export class HeistRoom {
  info: HeistDayInfo | null = null;
  private sides = new Map<string, HeistSide>();
  /** Buildings each robber (login) knocked down in the ring and hasn't pushed. */
  private holding = new Map<string, number>();
  /** When each car last went out of the ring (ms), null inside. */
  private outSince = new Map<string, number | null>();
  private kitAt = new Map<string, Map<KitItem, number>>();
  private lastGang = new Map<string, number>();
  private pushes: HeistPushOut[] = [];
  private busts: HeistBustOut[] = [];
  private turrets: HeistTurretOut[] = [];

  constructor(
    private room: Room,
    private where: Where,
    private who: Who,
  ) {}

  setDay(info: HeistDayInfo | null) {
    if (info && this.info && info.day !== this.info.day) {
      // A new day: yesterday's sides and holdings don't carry over.
      this.sides.clear();
      this.holding.clear();
      this.broadcastSides();
    }
    this.info = info;
  }

  side(id: string): HeistSide | null {
    return this.sides.get(id) ?? null;
  }

  setSide(id: string, side: unknown) {
    if (!isSide(side) || this.sides.get(id) === side) return;
    this.sides.set(id, side);
    this.broadcastSides();
  }

  private broadcastSides() {
    this.room.broadcast(JSON.stringify({ t: "heist_sides", list: [...this.sides] }));
  }

  /** The sides, for someone who just arrived. */
  sidesMsg(): string {
    return JSON.stringify({ t: "heist_sides", list: [...this.sides] });
  }

  leave(id: string) {
    this.outSince.delete(id);
    this.kitAt.delete(id);
    if (this.sides.delete(id)) this.broadcastSides();
  }

  /** A car state: whether it's out of the ring, and since when. */
  state(id: string, x: number, z: number, now: number) {
    if (!this.info || this.sides.get(id) !== "robber") return;
    const out = !inRing(this.info.ring, x, z);
    const was = this.outSince.get(id) ?? null;
    if (!out) this.outSince.set(id, null);
    else if (was === null) this.outSince.set(id, now);
  }

  /**
   * A building fell (`x`, `z`: its middle in city units). True when it stood
   * in the city of the day: it never pays as a plain smash, and a robber holds it.
   */
  fell(id: string, login: string, x: number, z: number): boolean {
    if (!this.info || !inRing(this.info.ring, x * UNIT_TO_M, z * UNIT_TO_M)) return false;
    if (this.sides.get(id) === "robber") {
      const n = (this.holding.get(login) ?? 0) + 1;
      this.holding.set(login, n);
      this.room.getConnection(id)?.send(JSON.stringify({ t: "heist_held", n }));
    }
    return true;
  }

  private copNear(x: number, z: number): boolean {
    for (const [id, side] of this.sides) {
      if (side !== "cop") continue;
      const p = this.where(id);
      if (p && Math.hypot(p.x - x, p.z - z) < RULES.copNear) return true;
    }
    return false;
  }

  /** The robber's bar filled on their screen: banked if the room agrees. */
  push(id: string, now: number) {
    const me = this.who(id);
    const at = this.where(id);
    const since = this.outSince.get(id) ?? null;
    const n = me ? (this.holding.get(me.login) ?? 0) : 0;
    const ok =
      !!me && me.devId !== null && !!at && !!this.info && this.sides.get(id) === "robber" && n > 0 &&
      since !== null && now - since >= HEIST.pushSecs * 1000 - RULES.pushSlackMs && !this.copNear(at.x, at.z);
    if (!ok || !me || me.devId === null) {
      this.room.getConnection(id)?.send(JSON.stringify({ t: "heist_push_no" }));
      return;
    }
    this.holding.delete(me.login);
    this.pushes.push({ attackerId: me.devId, buildings: n, at: now });
    this.room.getConnection(id)?.send(JSON.stringify({ t: "heist_pushed", n, pts: n * HEIST.building }));
  }

  /** The robber's car ran out of hearts: what it held is gone; the real cop it names, if close, gets the bust, or the building whose shot did it. */
  bust(id: string, by: unknown, now: number, turret?: unknown) {
    const me = this.who(id);
    if (!me || this.sides.get(id) !== "robber") return;
    const lost = this.holding.get(me.login) ?? 0;
    this.holding.delete(me.login);
    this.room.getConnection(id)?.send(JSON.stringify({ t: "heist_busted", lost }));
    // A bust counts only for a robber holding something: nobody hands a friend points by getting caught empty.
    if (lost === 0) return;
    if (typeof turret === "string" && /^[a-z0-9-]{1,39}$/.test(turret) && turret !== me.login && typeof by !== "string") {
      this.turrets.push({ login: turret, at: now });
      return;
    }
    if (typeof by !== "string" || this.sides.get(by) !== "cop" || me.devId === null) return;
    const cop = this.who(by);
    const a = this.where(id);
    const b = this.where(by);
    if (!cop || cop.devId === null || !a || !b || Math.hypot(a.x - b.x, a.z - b.z) > RULES.bustReach) return;
    this.busts.push({ copId: cop.devId, robberId: me.devId, at: now });
    this.room.getConnection(by)?.send(JSON.stringify({ t: "heist_bust_credit", robber: me.login, pts: HEIST.bust }));
  }

  /** A cop busted a game-run robber (only while no real one is in the room). */
  gangBust(id: string, now: number) {
    const me = this.who(id);
    const at = this.where(id);
    if (!me || me.devId === null || !at || !this.info || this.sides.get(id) !== "cop") return;
    if ([...this.sides.values()].includes("robber")) return;
    if (Math.hypot(at.x - this.info.ring.x, at.z - this.info.ring.z) > this.info.ring.r * RULES.kitReach) return;
    if (now - (this.lastGang.get(me.login) ?? -Infinity) < RULES.gangBustGapMs) return;
    this.lastGang.set(me.login, now);
    this.busts.push({ copId: me.devId, robberId: null, at: now });
    this.room.getConnection(id)?.send(JSON.stringify({ t: "heist_bust_credit", robber: null, pts: RULES.gangBust }));
  }

  /** A kit weapon: in the driver's side's kit, charged, used near the city. */
  kit(id: string, item: KitItem, now: number): boolean {
    const side = this.sides.get(id);
    const at = this.where(id);
    if (!side || !at || !this.info || !KIT[side].includes(item)) return false;
    if (Math.hypot(at.x - this.info.ring.x, at.z - this.info.ring.z) > this.info.ring.r * RULES.kitReach) return false;
    let used = this.kitAt.get(id);
    if (!used) this.kitAt.set(id, (used = new Map()));
    // A little early is fine: the car's own clock started the charge.
    if (now - (used.get(item) ?? -Infinity) < RULES.kitMs[item] - 1500) return false;
    used.set(item, now);
    return true;
  }

  hasWork(): boolean {
    return this.pushes.length > 0 || this.busts.length > 0 || this.turrets.length > 0;
  }

  /** What the next save carries; `undo` puts it back when the save fails. */
  take(): { heist: HeistPushOut[]; busts: HeistBustOut[]; turrets: HeistTurretOut[]; undo: () => void } {
    const heist = this.pushes.splice(0);
    const busts = this.busts.splice(0);
    const turrets = this.turrets.splice(0);
    return {
      heist,
      busts,
      turrets,
      undo: () => {
        this.pushes.unshift(...heist);
        this.busts.unshift(...busts);
        this.turrets.unshift(...turrets);
      },
    };
  }
}
