import type { Party, Connection, ConnectionContext } from "partykit/server";
import { checkProfanity } from "glin-profanity";

// ─── Types (inline — party/ can't use @/ alias) ─────────────
type Direction = "up" | "down" | "left" | "right";

interface PlayerState {
  id: string;
  github_login: string;
  avatar_url: string;
  sprite_id: number;
  x: number;
  y: number;
  dir: Direction;
}

type ClientMsg =
  | { type: "move"; dir: Direction }
  | { type: "chat"; text: string }
  | { type: "sit"; x: number; y: number; dir: Direction }
  | { type: "stand" }
  | { type: "avatar"; sprite_id: number };

interface ChatLogEntry {
  username: string;
  text: string;
  ts: number;
}

type ServerMsg =
  | { type: "sync"; players: PlayerState[] }
  | { type: "join"; player: PlayerState }
  | { type: "leave"; id: string }
  | { type: "move"; id: string; x: number; y: number; dir: Direction }
  | { type: "chat"; id: string; text: string }
  | { type: "chat_history"; entries: ChatLogEntry[] }
  | { type: "sit"; id: string; x: number; y: number; dir: Direction }
  | { type: "stand"; id: string; x: number; y: number }
  | { type: "avatar"; id: string; sprite_id: number }
  | { type: "map_reload"; map: Record<string, unknown> };

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
    layers: { collision: number[] };
    objects: Array<{ type: string; x: number; y: number; dir?: string }>;
    [key: string]: unknown;
  };
}

function parseMapConfig(row: ArcadeRoomRow): MapConfig {
  const map = row.map_json;
  const seats = map.objects
    .filter((o) => o.type === "seat" || o.type === "pc")
    .map((o) => ({ x: o.x, y: o.y }));
  const spawns = map.objects
    .filter((o) => o.type === "spawn")
    .map((o) => ({ x: o.x, y: o.y }));
  return {
    name: map.name,
    width: map.width,
    height: map.height,
    tileSize: map.tileSize,
    collision: map.layers.collision,
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
const MOVE_INTERVAL_MS = 100;
const CHAT_INTERVAL_MS = 1000;
const SIT_INTERVAL_MS = 500;
const AVATAR_INTERVAL_MS = 2000;
const MAX_SPRITE_ID = 5;
const CHAT_MAX_LENGTH = 100;
const SPAM_WINDOW_MS = 10_000;
const SPAM_MAX_DUPLICATES = 3;
const MUTE_STRIKES_THRESHOLD = 5;
const MUTE_STRIKES_WINDOW_MS = 60_000;
const MUTE_DURATIONS_MS = [30_000, 120_000, 300_000];
const CHAT_LOG_MAX = 30;

// ─── Chat filter ─────────────────────────────────────────────
const PROFANITY_CONFIG = {
  allLanguages: true,
  detectLeetspeak: true,
  leetspeakLevel: "aggressive" as const,
  normalizeUnicode: true,
  cacheResults: true,
  maxCacheSize: 500,
};

const URL_PATTERN = /(?:https?:\/\/|www\.)\S+|[\w-]+\.(?:com|net|org|io|gg|xyz|co|me|dev|app|link|click|info|biz|ru|cn|tk|ml|ga|cf|gq|top|pw|ws|tv|cc|ly|to|sh|be|gl)\b/i;

const SCAM_PHRASES = [
  "free nitro", "free robux", "steam gift", "claim reward", "click here",
  "crypto airdrop", "send me", "dm me for", "double your",
  "kys", "kill yourself", "neck yourself",
];
const SCAM_RE = new RegExp(
  SCAM_PHRASES.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
  "i",
);

const CHAR_FLOOD_RE = /(.)\1{6,}/;
const MAX_CAPS_RATIO = 0.7;
const MIN_CAPS_LENGTH = 8;

function filterChat(text: string): { filtered: string; blocked: boolean } {
  if (URL_PATTERN.test(text)) return { filtered: text, blocked: true };
  if (SCAM_RE.test(text)) return { filtered: text, blocked: true };
  const result = checkProfanity(text, PROFANITY_CONFIG);
  if (result.containsProfanity) return { filtered: text, blocked: true };

  let cleaned = text;
  if (CHAR_FLOOD_RE.test(cleaned)) {
    cleaned = cleaned.replace(/(.)\1{3,}/g, "$1$1$1");
  }
  if (cleaned.length >= MIN_CAPS_LENGTH) {
    const upper = cleaned.replace(/[^A-Z]/g, "").length;
    if (upper / cleaned.length > MAX_CAPS_RATIO) {
      cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
    }
  }
  return { filtered: cleaned, blocked: false };
}

// ─── Mute tracking ──────────────────────────────────────────
interface MuteState {
  strikes: number[];
  muteCount: number;
  mutedUntil: number;
}

// ─── Server ─────────────────────────────────────────────────
export default class ArcadeServer implements Party.Server {
  options: Party.ServerOptions = { hibernate: true };

  mapConfig: MapConfig = DEFAULT_MAP;
  seatSet = new Set<string>();

  readonly players = new Map<string, PlayerState>();
  readonly lastMove = new Map<string, number>();
  readonly lastChat = new Map<string, number>();
  readonly lastSit = new Map<string, number>();
  readonly lastAvatar = new Map<string, number>();
  readonly chatHistory = new Map<string, { text: string; ts: number }[]>();
  readonly muteStates = new Map<string, MuteState>();
  readonly occupiedSeats = new Set<string>();
  readonly seatedAt = new Map<string, string>();
  readonly chatLog: ChatLogEntry[] = [];

  constructor(readonly room: Party.Room) {}

  // ── Load config + restore state ────────────────────────────
  async onStart() {
    // 1. Try storage cache (fast, survives hibernation)
    const cached = await this.room.storage.get<MapConfig>("mapConfig");
    if (cached) {
      this.mapConfig = cached;
    } else {
      // 2. Fetch from Supabase
      try {
        const config = await this.fetchMapFromSupabase();
        if (config) {
          this.mapConfig = config;
          await this.room.storage.put("mapConfig", config);
        }
      } catch (err) {
        console.error(`[arcade:${this.room.id}] Failed to load map:`, err);
        // 3. Fallback: DEFAULT_MAP (already set)
      }
    }

    // Rebuild seat set from config
    this.seatSet = new Set(this.mapConfig.seats.map((s) => `${s.x},${s.y}`));

    // Restore players from storage
    const stored = await this.room.storage.list<PlayerState>({ prefix: "player:" });
    for (const [key, player] of stored) {
      const userId = key.slice("player:".length);
      this.players.set(userId, player);

      // Rebuild occupied seats from player positions
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
      const lobbyParty = this.room.context.parties.lobby;
      if (!lobbyParty) return;
      const lobbyRoom = lobbyParty.get("main");
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
  static async onBeforeConnect(
    request: Party.Request,
    lobby: Party.Lobby,
  ) {
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
      const supabaseUrl = lobby.env.NEXT_PUBLIC_SUPABASE_URL as string;
      const supabaseAnonKey = lobby.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

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

    // Update lobby
    this.pingLobby();
  }

  // ── Messages ───────────────────────────────────────────────
  onMessage(message: string, sender: Connection) {
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
      const lastMoveTime = this.lastMove.get(userId) ?? 0;
      if (now - lastMoveTime < MOVE_INTERVAL_MS) return;
      this.lastMove.set(userId, now);

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
        const moveMsg: ServerMsg = { type: "move", id: userId, x: player.x, y: player.y, dir };
        this.room.broadcast(JSON.stringify(moveMsg));
        return;
      }

      player.x = nx;
      player.y = ny;
      player.dir = dir;
      this.room.storage.put(`player:${userId}`, player);
      const moveMsg: ServerMsg = { type: "move", id: userId, x: nx, y: ny, dir };
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

    if (msg.type === "chat") {
      const lastChatTime = this.lastChat.get(userId) ?? 0;
      if (now - lastChatTime < CHAT_INTERVAL_MS) return;
      this.lastChat.set(userId, now);

      const mute = this.muteStates.get(userId);
      if (mute && mute.mutedUntil > now) return;

      const raw = typeof msg.text === "string" ? msg.text.trim().slice(0, CHAT_MAX_LENGTH) : "";
      if (raw.length === 0) return;

      const { filtered, blocked } = filterChat(raw);

      if (blocked) {
        this.addStrike(userId, now);
        const silentMsg: ServerMsg = { type: "chat", id: userId, text: raw };
        sender.send(JSON.stringify(silentMsg));
        return;
      }

      const history = this.chatHistory.get(userId) ?? [];
      const recent = history.filter((h) => now - h.ts < SPAM_WINDOW_MS);
      const dupes = recent.filter((h) => h.text.toLowerCase() === filtered.toLowerCase()).length;
      if (dupes >= SPAM_MAX_DUPLICATES) {
        this.addStrike(userId, now);
        const silentMsg: ServerMsg = { type: "chat", id: userId, text: filtered };
        sender.send(JSON.stringify(silentMsg));
        return;
      }
      recent.push({ text: filtered, ts: now });
      this.chatHistory.set(userId, recent);

      const chatMsg: ServerMsg = { type: "chat", id: userId, text: filtered };
      this.room.broadcast(JSON.stringify(chatMsg));

      this.chatLog.push({ username: player.github_login, text: filtered, ts: now });
      if (this.chatLog.length > CHAT_LOG_MAX) this.chatLog.shift();
      this.room.storage.put("chatLog", this.chatLog);
    }
  }

  private addStrike(userId: string, now: number) {
    const state = this.muteStates.get(userId) ?? { strikes: [], muteCount: 0, mutedUntil: 0 };
    state.strikes = state.strikes.filter((ts) => now - ts < MUTE_STRIKES_WINDOW_MS);
    state.strikes.push(now);

    if (state.strikes.length >= MUTE_STRIKES_THRESHOLD) {
      const duration = MUTE_DURATIONS_MS[Math.min(state.muteCount, MUTE_DURATIONS_MS.length - 1)];
      state.mutedUntil = now + duration;
      state.muteCount++;
      state.strikes = [];
    }

    this.muteStates.set(userId, state);
  }

  // ── Disconnect ─────────────────────────────────────────────
  onClose(conn: Connection) {
    const state = conn.state as { userId?: string } | null;
    const userId = state?.userId ?? conn.id;
    this.players.delete(userId);
    this.room.storage.delete(`player:${userId}`);
    this.lastMove.delete(userId);
    this.lastChat.delete(userId);
    this.lastSit.delete(userId);
    this.lastAvatar.delete(userId);
    this.chatHistory.delete(userId);

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
  async onRequest(request: Party.Request) {
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

ArcadeServer satisfies Party.Worker;
