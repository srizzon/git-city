import type { Party, Connection, ConnectionContext } from "partykit/server";
import { signKillToken, randomNonce } from "./killToken";

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
  | { type: "toggle_pvp"; enabled: boolean };

type ServerMsg =
  | { type: "sync"; pilots: PublicPilot[] }
  | { type: "join"; pilot: PublicPilot }
  | { type: "move"; id: string; x: number; y: number; z: number; yaw: number; bank: number }
  | { type: "leave"; id: string }
  | { type: "shoot"; shooterId: string; x: number; y: number; z: number; dirX: number; dirY: number; dirZ: number }
  | { type: "hit"; targetId: string; shooterId: string; newHp: number }
  | { type: "kill"; killerId: string; victimId: string; victimLogin: string; killerLogin: string; happyHour: boolean; killToken: string; killTokenExpiresAt: number }
  | { type: "respawn"; id: string; x: number; y: number; z: number; invulnUntil: number }
  | { type: "pvp_state"; id: string; pvpEnabled: boolean; hp: number; invulnUntil: number; downedUntil: number; joinedAt: number };

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

  constructor(readonly room: Party.Room) {}

  onConnect(conn: Connection, _ctx: ConnectionContext) { void _ctx;
    const pilots = [...this.pilots.entries()].map(([id, p]) => toPublic(id, p));
    const syncMsg: ServerMsg = { type: "sync", pilots };
    conn.send(JSON.stringify(syncMsg));
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
      const reject = (reason: string) => {
        console.log(`[FORCE PUSH] hit rejected: ${reason} shooter=${pilot.login} target=${msg.targetId?.slice(0, 8)}`);
      };
      if (!pilot.pvpEnabled) { reject("shooter pvp off"); return; }
      if (isDowned(pilot, now)) { reject("shooter downed"); return; }
      if (typeof msg.targetId !== "string" || msg.targetId.length === 0 || msg.targetId.length > 128) { reject("bad targetId"); return; }
      if (msg.targetId === id) { reject("self target"); return; }
      if (!canReportHit(pilot, now)) { reject("rate limit"); return; }

      const target = this.pilots.get(msg.targetId);
      if (!target) { reject("target not found"); return; }
      if (!target.pvpEnabled) { reject("target pvp off"); return; }
      if (isInvuln(target, now)) { reject("target invuln"); return; }
      if (isDowned(target, now)) { reject("target downed"); return; }

      const dist = distance(pilot, target);
      if (dist > PROJECTILE_RANGE * 1.5) { reject(`out of range ${dist.toFixed(0)}`); return; }
      console.log(`[FORCE PUSH] hit accepted shooter=${pilot.login} target=${target.login} dist=${dist.toFixed(0)} newHp=${target.hp - 1}`);

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
      // kill token, so the API can never credit XP. Logged once is enough.
      console.warn(`[FORCE PUSH] FORCE_PUSH_HMAC_SECRET MISSING — kill ${args.killerLogin}→${args.victimLogin} NOT broadcast. Set the env var so kills register on screen.`);
      return;
    }
    console.log(`[FORCE PUSH] kill confirmed ${args.killerLogin}→${args.victimLogin} hh=${args.happyHour}`);
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
    this.pilots.delete(id);
    this.lastMove.delete(id);
    const leaveMsg: ServerMsg = { type: "leave", id };
    this.room.broadcast(JSON.stringify(leaveMsg));
  }
}

FlyServer satisfies Party.Worker;
