import { PartyRoom, type Connection, type ConnectionContext, type Env } from "./room";
import { ChatGuard } from "../src/lib/chat-filter";

// ─── Types (inline — party/ can't use @/ alias) ─────────────
type Direction = "up" | "down" | "left" | "right";

interface AvatarLoadout {
  skin_color: string;
  hair_id: string | null;
  hair_color: string | null;
  clothes_top_id: string | null;
  clothes_top_color: string | null;
  clothes_bottom_id: string | null;
  clothes_bottom_color: string | null;
  clothes_full_id: string | null;
  clothes_full_color: string | null;
  shoes_id: string | null;
  shoes_color: string | null;
  acc_hat_id: string | null;
  acc_hat_color: string | null;
  acc_face_id: string | null;
  acc_face_color: string | null;
  acc_facial_id: string | null;
  acc_facial_color: string | null;
  acc_jewelry_id: string | null;
  acc_jewelry_color: string | null;
  eyes_color: string | null;
  blush_id: string | null;
  blush_color: string | null;
  lipstick_id: string | null;
  lipstick_color: string | null;
  pet_id: string | null;
}

interface PlayerState {
  id: string;
  github_login: string;
  avatar_url: string;
  sprite_id: number;
  loadout?: AvatarLoadout;
  x: number;
  y: number;
  dir: Direction;
}

type ClientMsg =
  | { type: "move"; dir: Direction; seq?: number }
  | { type: "chat"; text: string }
  | { type: "sit"; x: number; y: number; dir: Direction }
  | { type: "stand" }
  | { type: "avatar"; sprite_id: number }
  | { type: "loadout"; loadout: AvatarLoadout }
  | { type: "game_start"; game: string }
  | { type: "game_stop"; game: string };

interface ChatLogEntry {
  username: string;
  text: string;
  ts: number;
}

interface GameResult {
  diff_ms: number;
  best_ms: number;
  attempts: number;
  is_new_record: boolean;
  rank: number | null;
  milestones_earned: string[];
  px_earned: number;
}

type ServerMsg =
  | { type: "sync"; players: PlayerState[] }
  | { type: "join"; player: PlayerState }
  | { type: "leave"; id: string }
  | { type: "move"; id: string; x: number; y: number; dir: Direction; ackSeq?: number }
  | { type: "chat"; id: string; text: string }
  | { type: "chat_history"; entries: ChatLogEntry[] }
  | { type: "sit"; id: string; x: number; y: number; dir: Direction }
  | { type: "stand"; id: string; x: number; y: number }
  | { type: "avatar"; id: string; sprite_id: number }
  | { type: "loadout"; id: string; loadout: AvatarLoadout }
  | { type: "map_reload"; map: Record<string, unknown> }
  | { type: "game_ack"; game: string }
  | { type: "game_result"; game: string; result: GameResult };

// Fields we accept when a client sends a loadout update. Keeps the server
// defensive against malformed payloads.
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const LOADOUT_STRING_FIELDS = new Set([
  "hair_id", "clothes_top_id", "clothes_bottom_id", "clothes_full_id",
  "shoes_id", "acc_hat_id", "acc_face_id", "acc_facial_id", "acc_jewelry_id",
  "blush_id", "lipstick_id", "pet_id",
]);
const LOADOUT_COLOR_FIELDS = new Set([
  "skin_color", "hair_color", "clothes_top_color", "clothes_bottom_color",
  "clothes_full_color", "shoes_color", "acc_hat_color", "acc_face_color",
  "acc_facial_color", "acc_jewelry_color", "eyes_color", "blush_color",
  "lipstick_color",
]);

function sanitizeLoadout(raw: unknown): AvatarLoadout | null {
  if (!raw || typeof raw !== "object") return null;
  const out: Record<string, string | null> = {};
  const src = raw as Record<string, unknown>;
  for (const key of LOADOUT_STRING_FIELDS) {
    const v = src[key];
    if (v === null || typeof v === "undefined") { out[key] = null; continue; }
    if (typeof v !== "string" || v.length > 50) return null;
    out[key] = v;
  }
  for (const key of LOADOUT_COLOR_FIELDS) {
    const v = src[key];
    if (v === null || typeof v === "undefined") {
      out[key] = key === "skin_color" || key === "eyes_color" ? "#888888" : null;
      continue;
    }
    if (typeof v !== "string" || !HEX_RE.test(v)) return null;
    out[key] = v;
  }
  if (!out.skin_color) out.skin_color = "#e8c4a0";
  return out as unknown as AvatarLoadout;
}

// ─── Map config (loaded dynamically from Supabase) ───────────
interface MapConfig {
  name: string;
  width: number;
  height: number;
  tileSize: number;
  collision: number[];
  seats: Array<{ x: number; y: number }>;
  spawns: Array<{ x: number; y: number }>;
  maxPlayers: number;
  roomName: string;
  roomType: string;
  mapJson: Record<string, unknown>;
}

// Fallback: tiny 5x5 open room so the server never fails to start
const DEFAULT_MAP: MapConfig = {
  name: "fallback",
  width: 5,
  height: 5,
  tileSize: 32,
  collision: [
    1, 1, 1, 1, 1,
    1, 0, 0, 0, 1,
    1, 0, 0, 0, 1,
    1, 0, 0, 0, 1,
    1, 1, 0, 1, 1,
  ],
  seats: [],
  spawns: [{ x: 2, y: 2 }],
  maxPlayers: 50,
  roomName: "Fallback Room",
  roomType: "official_floor",
  mapJson: {},
};

interface FurnitureObject {
  id: string;
  sprite: string;
  x: number;
  y: number;
  width: number;
  height: number;
  collides: boolean;
  sittable?: boolean;
}

interface TilePropertyEntry {
  walkable: boolean;
  type: "wall" | "floor" | "door";
}

interface ArcadeRoomRow {
  slug: string;
  name: string;
  room_type: string;
  max_players: number;
  map_json: {
    name: string;
    width: number;
    height: number;
    tileSize: number;
    tileProperties?: Record<string, TilePropertyEntry>;
    layers: { ground?: number[]; collision: number[] };
    furniture?: FurnitureObject[];
    objects: Array<{ type: string; x: number; y: number; dir?: string }>;
    [key: string]: unknown;
  };
}

// Must stay in sync with `rebuildCollision` in src/lib/arcade/engine/tileMap.ts.
// Client and server have to compute the exact same collision grid, otherwise
// client-side prediction will diverge from server authority on specific tiles
// (furniture footprints, sittable items, walkable tile properties) and every
// walk through those tiles will cause a reconciliation snap.
function rebuildCollision(map: ArcadeRoomRow["map_json"]): number[] {
  const { width, height, tileSize } = map;
  const coll = new Array(width * height).fill(0);
  const ground = map.layers.ground;

  if (map.tileProperties && ground) {
    for (let i = 0; i < coll.length; i++) {
      const gid = ground[i];
      const props = map.tileProperties[gid];
      if (props && !props.walkable) coll[i] = 1;
    }
  }

  if (Array.isArray(map.furniture)) {
    for (const f of map.furniture) {
      if (!f.collides) continue;
      // Sittable furniture is walk-through (Gather-style) — matches client.
      if (
        f.sittable ||
        f.sprite.includes("sofa_") ||
        f.sprite.includes("chair_") ||
        f.sprite.includes("puff_")
      ) continue;
      const ftx = Math.floor(f.x / tileSize);
      const fty = Math.floor(f.y / tileSize);
      const ftw = Math.floor(f.width / tileSize);
      const fth = Math.floor(f.height / tileSize);
      for (let dy = 0; dy < fth; dy++) {
        for (let dx = 0; dx < ftw; dx++) {
          const idx = (fty + dy) * width + (ftx + dx);
          if (idx >= 0 && idx < coll.length) coll[idx] = 1;
        }
      }
    }
  }

  return coll;
}

function parseMapConfig(row: ArcadeRoomRow): MapConfig {
  const map = row.map_json;
  const seats = map.objects
    .filter((o) => o.type === "seat" || o.type === "pc")
    .map((o) => ({ x: o.x, y: o.y }));
  const spawns = map.objects
    .filter((o) => o.type === "spawn")
    .map((o) => ({ x: o.x, y: o.y }));

  // If the map defines tileProperties, the client rebuilds its collision grid
  // from them + furniture. We must do the same so server/client agree.
  const collision = map.tileProperties
    ? rebuildCollision(map)
    : map.layers.collision;

  return {
    name: map.name,
    width: map.width,
    height: map.height,
    tileSize: map.tileSize,
    collision,
    seats,
    spawns: spawns.length > 0
      ? spawns
      : [{ x: Math.floor(map.width / 2), y: Math.floor(map.height / 2) }],
    maxPlayers: row.max_players,
    roomName: row.name,
    roomType: row.room_type,
    mapJson: map as Record<string, unknown>,
  };
}

function seatKey(x: number, y: number): string {
  return `${x},${y}`;
}

// ─── Rate limiting ───────────────────────────────────────────
// Virtual-time rate limiter for moves. Instead of rejecting messages that
// arrive too close together (network jitter + TCP batching can deliver two
// legit inputs in the same millisecond, which a naive check rejects and
// causes visible reconciliation snaps), we advance a per-user virtual clock
// by MOVE_INTERVAL_MS for each processed move. Legit jittery bursts get
// processed; only sustained abuse (many moves crammed into a short real-time
// window) exceeds the burst buffer and gets dropped.
const MOVE_INTERVAL_MS = 100;
const MOVE_BURST_BUFFER_MS = 500;
const SIT_INTERVAL_MS = 500;
const AVATAR_INTERVAL_MS = 2000;
const MAX_SPRITE_ID = 5;
const CHAT_LOG_MAX = 30;

// ─── Game constants ─────────────────────────────────────────
const GAME_TARGET_MS = 10_000;
const GAME_TIMEOUT_MS = 60_000;
const GAME_RATE_LIMIT_MS = 3_000;
const VALID_GAMES = ["10s_classic"];

// ─── PX Milestones ──────────────────────────────────────────
interface MilestoneDef {
  id: string;
  max_diff_ms: number;
  px: number;
}

const MILESTONES: MilestoneDef[] = [
  { id: "first_try", max_diff_ms: Infinity, px: 5 },
  { id: "close_enough", max_diff_ms: 500, px: 10 },
  { id: "sharp", max_diff_ms: 100, px: 25 },
  { id: "sniper", max_diff_ms: 50, px: 50 },
  { id: "inhuman", max_diff_ms: 10, px: 100 },
  { id: "perfection", max_diff_ms: 5, px: 250 },
];

// ─── Chat filter ─────────────────────────────────────────────
// lib/chat-filter: links, scams, profanity, floods, strikes and mutes.

// ─── Server ─────────────────────────────────────────────────
export class ArcadeServer extends PartyRoom {
  static options = { hibernate: true };

  mapConfig: MapConfig = DEFAULT_MAP;
  seatSet = new Set<string>();

  readonly players = new Map<string, PlayerState>();
  readonly lastMove = new Map<string, number>();
  readonly lastSit = new Map<string, number>();
  readonly lastAvatar = new Map<string, number>();
  readonly chat = new ChatGuard();
  readonly occupiedSeats = new Set<string>();
  readonly seatedAt = new Map<string, string>();
  readonly chatLog: ChatLogEntry[] = [];

  // ── Game state (10s challenge) ──────────────────────────────
  readonly gameStartedAt = new Map<string, number>();   // userId -> timestamp
  readonly lastGameStop = new Map<string, number>();    // userId -> timestamp (rate limit)

  // ── Load config + restore state ────────────────────────────
  async onStart() {
    // Bump MAP_CACHE_VERSION whenever the collision-building logic changes so
    // old cached mapConfigs (built with the old logic) get invalidated.
    const MAP_CACHE_VERSION = 2;
    const cachedVersion = await this.room.storage.get<number>("mapConfigVersion");
    const cached = cachedVersion === MAP_CACHE_VERSION
      ? await this.room.storage.get<MapConfig>("mapConfig")
      : null;

    if (cached) {
      this.mapConfig = cached;
    } else {
      try {
        const config = await this.fetchMapFromSupabase();
        if (config) {
          this.mapConfig = config;
          await this.room.storage.put("mapConfig", config);
          await this.room.storage.put("mapConfigVersion", MAP_CACHE_VERSION);
        }
      } catch (err) {
        console.error(`[arcade:${this.room.id}] Failed to load map:`, err);
      }
    }

    // Rebuild seat set from config
    this.seatSet = new Set(this.mapConfig.seats.map((s) => `${s.x},${s.y}`));

    // Restore players from storage, but only those with a live WebSocket
    // connection. `onStart` runs on every hibernation wake — in-memory state
    // is gone, so we rebuild from storage. Any player without a live conn
    // is a ghost (disconnected during hibernation / stale from older deploys)
    // and gets purged.
    const liveUserIds = new Set<string>();
    for (const c of this.room.getConnections()) {
      const uid = (c.state as { userId?: string } | null)?.userId;
      if (uid) liveUserIds.add(uid);
    }

    const stored = await this.room.storage.list<PlayerState>({ prefix: "player:" });
    for (const [key, player] of stored) {
      const userId = key.slice("player:".length);
      if (!liveUserIds.has(userId)) {
        await this.room.storage.delete(key);
        continue;
      }
      this.players.set(userId, player);
      const sk = seatKey(player.x, player.y);
      if (this.seatSet.has(sk)) {
        this.occupiedSeats.add(sk);
        this.seatedAt.set(userId, sk);
      }
    }

    // Restore chat log
    const savedLog = await this.room.storage.get<ChatLogEntry[]>("chatLog");
    if (savedLog) {
      this.chatLog.push(...savedLog);
    }

    // Ping lobby party with current count
    this.pingLobby();
  }

  private async fetchLoadoutFromSupabase(userId: string): Promise<AvatarLoadout | null> {
    const supabaseUrl = this.room.env.NEXT_PUBLIC_SUPABASE_URL as string;
    const supabaseKey = this.room.env.SUPABASE_SERVICE_ROLE_KEY as string;
    if (!supabaseUrl || !supabaseKey) return null;

    try {
      // Join developers → arcade_avatar_loadouts via embedded select
      const res = await fetch(
        `${supabaseUrl}/rest/v1/developers?claimed_by=eq.${encodeURIComponent(userId)}&select=id,arcade_avatar_loadouts(*)&limit=1`,
        {
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
          },
        },
      );
      if (!res.ok) return null;
      const rows = (await res.json()) as Array<{
        id: number;
        arcade_avatar_loadouts: AvatarLoadout | AvatarLoadout[] | null;
      }>;
      const raw = rows[0]?.arcade_avatar_loadouts;
      const loadout = Array.isArray(raw) ? raw[0] : raw;
      return sanitizeLoadout(loadout);
    } catch {
      return null;
    }
  }

  private async fetchMapFromSupabase(): Promise<MapConfig | null> {
    const supabaseUrl = this.room.env.NEXT_PUBLIC_SUPABASE_URL as string;
    const supabaseKey = this.room.env.SUPABASE_SERVICE_ROLE_KEY as string;
    if (!supabaseUrl || !supabaseKey) return null;

    const slug = this.room.id;
    const res = await fetch(
      `${supabaseUrl}/rest/v1/arcade_rooms?slug=eq.${encodeURIComponent(slug)}&select=slug,name,room_type,max_players,map_json&limit=1`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
      },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as ArcadeRoomRow[];
    if (rows.length === 0) return null;
    return parseMapConfig(rows[0]);
  }

  private async pingLobby() {
    try {
      const lobbyRoom = this.room.party("Lobby", "main");
      if (!lobbyRoom) return;
      await lobbyRoom.fetch("/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: this.room.id,
          name: this.mapConfig.roomName,
          playerCount: this.players.size,
          maxPlayers: this.mapConfig.maxPlayers,
          roomType: this.mapConfig.roomType,
        }),
      });
    } catch {
      // Best-effort — don't block on lobby ping failure
    }
  }

  private isWalkable(x: number, y: number): boolean {
    const { width, height, collision } = this.mapConfig;
    if (x < 0 || x >= width || y < 0 || y >= height) return false;
    return collision[y * width + x] === 0;
  }

  private randomSpawn(): { x: number; y: number } {
    const { spawns } = this.mapConfig;
    return spawns[Math.floor(Math.random() * spawns.length)];
  }

  // ── Auth ───────────────────────────────────────────────────
  /** Run by the worker (party/server.ts) before a socket reaches the room. */
  static async onBeforeConnect(
    incoming: Request,
    env: Env,
  ) {
    // An incoming request's headers are immutable on Workers: a copy carries the user.
    const request = new Request(incoming);
    const url = new URL(request.url);
    const token = url.searchParams.get("token");
    if (!token) {
      return new Response("Missing token", { status: 401 });
    }

    const rawSpriteId = url.searchParams.get("sprite_id");
    let spriteId = -1;
    if (rawSpriteId !== null) {
      const parsed = parseInt(rawSpriteId, 10);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= MAX_SPRITE_ID) {
        spriteId = parsed;
      }
    }

    try {
      const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL as string;
      const supabaseAnonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

      const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: supabaseAnonKey,
        },
      });

      if (!userRes.ok) {
        return new Response("Invalid token", { status: 401 });
      }

      const user = (await userRes.json()) as {
        id: string;
        user_metadata?: Record<string, string>;
      };

      request.headers.set("x-user-id", user.id);
      request.headers.set("x-user-meta", JSON.stringify(user.user_metadata ?? {}));
      request.headers.set("x-sprite-id", String(spriteId));

      return request;
    } catch {
      return new Response("Auth failed", { status: 401 });
    }
  }

  // ── Connection ─────────────────────────────────────────────
  onConnect(conn: Connection, ctx: ConnectionContext) {
    const userId = ctx.request.headers.get("x-user-id") ?? conn.id;
    const metaStr = ctx.request.headers.get("x-user-meta") ?? "{}";
    let meta: Record<string, string> = {};
    try {
      meta = JSON.parse(metaStr);
    } catch {
      /* ignore */
    }

    // Kick duplicate connection for same user
    let isDuplicate = false;
    for (const [id] of this.players) {
      if (id === userId) {
        isDuplicate = true;
        const oldConn = [...this.room.getConnections()].find(
          (c) => (c.state as { userId?: string } | null)?.userId === userId && c !== conn,
        );
        if (oldConn) {
          oldConn.close(4000, "duplicate");
        }
        this.players.delete(id);
        break;
      }
    }

    // Enforce max players
    if (!isDuplicate && this.players.size >= this.mapConfig.maxPlayers) {
      conn.close(4001, "room full");
      return;
    }

    const spawn = this.randomSpawn();
    const player: PlayerState = {
      id: userId,
      github_login:
        (meta.user_name as string) ??
        (meta.preferred_username as string) ??
        "anon",
      avatar_url: (meta.avatar_url as string) ?? "",
      sprite_id: (() => {
        const raw = parseInt(ctx.request.headers.get("x-sprite-id") ?? "", 10);
        return !isNaN(raw) && raw >= 0 && raw <= MAX_SPRITE_ID
          ? raw
          : Math.floor(Math.random() * (MAX_SPRITE_ID + 1));
      })(),
      x: spawn.x,
      y: spawn.y,
      dir: "up",
    };

    conn.setState({ userId });
    this.players.set(userId, player);
    this.room.storage.put(`player:${userId}`, player);

    // Send full state to new player
    const syncMsg: ServerMsg = { type: "sync", players: [...this.players.values()] };
    conn.send(JSON.stringify(syncMsg));

    // Send chat history
    if (this.chatLog.length > 0) {
      const historyMsg: ServerMsg = { type: "chat_history", entries: this.chatLog };
      conn.send(JSON.stringify(historyMsg));
    }

    // Broadcast join
    const joinMsg: ServerMsg = { type: "join", player };
    this.room.broadcast(JSON.stringify(joinMsg), [conn.id]);

    // Async: fetch this player's loadout from Supabase, then broadcast it so
    // remote clients render the right avatar. Keeps onConnect sync path fast.
    this.fetchLoadoutFromSupabase(userId).then((loadout) => {
      if (!loadout) return;
      const stored = this.players.get(userId);
      if (!stored) return;
      stored.loadout = loadout;
      this.room.storage.put(`player:${userId}`, stored);
      const loadoutMsg: ServerMsg = { type: "loadout", id: userId, loadout };
      this.room.broadcast(JSON.stringify(loadoutMsg));
    }).catch(() => {
      // best-effort
    });

    // Update lobby
    this.pingLobby();
  }

  // ── Messages ───────────────────────────────────────────────
  onMessage(sender: Connection, message: string) {
    const state = sender.state as { userId?: string } | null;
    const userId = state?.userId ?? sender.id;
    const player = this.players.get(userId);
    if (!player) return;

    let msg: ClientMsg;
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }

    const now = Date.now();

    if (msg.type === "move") {
      const ackSeq = typeof msg.seq === "number" ? msg.seq : undefined;

      // Virtual-time rate limit: advance the per-user clock by MOVE_INTERVAL
      // per processed move. Accepts jitter/batching; drops true spam only.
      const prevLastMove = this.lastMove.get(userId) ?? 0;
      const effectiveTime = Math.max(now, prevLastMove + MOVE_INTERVAL_MS);
      if (effectiveTime - now > MOVE_BURST_BUFFER_MS) {
        if (ackSeq !== undefined) {
          const correction: ServerMsg = {
            type: "move",
            id: userId,
            x: player.x,
            y: player.y,
            dir: player.dir,
            ackSeq,
          };
          sender.send(JSON.stringify(correction));
        }
        return;
      }
      this.lastMove.set(userId, effectiveTime);

      const dir = msg.dir;
      if (!["up", "down", "left", "right"].includes(dir)) return;

      let nx = player.x;
      let ny = player.y;
      if (dir === "up") ny -= 1;
      else if (dir === "down") ny += 1;
      else if (dir === "left") nx -= 1;
      else if (dir === "right") nx += 1;

      if (!this.isWalkable(nx, ny)) {
        player.dir = dir;
        this.room.storage.put(`player:${userId}`, player);
        const moveMsg: ServerMsg = { type: "move", id: userId, x: player.x, y: player.y, dir, ackSeq };
        this.room.broadcast(JSON.stringify(moveMsg));
        return;
      }

      player.x = nx;
      player.y = ny;
      player.dir = dir;
      this.room.storage.put(`player:${userId}`, player);
      const moveMsg: ServerMsg = { type: "move", id: userId, x: nx, y: ny, dir, ackSeq };
      this.room.broadcast(JSON.stringify(moveMsg));
    }

    if (msg.type === "sit") {
      const lastSitTime = this.lastSit.get(userId) ?? 0;
      if (now - lastSitTime < SIT_INTERVAL_MS) return;
      this.lastSit.set(userId, now);

      const { x, y, dir } = msg;
      if (!["up", "down", "left", "right"].includes(dir)) return;
      if (typeof x !== "number" || typeof y !== "number") return;
      if (!Number.isInteger(x) || !Number.isInteger(y)) return;
      if (x < 0 || x >= this.mapConfig.width || y < 0 || y >= this.mapConfig.height) return;

      const key = seatKey(x, y);
      if (!this.seatSet.has(key)) return;
      if (this.occupiedSeats.has(key)) return;

      const dx = Math.abs(player.x - x);
      const dy = Math.abs(player.y - y);
      if (dx > 1 || dy > 1) return;

      const prevSeat = this.seatedAt.get(userId);
      if (prevSeat) this.occupiedSeats.delete(prevSeat);

      this.occupiedSeats.add(key);
      this.seatedAt.set(userId, key);
      player.x = x;
      player.y = y;
      player.dir = dir;
      this.room.storage.put(`player:${userId}`, player);
      const sitMsg: ServerMsg = { type: "sit", id: userId, x, y, dir };
      this.room.broadcast(JSON.stringify(sitMsg));
    }

    if (msg.type === "stand") {
      const lastSitTime = this.lastSit.get(userId) ?? 0;
      if (now - lastSitTime < SIT_INTERVAL_MS) return;
      this.lastSit.set(userId, now);

      const prevSeat = this.seatedAt.get(userId);
      if (prevSeat) {
        this.occupiedSeats.delete(prevSeat);
        this.seatedAt.delete(userId);
      }

      const standMsg: ServerMsg = { type: "stand", id: userId, x: player.x, y: player.y };
      this.room.broadcast(JSON.stringify(standMsg));
    }

    if (msg.type === "avatar") {
      const lastAvatarTime = this.lastAvatar.get(userId) ?? 0;
      if (now - lastAvatarTime < AVATAR_INTERVAL_MS) return;
      this.lastAvatar.set(userId, now);

      const spriteId = msg.sprite_id;
      if (typeof spriteId !== "number" || !Number.isInteger(spriteId) || spriteId < 0 || spriteId > MAX_SPRITE_ID) return;
      player.sprite_id = spriteId;
      this.room.storage.put(`player:${userId}`, player);
      const avatarMsg: ServerMsg = { type: "avatar", id: userId, sprite_id: spriteId };
      this.room.broadcast(JSON.stringify(avatarMsg));
    }

    if (msg.type === "loadout") {
      const lastAvatarTime = this.lastAvatar.get(userId) ?? 0;
      if (now - lastAvatarTime < AVATAR_INTERVAL_MS) return;
      this.lastAvatar.set(userId, now);

      const clean = sanitizeLoadout(msg.loadout);
      if (!clean) return;
      player.loadout = clean;
      this.room.storage.put(`player:${userId}`, player);
      const loadoutMsg: ServerMsg = { type: "loadout", id: userId, loadout: clean };
      this.room.broadcast(JSON.stringify(loadoutMsg));
    }

    if (msg.type === "chat") {
      const verdict = this.chat.check(userId, msg.text, now);
      if (verdict.kind === "drop") return;
      if (verdict.kind === "shadow") {
        const silentMsg: ServerMsg = { type: "chat", id: userId, text: verdict.text };
        sender.send(JSON.stringify(silentMsg));
        return;
      }
      const filtered = verdict.text;

      const chatMsg: ServerMsg = { type: "chat", id: userId, text: filtered };
      this.room.broadcast(JSON.stringify(chatMsg));

      this.chatLog.push({ username: player.github_login, text: filtered, ts: now });
      if (this.chatLog.length > CHAT_LOG_MAX) this.chatLog.shift();
      this.room.storage.put("chatLog", this.chatLog);
    }

    // ── Game: Start ───────────────────────────────────────────
    if (msg.type === "game_start") {
      if (!VALID_GAMES.includes(msg.game)) return;

      // Rate limit: must wait between attempts
      const lastStop = this.lastGameStop.get(userId) ?? 0;
      if (now - lastStop < GAME_RATE_LIMIT_MS) return;

      // Clear any existing game (restart)
      this.gameStartedAt.set(userId, now);

      const ackMsg: ServerMsg = { type: "game_ack", game: msg.game };
      sender.send(JSON.stringify(ackMsg));
    }

    // ── Game: Stop ────────────────────────────────────────────
    if (msg.type === "game_stop") {
      if (!VALID_GAMES.includes(msg.game)) return;

      const startedAt = this.gameStartedAt.get(userId);
      if (!startedAt) return; // no active game

      this.gameStartedAt.delete(userId);
      this.lastGameStop.set(userId, now);

      const elapsed = now - startedAt;
      const diff_ms = Math.abs(elapsed - GAME_TARGET_MS);

      // Timeout: reject if way too far from target
      if (diff_ms > GAME_TIMEOUT_MS) return;

      // Call score API to persist + get result
      this.submitScore(userId, player.github_login, msg.game, diff_ms, sender);
    }
  }

  // ── Score submission (async, always sends result) ─────────
  private async submitScore(
    userId: string,
    login: string,
    game: string,
    diff_ms: number,
    sender: Connection,
  ) {
    // Default result — sent even if persistence fails
    let best_ms = diff_ms;
    let attempts = 1;
    let is_new_record = true;
    let rank: number | null = null;
    const milestones_earned: string[] = [];
    let px_earned = 0;

    try {
      const supabaseUrl = this.room.env.NEXT_PUBLIC_SUPABASE_URL as string;
      const supabaseKey = this.room.env.SUPABASE_SERVICE_ROLE_KEY as string;
      if (!supabaseUrl || !supabaseKey) throw new Error("Missing Supabase env vars");

      const headers = {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      };

      // 1. Get current best score + attempt count
      const currentRes = await fetch(
        `${supabaseUrl}/rest/v1/arcade_scores?user_id=eq.${userId}&game=eq.${encodeURIComponent(game)}&select=best_ms,attempts`,
        { headers },
      );
      if (!currentRes.ok) throw new Error(`scores fetch: ${currentRes.status}`);
      const currentRows = (await currentRes.json()) as Array<{ best_ms: number; attempts: number }>;
      const current = currentRows[0] ?? null;

      const prevBest = current?.best_ms ?? Infinity;
      attempts = (current?.attempts ?? 0) + 1;
      is_new_record = diff_ms < prevBest;
      best_ms = Math.min(diff_ms, prevBest);

      // 2. Upsert score
      if (current) {
        const updateBody: Record<string, unknown> = { attempts, updated_at: new Date().toISOString() };
        if (is_new_record) updateBody.best_ms = diff_ms;
        await fetch(
          `${supabaseUrl}/rest/v1/arcade_scores?user_id=eq.${userId}&game=eq.${encodeURIComponent(game)}`,
          { method: "PATCH", headers: { ...headers, Prefer: "return=minimal" }, body: JSON.stringify(updateBody) },
        );
      } else {
        await fetch(
          `${supabaseUrl}/rest/v1/arcade_scores`,
          { method: "POST", headers, body: JSON.stringify({ user_id: userId, game, best_ms: diff_ms, attempts: 1 }) },
        );
      }

      // 3. Get rank (only if new record)
      if (is_new_record) {
        const rankRes = await fetch(
          `${supabaseUrl}/rest/v1/arcade_scores?game=eq.${encodeURIComponent(game)}&best_ms=lt.${best_ms}&select=user_id`,
          { headers: { ...headers, Prefer: "count=exact" }, method: "HEAD" },
        );
        const countHeader = rankRes.headers.get("content-range");
        const match = countHeader?.match(/\/(\d+)/);
        rank = match ? parseInt(match[1], 10) + 1 : null;
      }

      // 4. The day's first game pays a "play" session (best-effort, capped
      // with the other modes by earn_pixels).
      try {
        const devRes = await fetch(`${supabaseUrl}/rest/v1/developers?claimed_by=eq.${userId}&claimed=eq.true&order=claimed_at.asc&limit=1&select=id`, { headers });
        const devRows = (await devRes.json()) as Array<{ id: number }>;
        if (devRows[0]?.id) {
          const today = new Date().toISOString().slice(0, 10);
          await fetch(`${supabaseUrl}/rest/v1/rpc/earn_pixels`, {
            method: "POST", headers,
            body: JSON.stringify({
              p_developer_id: devRows[0].id,
              p_earn_rule_id: "play_arcade",
              p_idempotency_key: `play_arcade:${today}:${devRows[0].id}`,
            }),
          });
        }
      } catch (playErr) {
        console.error(`[arcade:${this.room.id}] play reward error:`, playErr);
      }

      // 5. Check milestones (best-effort)
      try {
        const existingRes = await fetch(
          `${supabaseUrl}/rest/v1/arcade_milestones?user_id=eq.${userId}&game=eq.${encodeURIComponent(game)}&select=milestone`,
          { headers },
        );
        const existingSet = new Set(
          ((await existingRes.json()) as Array<{ milestone: string }>).map((m) => m.milestone),
        );

        const newMilestones: MilestoneDef[] = [];
        for (const m of MILESTONES) {
          if (existingSet.has(m.id)) continue;
          if (m.id === "first_try" || diff_ms <= m.max_diff_ms) {
            newMilestones.push(m);
          }
        }

        if (newMilestones.length > 0) {
          await fetch(`${supabaseUrl}/rest/v1/arcade_milestones`, {
            method: "POST", headers,
            body: JSON.stringify(newMilestones.map((m) => ({ user_id: userId, game, milestone: m.id }))),
          });
          px_earned = newMilestones.reduce((sum, m) => sum + m.px, 0);
          milestones_earned.push(...newMilestones.map((m) => m.id));

          // Credit PX (best-effort — look up developer_id first)
          if (px_earned > 0) {
            const devRes = await fetch(`${supabaseUrl}/rest/v1/developers?claimed_by=eq.${userId}&claimed=eq.true&order=claimed_at.asc&limit=1&select=id`, { headers });
            const devRows = (await devRes.json()) as Array<{ id: number }>;
            if (devRows[0]?.id) {
              await fetch(`${supabaseUrl}/rest/v1/rpc/credit_pixels`, {
                method: "POST", headers,
                body: JSON.stringify({
                  p_developer_id: devRows[0].id,
                  p_amount: px_earned,
                  p_source: "arcade_milestone",
                  p_reference_id: game,
                  p_reference_type: "arcade",
                  p_description: `Arcade milestones: ${milestones_earned.join(", ")}`,
                  p_idempotency_key: `arcade_${userId}_${game}_${milestones_earned.join("_")}`,
                }),
              });
            }
          }
        }
      } catch (milestoneErr) {
        console.error(`[arcade:${this.room.id}] milestone error:`, milestoneErr);
      }

      // 6. Check achievements (best-effort)
      try {
        const achievementRes = await fetch(
          `${supabaseUrl}/rest/v1/achievements?category=eq.arcade&select=id,threshold`,
          { headers },
        );
        const allAchievements = (await achievementRes.json()) as Array<{ id: string; threshold: number }>;
        if (allAchievements.length > 0) {
          const devRes = await fetch(`${supabaseUrl}/rest/v1/developers?claimed_by=eq.${userId}&claimed=eq.true&order=claimed_at.asc&limit=1&select=id`, { headers });
          const devRows = (await devRes.json()) as Array<{ id: number }>;
          const developerId = devRows[0]?.id;

          if (developerId) {
            const unlockedRes = await fetch(
              `${supabaseUrl}/rest/v1/developer_achievements?developer_id=eq.${developerId}&select=achievement_id`,
              { headers },
            );
            const unlocked = new Set(
              ((await unlockedRes.json()) as Array<{ achievement_id: string }>).map((a) => a.achievement_id),
            );

            const newAchievements = allAchievements.filter((a) => {
              if (unlocked.has(a.id)) return false;
              if (a.id === "arcade_hello_friend") return true;
              return diff_ms <= a.threshold;
            });

            if (newAchievements.length > 0) {
              await fetch(`${supabaseUrl}/rest/v1/developer_achievements`, {
                method: "POST", headers,
                body: JSON.stringify(newAchievements.map((a) => ({ developer_id: developerId, achievement_id: a.id }))),
              });
            }
          }
        }
      } catch (achievementErr) {
        console.error(`[arcade:${this.room.id}] achievement error:`, achievementErr);
      }

      // 6. Broadcast chat if top 10
      if (is_new_record && rank !== null && rank <= 10) {
        const chatText = `${login} scored ${diff_ms}ms off on 10s Challenge! (#${rank})`;
        const chatMsg: ServerMsg = { type: "chat", id: "__system__", text: chatText };
        this.room.broadcast(JSON.stringify(chatMsg));
        this.chatLog.push({ username: "ARCADE", text: chatText, ts: Date.now() });
        if (this.chatLog.length > CHAT_LOG_MAX) this.chatLog.shift();
        this.room.storage.put("chatLog", this.chatLog);
      }
    } catch (err) {
      console.error(`[arcade:${this.room.id}] submitScore error:`, err);
    }

    // ALWAYS send result, even if persistence failed
    try {
      const resultMsg: ServerMsg = {
        type: "game_result",
        game,
        result: { diff_ms, best_ms, attempts, is_new_record, rank, milestones_earned, px_earned },
      };
      sender.send(JSON.stringify(resultMsg));
    } catch {
      // Connection might be closed — nothing we can do
    }
  }

  // ── Disconnect ─────────────────────────────────────────────
  onClose(conn: Connection) {
    const state = conn.state as { userId?: string } | null;
    const userId = state?.userId ?? conn.id;

    // If the user already reconnected on a different connection (tab refocus,
    // network blip), a new conn has taken over — don't wipe their player.
    const takenOver = [...this.room.getConnections()].some(
      (c) => c !== conn && (c.state as { userId?: string } | null)?.userId === userId,
    );
    if (takenOver) return;

    this.players.delete(userId);
    this.room.storage.delete(`player:${userId}`);
    this.lastMove.delete(userId);
    this.chat.forget(userId);
    this.lastSit.delete(userId);
    this.lastAvatar.delete(userId);
    this.gameStartedAt.delete(userId);
    this.lastGameStop.delete(userId);

    const prevSeat = this.seatedAt.get(userId);
    if (prevSeat) {
      this.occupiedSeats.delete(prevSeat);
      this.seatedAt.delete(userId);
    }

    const leaveMsg: ServerMsg = { type: "leave", id: userId };
    this.room.broadcast(JSON.stringify(leaveMsg));

    // Update lobby
    this.pingLobby();
  }

  // ── HTTP: player count + hot-reload ────────────────────────
  async onRequest(request: Request) {
    const corsHeaders = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // GET / — player count
    if (request.method === "GET") {
      return new Response(
        JSON.stringify({ count: this.players.size }),
        { headers: corsHeaders },
      );
    }

    // POST /invalidate — hot-reload map config
    if (request.method === "POST") {
      const url = new URL(request.url);
      if (url.pathname.endsWith("/invalidate")) {
        try {
          const newConfig = await this.fetchMapFromSupabase();
          if (!newConfig) {
            return new Response(
              JSON.stringify({ error: "Room not found in DB" }),
              { status: 404, headers: corsHeaders },
            );
          }

          this.mapConfig = newConfig;
          this.seatSet = new Set(newConfig.seats.map((s) => `${s.x},${s.y}`));
          await this.room.storage.put("mapConfig", newConfig);

          // Validate player positions against new collision
          for (const [userId, player] of this.players) {
            if (!this.isWalkable(player.x, player.y)) {
              const spawn = this.randomSpawn();
              player.x = spawn.x;
              player.y = spawn.y;
              this.room.storage.put(`player:${userId}`, player);
              const prevSeat = this.seatedAt.get(userId);
              if (prevSeat) {
                this.occupiedSeats.delete(prevSeat);
                this.seatedAt.delete(userId);
              }
            }
          }

          // Broadcast map reload + re-sync players
          this.room.broadcast(JSON.stringify({ type: "map_reload", map: newConfig.mapJson }));
          this.room.broadcast(JSON.stringify({ type: "sync", players: [...this.players.values()] }));

          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        } catch {
          return new Response(
            JSON.stringify({ error: "Failed to reload" }),
            { status: 500, headers: corsHeaders },
          );
        }
      }
    }

    return new Response("Not found", { status: 404 });
  }
}

