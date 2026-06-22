import type { Party, Connection, ConnectionContext } from "partykit/server";
import { signKillToken, randomNonce } from "./killToken";
import { signBossDamageToken } from "./bossToken";

// ─── Tunables ───────────────────────────────────────────────
const MOVE_INTERVAL_MS = 80;
const MAX_MESSAGE_BYTES = 1024;

const INITIAL_HP = 3;
const PROJECTILE_RANGE = 1200;
const SHOT_WINDOW_MS = 1000;
const MAX_SHOTS_PER_WINDOW = 7;
const HIT_WINDOW_MS = 1000;
const MAX_HITS_PER_WINDOW = 6; // hits are rarer than shots; 6/s is generous
const NEWBIE_PROTECTION_MS = 30_000;
const INVULN_AFTER_SPAWN_MS = 3_000;
const RESPAWN_DELAY_MS = 5_000;
const RESPAWN_DISTANCE = 200;
const KILL_TOKEN_TTL_MS = 30_000;

// ─── Bug Invasion boss (live event) ─────────────────────────
const BOSS_BASE_POS = { x: 0, y: 800, z: 0 };
const BOSS_DAMAGE_PER_HIT = 30;
const BOSS_MINION_BONUS = 50;
const BOSS_DEFAULT_MAX_HP = 50_000;
const BOSS_MAX_HP_CEILING = 20_000_000;
const BOSS_MAX_HP_FLOOR = 5_000;
const BOSS_HIT_MAX_DIST = 3_000; // loose: player must be near the boss
const BOSS_SHOT_WINDOW_MS = 1_000;
const BOSS_MAX_SHOTS_PER_WINDOW = 8; // client fire rate caps at ~7 projectiles/s
const BOSS_MINION_WINDOW_MS = 10_000;
const BOSS_MAX_MINIONS_PER_WINDOW = 20; // covers honest spray-into-flock bursts; caps headless claim bots
const BOSS_EVENT_FETCH_CACHE_MS = 15_000;
const BOSS_BROADCAST_THROTTLE_MS = 200; // 5 Hz HP broadcast
const DAMAGE_RECEIPT_THRESHOLD = 300; // issue a signed receipt every N damage
const DAMAGE_RECEIPT_TTL_MS = 90_000;
const BOSS_RESET_DELAY_MS = 8_000; // after defeat, boss stays gone this long
const BOSS_SELF_HIT_IFRAME_MS = 1_200; // i-frames after a boss attack hits you

// World bounds — reject moves outside a sane envelope to prevent griefing
// the presence system with NaN/Infinity or absurd coordinates.
const COORD_ABS_MAX = 5_000;
const ALT_MIN = -200;
const ALT_MAX = 1_000;

// Happy Hour windows in UTC hours (must mirror src/lib/happyHour.ts)
const HAPPY_HOUR_UTC_STARTS = [15, 22, 2];

function isHappyHourNow(): boolean {
  const h = new Date().getUTCHours();
  return HAPPY_HOUR_UTC_STARTS.includes(h);
}

// ─── Validators ─────────────────────────────────────────────
function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function isInBounds(x: number, y: number, z: number): boolean {
  if (Math.abs(x) > COORD_ABS_MAX) return false;
  if (Math.abs(z) > COORD_ABS_MAX) return false;
  if (y < ALT_MIN || y > ALT_MAX) return false;
  return true;
}

const LOGIN_RE = /^[a-zA-Z0-9-]{1,39}$/; // GitHub login charset

function sanitizeString(s: unknown, max: number): string | null {
  if (typeof s !== "string") return null;
  if (s.length === 0 || s.length > max) return null;
  return s;
}

// ─── Types ──────────────────────────────────────────────────
interface PilotState {
  login: string;
  avatar: string;
  vehicle: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  bank: number;
  hp: number;
  pvpEnabled: boolean;
  joinedAt: number;
  invulnUntil: number;
  downedUntil: number;
  recentShots: number[];
  recentHits: number[];
}

type ClientMsg =
  | { type: "join"; login: string; avatar: string; vehicle: string }
  | { type: "move"; x: number; y: number; z: number; yaw: number; bank: number }
  | { type: "shoot"; x: number; y: number; z: number; dirX: number; dirY: number; dirZ: number }
  | { type: "hit"; targetId: string }
  | { type: "toggle_pvp"; enabled: boolean }
  | { type: "engage_boss"; maxHp: number }
  | { type: "boss_hit"; kind: "boss" | "minion" }
  | { type: "boss_self_hit" };

type ServerMsg =
  | { type: "sync"; pilots: PublicPilot[] }
  | { type: "join"; pilot: PublicPilot }
  | { type: "move"; id: string; x: number; y: number; z: number; yaw: number; bank: number }
  | { type: "leave"; id: string }
  | { type: "shoot"; shooterId: string; x: number; y: number; z: number; dirX: number; dirY: number; dirZ: number }
  | { type: "hit"; targetId: string; shooterId: string; newHp: number }
  | { type: "kill"; killerId: string; victimId: string; victimLogin: string; killerLogin: string; happyHour: boolean; killToken: string; killTokenExpiresAt: number }
  | { type: "respawn"; id: string; x: number; y: number; z: number; invulnUntil: number }
  | { type: "pvp_state"; id: string; pvpEnabled: boolean; hp: number; invulnUntil: number; downedUntil: number; joinedAt: number }
  | { type: "boss_state"; active: boolean; hp: number; maxHp: number; phase: number }
  | { type: "boss_defeated"; finalHitterId: string }
  | { type: "boss_damage_receipt"; token: string; expiresAt: number };

interface PublicPilot {
  id: string;
  login: string;
  avatar: string;
  vehicle: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  bank: number;
  hp: number;
  pvpEnabled: boolean;
  invulnUntil: number;
  downedUntil: number;
  joinedAt: number;
}

function toPublic(id: string, p: PilotState): PublicPilot {
  return {
    id,
    login: p.login,
    avatar: p.avatar,
    vehicle: p.vehicle,
    x: p.x,
    y: p.y,
    z: p.z,
    yaw: p.yaw,
    bank: p.bank,
    hp: p.hp,
    pvpEnabled: p.pvpEnabled,
    invulnUntil: p.invulnUntil,
    downedUntil: p.downedUntil,
    joinedAt: p.joinedAt,
  };
}

function distance(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function isInvuln(p: PilotState, now: number): boolean {
  return p.invulnUntil > now || (p.joinedAt + NEWBIE_PROTECTION_MS) > now;
}

function isDowned(p: PilotState, now: number): boolean {
  return p.downedUntil > now;
}

function canShoot(p: PilotState, now: number): boolean {
  p.recentShots = p.recentShots.filter((t) => t > now - SHOT_WINDOW_MS);
  return p.recentShots.length < MAX_SHOTS_PER_WINDOW;
}

function canReportHit(p: PilotState, now: number): boolean {
  p.recentHits = p.recentHits.filter((t) => t > now - HIT_WINDOW_MS);
  return p.recentHits.length < MAX_HITS_PER_WINDOW;
}

function respawnPositionFar(from: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  const angle = Math.random() * Math.PI * 2;
  const x = from.x + Math.cos(angle) * RESPAWN_DISTANCE;
  const z = from.z + Math.sin(angle) * RESPAWN_DISTANCE;
  // Clamp back into world bounds so respawn doesn't push players out of map
  return {
    x: Math.max(-COORD_ABS_MAX, Math.min(COORD_ABS_MAX, x)),
    y: Math.max(80, Math.min(300, from.y)),
    z: Math.max(-COORD_ABS_MAX, Math.min(COORD_ABS_MAX, z)),
  };
}

// ─── Server ─────────────────────────────────────────────────
export default class FlyServer implements Party.Server {
  options: Party.ServerOptions = { hibernate: true };

  readonly pilots = new Map<string, PilotState>();
  readonly lastMove = new Map<string, number>();

  // ─── Boss state (live event) ──────────────────────────────
  boss: { active: boolean; hp: number; maxHp: number; phase: number } = {
    active: false,
    hp: 0,
    maxHp: BOSS_DEFAULT_MAX_HP,
    phase: 1,
  };
  // Per-connection pending damage awaiting a signed receipt
  readonly bossDamage = new Map<string, { pending: number; pendingMinions: number }>();
  // Per-connection i-frame timestamp for boss attacks hitting the player
  readonly bossSelfHitAt = new Map<string, number>();
  readonly bossShots = new Map<string, number[]>();
  readonly bossMinionClaims = new Map<string, number[]>();
  bossLastBroadcast = 0;
  bossResetAt = 0;
  // Which event this boss belongs to, and which events already had their boss
  // defeated (so late engage_boss messages can't respawn it at full HP while
  // the event window is still open). Also persisted to room storage so a
  // server restart mid-window can't bring the boss back.
  bossEventId: string | null = null;
  readonly bossDefeatedEventIds = new Set<string>();
  bossEngageInflight = false;
  bossEventFetchAt = 0;
  bossEventFetchCache: { id: string; maxHp: number } | null | undefined = undefined;

  constructor(readonly room: Party.Room) {}

  private bossPhaseFor(hp: number, maxHp: number): number {
    const r = maxHp > 0 ? hp / maxHp : 0;
    if (r > 0.75) return 1;
    if (r > 0.5) return 2;
    if (r > 0.25) return 3;
    return 4;
  }

  private broadcastBossState(force = false) {
    const now = Date.now();
    if (!force && now - this.bossLastBroadcast < BOSS_BROADCAST_THROTTLE_MS) return;
    this.bossLastBroadcast = now;
    const msg: ServerMsg = {
      type: "boss_state",
      active: this.boss.active,
      hp: this.boss.hp,
      maxHp: this.boss.maxHp,
      phase: this.boss.phase,
    };
    this.room.broadcast(JSON.stringify(msg));
  }

  private canBossShoot(id: string, now: number): boolean {
    const arr = (this.bossShots.get(id) ?? []).filter((t) => t > now - BOSS_SHOT_WINDOW_MS);
    if (arr.length >= BOSS_MAX_SHOTS_PER_WINDOW) {
      this.bossShots.set(id, arr);
      return false;
    }
    arr.push(now);
    this.bossShots.set(id, arr);
    return true;
  }

  // Minions only exist client-side, so a kill claim can't be verified against
  // a server entity. The separate (slower) window bounds how much damage a
  // headless client can farm from fabricated claims.
  private canClaimMinion(id: string, now: number): boolean {
    const arr = (this.bossMinionClaims.get(id) ?? []).filter((t) => t > now - BOSS_MINION_WINDOW_MS);
    if (arr.length >= BOSS_MAX_MINIONS_PER_WINDOW) {
      this.bossMinionClaims.set(id, arr);
      return false;
    }
    arr.push(now);
    this.bossMinionClaims.set(id, arr);
    return true;
  }

  // Resolve the currently-live event from the app API (cached briefly).
  // Returns the event → engage with ITS config; null → no live event, no
  // boss; "unavailable" → SITE_URL not configured (local dev) or API down,
  // fall back to the legacy client-supplied HP.
  private async fetchActiveEvent(): Promise<{ id: string; maxHp: number } | null | "unavailable"> {
    const siteUrl = (this.room.env as Record<string, unknown>).SITE_URL as string | undefined;
    if (!siteUrl) return "unavailable";
    const now = Date.now();
    if (now - this.bossEventFetchAt < BOSS_EVENT_FETCH_CACHE_MS && this.bossEventFetchCache !== undefined) {
      return this.bossEventFetchCache;
    }
    this.bossEventFetchAt = now;
    try {
      const res = await fetch(`${siteUrl.replace(/\/+$/, "")}/api/events/active`);
      if (!res.ok) return "unavailable";
      const data = (await res.json()) as { live?: boolean; event?: { id?: unknown; boss_max_hp?: unknown } };
      this.bossEventFetchCache =
        data.live && typeof data.event?.id === "string"
          ? { id: data.event.id, maxHp: Number(data.event.boss_max_hp) || BOSS_DEFAULT_MAX_HP }
          : null;
      return this.bossEventFetchCache;
    } catch {
      return "unavailable";
    }
  }

  private async handleEngageBoss(clientMaxHp: unknown) {
    if (this.bossEngageInflight) return;
    this.bossEngageInflight = true;
    try {
      const ev = await this.fetchActiveEvent();
      let eventId: string;
      let maxHp: number;
      if (ev === "unavailable") {
        eventId = "fallback";
        maxHp = isFiniteNumber(clientMaxHp) ? Math.floor(clientMaxHp) : BOSS_DEFAULT_MAX_HP;
      } else if (ev === null) {
        return; // No live event → nothing to engage.
      } else {
        eventId = ev.id;
        maxHp = Math.floor(ev.maxHp);
      }

      const defeated =
        this.bossDefeatedEventIds.has(eventId) ||
        !!(await this.room.storage.get(`boss:defeated:${eventId}`));
      if (defeated) {
        this.bossDefeatedEventIds.add(eventId);
        return;
      }

      // Re-check after the awaits: another engage may have landed meanwhile.
      if (this.boss.active || Date.now() <= this.bossResetAt) {
        this.broadcastBossState(true);
        return;
      }

      maxHp = Math.max(BOSS_MAX_HP_FLOOR, Math.min(BOSS_MAX_HP_CEILING, maxHp));
      this.bossEventId = eventId;
      this.boss = { active: true, hp: maxHp, maxHp, phase: 1 };
      this.broadcastBossState(true);
    } finally {
      this.bossEngageInflight = false;
    }
  }

  // Issue a signed damage receipt to a connection for its pending chunk.
  private async issueBossReceipt(connId: string) {
    const track = this.bossDamage.get(connId);
    if (!track || track.pending <= 0) return;
    const pilot = this.pilots.get(connId);
    if (!pilot || pilot.login === "anonymous") {
      // Anonymous players can't be credited; drop their pending.
      this.bossDamage.set(connId, { pending: 0, pendingMinions: 0 });
      return;
    }
    const secret = (this.room.env as Record<string, unknown>).FORCE_PUSH_HMAC_SECRET as string | undefined;
    if (!secret) {
      console.warn("[BUG INVASION] FORCE_PUSH_HMAC_SECRET MISSING — damage not credited");
      return;
    }
    const amt = track.pending;
    const min = track.pendingMinions;
    // Reset BEFORE awaiting to avoid double-issue under concurrency
    this.bossDamage.set(connId, { pending: 0, pendingMinions: 0 });
    const expiresAt = Date.now() + DAMAGE_RECEIPT_TTL_MS;
    try {
      const token = await signBossDamageToken(
        { dln: pilot.login.toLowerCase(), amt, min, exp: expiresAt, nonce: randomNonce() },
        secret,
      );
      const conn = this.room.getConnection(connId);
      if (conn) {
        const msg: ServerMsg = { type: "boss_damage_receipt", token, expiresAt };
        conn.send(JSON.stringify(msg));
      }
    } catch (err) {
      console.error("Failed to sign boss damage token", err);
    }
  }

  onConnect(conn: Connection, _ctx: ConnectionContext) { void _ctx;
    const pilots = [...this.pilots.entries()].map(([id, p]) => toPublic(id, p));
    const syncMsg: ServerMsg = { type: "sync", pilots };
    conn.send(JSON.stringify(syncMsg));
    // Sync current boss state so late-joiners see the live HP immediately
    if (this.boss.active) {
      const bossMsg: ServerMsg = {
        type: "boss_state",
        active: this.boss.active,
        hp: this.boss.hp,
        maxHp: this.boss.maxHp,
        phase: this.boss.phase,
      };
      conn.send(JSON.stringify(bossMsg));
    }
  }

  onMessage(message: string, sender: Connection) {
    // Reject oversized payloads up front to avoid expensive JSON.parse on
    // attacker-controlled blobs.
    if (typeof message !== "string" || message.length > MAX_MESSAGE_BYTES) return;

    let msg: ClientMsg;
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }
    if (!msg || typeof msg !== "object" || typeof (msg as { type?: unknown }).type !== "string") return;

    const id = sender.id;
    const now = Date.now();

    if (msg.type === "join") {
      const login = sanitizeString(msg.login, 39);
      const avatar = sanitizeString(msg.avatar, 256);
      const vehicle = sanitizeString(msg.vehicle, 32);
      if (!login || !avatar || !vehicle) return;
      if (!LOGIN_RE.test(login) && login !== "anonymous") return;

      const pilot: PilotState = {
        login,
        avatar,
        vehicle,
        x: 0,
        y: 120,
        z: 400,
        yaw: 0,
        bank: 0,
        hp: INITIAL_HP,
        pvpEnabled: true,
        joinedAt: now,
        invulnUntil: now + NEWBIE_PROTECTION_MS,
        downedUntil: 0,
        recentShots: [],
        recentHits: [],
      };
      this.pilots.set(id, pilot);
      const joinMsg: ServerMsg = { type: "join", pilot: toPublic(id, pilot) };
      this.room.broadcast(JSON.stringify(joinMsg), [sender.id]);
      return;
    }

    // Boss engage is room-global state (no pilot needed) — handle it BEFORE the
    // pilot guard, so it works even when engage_boss arrives before the player's
    // join message (which was silently dropping it and leaving the boss inert).
    if (msg.type === "engage_boss") {
      if (this.boss.active || now <= this.bossResetAt) {
        this.broadcastBossState(true);
        return;
      }
      void this.handleEngageBoss(msg.maxHp);
      return;
    }

    const pilot = this.pilots.get(id);
    if (!pilot) return;

    if (msg.type === "move") {
      const last = this.lastMove.get(id) ?? 0;
      if (now - last < MOVE_INTERVAL_MS) return;

      if (!isFiniteNumber(msg.x) || !isFiniteNumber(msg.y) || !isFiniteNumber(msg.z)) return;
      if (!isFiniteNumber(msg.yaw) || !isFiniteNumber(msg.bank)) return;
      if (!isInBounds(msg.x, msg.y, msg.z)) return;

      this.lastMove.set(id, now);
      pilot.x = msg.x;
      pilot.y = msg.y;
      pilot.z = msg.z;
      pilot.yaw = msg.yaw;
      pilot.bank = msg.bank;

      const moveMsg: ServerMsg = { type: "move", id, x: msg.x, y: msg.y, z: msg.z, yaw: msg.yaw, bank: msg.bank };
      this.room.broadcast(JSON.stringify(moveMsg), [sender.id]);
      return;
    }

    if (msg.type === "toggle_pvp") {
      if (typeof msg.enabled !== "boolean") return;
      pilot.pvpEnabled = msg.enabled;
      if (!msg.enabled) {
        pilot.hp = INITIAL_HP;
        pilot.downedUntil = 0;
      }
      const stateMsg: ServerMsg = {
        type: "pvp_state",
        id,
        pvpEnabled: pilot.pvpEnabled,
        hp: pilot.hp,
        invulnUntil: pilot.invulnUntil,
        downedUntil: pilot.downedUntil,
        joinedAt: pilot.joinedAt,
      };
      this.room.broadcast(JSON.stringify(stateMsg));
      return;
    }

    if (msg.type === "boss_hit") {
      if (!this.boss.active || this.boss.hp <= 0) return;
      if (!pilot.pvpEnabled || isDowned(pilot, now)) return;
      // Anonymous pilots can't be credited (their receipts are dropped), so
      // they must not burn shared HP either — otherwise the boss dies with
      // less credited damage than its HP and the event outcome skews.
      if (pilot.login === "anonymous") return;
      if (msg.kind !== "boss" && msg.kind !== "minion") return;
      if (msg.kind === "minion" && !this.canClaimMinion(id, now)) return;
      if (!this.canBossShoot(id, now)) return;
      // Loose proximity check: player must be reasonably near the boss.
      if (distance(pilot, BOSS_BASE_POS) > BOSS_HIT_MAX_DIST) return;

      const dmg = msg.kind === "minion" ? BOSS_MINION_BONUS : BOSS_DAMAGE_PER_HIT;
      this.boss.hp = Math.max(0, this.boss.hp - dmg);
      const newPhase = this.bossPhaseFor(this.boss.hp, this.boss.maxHp);
      const phaseChanged = newPhase !== this.boss.phase;
      this.boss.phase = newPhase;

      // Track pending damage for the receipt
      const track = this.bossDamage.get(id) ?? { pending: 0, pendingMinions: 0 };
      track.pending += dmg;
      if (msg.kind === "minion") track.pendingMinions += 1;
      this.bossDamage.set(id, track);

      this.broadcastBossState(phaseChanged); // force broadcast on phase change

      // Issue a receipt once enough damage accrued
      if (track.pending >= DAMAGE_RECEIPT_THRESHOLD) {
        void this.issueBossReceipt(id);
      }

      // Boss defeated
      if (this.boss.hp <= 0) {
        this.boss.active = false;
        this.bossResetAt = now + BOSS_RESET_DELAY_MS;
        // Once an event's boss dies it stays dead: without this, any new
        // visitor's engage_boss would respawn it at full HP for as long as
        // the event window stayed open. Persisted so restarts can't undo it.
        if (this.bossEventId) {
          this.bossDefeatedEventIds.add(this.bossEventId);
          void this.room.storage.put(`boss:defeated:${this.bossEventId}`, true);
        }
        // Flush all pending receipts so final damage is credited
        for (const connId of this.bossDamage.keys()) {
          void this.issueBossReceipt(connId);
        }
        const defeatMsg: ServerMsg = { type: "boss_defeated", finalHitterId: id };
        this.room.broadcast(JSON.stringify(defeatMsg));
        this.broadcastBossState(true);
      }
      return;
    }

    if (msg.type === "boss_self_hit") {
      // A boss attack hit this player. Route into the SAME hp/destruction/
      // respawn system as PvP, so the fly HUD hearts are the single health
      // pool (no separate boss-lives counter).
      if (!pilot.pvpEnabled || isDowned(pilot, now)) return;
      const lastSelfHit = this.bossSelfHitAt.get(id) ?? 0;
      if (now - lastSelfHit < BOSS_SELF_HIT_IFRAME_MS) return; // i-frames
      this.bossSelfHitAt.set(id, now);

      pilot.hp = Math.max(0, pilot.hp - 1);
      if (pilot.hp > 0) {
        const hitMsg: ServerMsg = { type: "hit", targetId: id, shooterId: id, newHp: pilot.hp };
        this.room.broadcast(JSON.stringify(hitMsg));
        return;
      }

      // Destroyed by the boss → downed + respawn-teleport (reuses PvP flow,
      // but no kill credit since the killer is the boss).
      pilot.downedUntil = now + RESPAWN_DELAY_MS;
      const downMsg: ServerMsg = { type: "hit", targetId: id, shooterId: id, newHp: 0 };
      this.room.broadcast(JSON.stringify(downMsg));
      setTimeout(() => {
        const t = this.pilots.get(id);
        if (!t) return;
        const respawnAt = Date.now();
        const pos = respawnPositionFar(t);
        t.x = pos.x;
        t.y = pos.y;
        t.z = pos.z;
        t.hp = INITIAL_HP;
        t.downedUntil = 0;
        t.invulnUntil = respawnAt + INVULN_AFTER_SPAWN_MS;
        const respawnMsg: ServerMsg = { type: "respawn", id, x: t.x, y: t.y, z: t.z, invulnUntil: t.invulnUntil };
        this.room.broadcast(JSON.stringify(respawnMsg));
      }, RESPAWN_DELAY_MS);
      return;
    }

    if (msg.type === "shoot") {
      if (!pilot.pvpEnabled) return;
      if (isDowned(pilot, now)) return;
      if (!canShoot(pilot, now)) return;
      if (!isFiniteNumber(msg.x) || !isFiniteNumber(msg.y) || !isFiniteNumber(msg.z)) return;
      if (!isFiniteNumber(msg.dirX) || !isFiniteNumber(msg.dirY) || !isFiniteNumber(msg.dirZ)) return;
      if (!isInBounds(msg.x, msg.y, msg.z)) return;
      // Reject crazy direction magnitudes; we expect roughly unit vectors.
      const mag = Math.sqrt(msg.dirX * msg.dirX + msg.dirY * msg.dirY + msg.dirZ * msg.dirZ);
      if (!Number.isFinite(mag) || mag < 0.1 || mag > 5) return;
      // Anti-cheat: claimed spawn must be near the last known pilot position.
      // 50u tolerance covers high-speed boost + 8u front-of-nose offset.
      const dxs = msg.x - pilot.x;
      const dys = msg.y - pilot.y;
      const dzs = msg.z - pilot.z;
      if (dxs * dxs + dys * dys + dzs * dzs > 50 * 50) return;

      pilot.recentShots.push(now);

      const shootMsg: ServerMsg = {
        type: "shoot",
        shooterId: id,
        x: msg.x,
        y: msg.y,
        z: msg.z,
        dirX: msg.dirX,
        dirY: msg.dirY,
        dirZ: msg.dirZ,
      };
      this.room.broadcast(JSON.stringify(shootMsg));
      return;
    }

    if (msg.type === "hit") {
      if (!pilot.pvpEnabled) return;
      if (isDowned(pilot, now)) return;
      if (typeof msg.targetId !== "string" || msg.targetId.length === 0 || msg.targetId.length > 128) return;
      if (msg.targetId === id) return;
      if (!canReportHit(pilot, now)) return;

      const target = this.pilots.get(msg.targetId);
      if (!target) return;
      if (!target.pvpEnabled) return;
      if (isInvuln(target, now)) return;
      if (isDowned(target, now)) return;

      const dist = distance(pilot, target);
      if (dist > PROJECTILE_RANGE * 1.5) return;

      pilot.recentHits.push(now);
      target.hp = Math.max(0, target.hp - 1);

      if (target.hp > 0) {
        const hitMsg: ServerMsg = {
          type: "hit",
          targetId: msg.targetId,
          shooterId: id,
          newHp: target.hp,
        };
        this.room.broadcast(JSON.stringify(hitMsg));
        return;
      }

      // Kill flow — async because we sign an HMAC token before broadcasting.
      target.downedUntil = now + RESPAWN_DELAY_MS;
      const happyHour = isHappyHourNow();
      const expiresAt = now + KILL_TOKEN_TTL_MS;
      const killerLogin = pilot.login;
      const victimLogin = target.login;
      const victimId = msg.targetId;
      const killerId = id;

      void this.signAndBroadcastKill({
        killerId,
        victimId,
        killerLogin,
        victimLogin,
        happyHour,
        expiresAt,
      });

      // Schedule respawn independent of token signing
      setTimeout(() => {
        const t = this.pilots.get(victimId);
        if (!t) return;
        const respawnAt = Date.now();
        const pos = respawnPositionFar(t);
        t.x = pos.x;
        t.y = pos.y;
        t.z = pos.z;
        t.hp = INITIAL_HP;
        t.downedUntil = 0;
        t.invulnUntil = respawnAt + INVULN_AFTER_SPAWN_MS;
        const respawnMsg: ServerMsg = {
          type: "respawn",
          id: victimId,
          x: t.x,
          y: t.y,
          z: t.z,
          invulnUntil: t.invulnUntil,
        };
        this.room.broadcast(JSON.stringify(respawnMsg));
      }, RESPAWN_DELAY_MS);
      return;
    }
  }

  async signAndBroadcastKill(args: {
    killerId: string;
    victimId: string;
    killerLogin: string;
    victimLogin: string;
    happyHour: boolean;
    expiresAt: number;
  }) {
    const secret = (this.room.env as Record<string, unknown>).FORCE_PUSH_HMAC_SECRET as string | undefined;
    if (!secret) {
      // Fail closed: if the secret isn't configured we do not broadcast a
      // kill token, so the API can never credit XP. Warn (not every kill,
      // just on setup misconfiguration).
      console.warn(`[FORCE PUSH] FORCE_PUSH_HMAC_SECRET MISSING — kill not broadcast`);
      return;
    }
    let killToken: string;
    try {
      killToken = await signKillToken(
        {
          kln: args.killerLogin.toLowerCase(),
          vln: args.victimLogin.toLowerCase(),
          hh: args.happyHour,
          exp: args.expiresAt,
          nonce: randomNonce(),
        },
        secret,
      );
    } catch (err) {
      console.error("Failed to sign kill token", err);
      return;
    }

    const killMsg: ServerMsg = {
      type: "kill",
      killerId: args.killerId,
      victimId: args.victimId,
      victimLogin: args.victimLogin,
      killerLogin: args.killerLogin,
      happyHour: args.happyHour,
      killToken,
      killTokenExpiresAt: args.expiresAt,
    };
    this.room.broadcast(JSON.stringify(killMsg));
  }

  onClose(conn: Connection) {
    const id = conn.id;
    // Flush any pending boss damage before the connection is gone. The
    // receipt send will no-op if the socket is already closed, but if the
    // player reconnects quickly the threshold-based issuance covers it.
    void this.issueBossReceipt(id);
    this.pilots.delete(id);
    this.lastMove.delete(id);
    this.bossDamage.delete(id);
    this.bossShots.delete(id);
    this.bossMinionClaims.delete(id);
    const leaveMsg: ServerMsg = { type: "leave", id };
    this.room.broadcast(JSON.stringify(leaveMsg));
  }
}

FlyServer satisfies Party.Worker;
