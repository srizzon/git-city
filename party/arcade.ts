import type { Party, Connection, ConnectionContext } from "partykit/server";
import { checkProfanity } from "glin-profanity";

// ─── Inline shared constants (party/ can't use @/ alias) ──────
const GRID_COLS = 30;
const GRID_ROWS = 22;

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
  | { type: "avatar"; id: string; sprite_id: number };

// ─── Collision data (generated from public/maps/lobby.json) ───
// To regenerate: node scripts/generate-lobby-map.mjs then copy COLLISION array
// 0 = walkable, 1 = blocked
const COLLISION = [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,1,1,0,1,1,0,0,0,1,0,0,0,0,0,0,1,0,0,0,0,1,1,0,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,1,1,1,0,1,1,1,0,0,0,0,0,0,0,0,0,0,1,1,1,0,1,1,1,0,0,1,1,1,1,1,1,1,0,1,1,1,0,0,0,0,0,0,0,0,0,0,1,1,1,0,1,1,1,0,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,1,1,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,1,1,0,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1];
const SPAWNS = [{ x: 13, y: 21 }, { x: 14, y: 21 }, { x: 15, y: 21 }, { x: 16, y: 21 }];

// Valid seat positions (from lobby.json objects — seats + PC workstations)
const SEATS = [
  // Seats (sofas/chairs)
  { x: 12, y: 11 }, { x: 14, y: 11 }, { x: 16, y: 11 },
  { x: 4, y: 19 }, { x: 6, y: 19 },
  // PC workstations
  { x: 4, y: 5 }, { x: 8, y: 5 }, { x: 21, y: 5 }, { x: 25, y: 5 },
];
const SEAT_SET = new Set(SEATS.map(s => `${s.x},${s.y}`));

function seatKey(x: number, y: number): string { return `${x},${y}`; }

function isWalkable(x: number, y: number): boolean {
  if (x < 0 || x >= GRID_COLS || y < 0 || y >= GRID_ROWS) return false;
  return COLLISION[y * GRID_COLS + x] === 0;
}

function randomSpawn(): { x: number; y: number } {
  return SPAWNS[Math.floor(Math.random() * SPAWNS.length)];
}

// ─── Rate limiting ────────────────────────────────────────────
const MAX_PLAYERS = 50;
const MOVE_INTERVAL_MS = 100; // max 10 moves/sec
const CHAT_INTERVAL_MS = 1000; // max 1 chat/sec
const SIT_INTERVAL_MS = 500; // max 2 sit/stand/sec
const AVATAR_INTERVAL_MS = 2000; // max 1 avatar change/2sec
const MAX_SPRITE_ID = 5;
const CHAT_MAX_LENGTH = 100;
const SPAM_WINDOW_MS = 10_000; // 10s window for spam detection
const SPAM_MAX_DUPLICATES = 3; // max same message in window
const MUTE_STRIKES_THRESHOLD = 5; // blocked messages before mute
const MUTE_STRIKES_WINDOW_MS = 60_000; // 1min window for strikes
const MUTE_DURATIONS_MS = [30_000, 120_000, 300_000]; // 30s, 2min, 5min (progressive)
const CHAT_LOG_MAX = 30; // recent messages kept in memory for chat log

// ─── Chat filter ─────────────────────────────────────────────
// 1. Profanity — glin-profanity: EN + PT-BR, leetspeak, unicode homoglyphs, char repetition
const PROFANITY_CONFIG = {
  allLanguages: true,
  detectLeetspeak: true,
  leetspeakLevel: "aggressive" as const,
  normalizeUnicode: true,
  cacheResults: true,
  maxCacheSize: 500,
};

// 2. URLs — block links (anti-scam/phishing)
const URL_PATTERN = /(?:https?:\/\/|www\.)\S+|[\w-]+\.(?:com|net|org|io|gg|xyz|co|me|dev|app|link|click|info|biz|ru|cn|tk|ml|ga|cf|gq|top|pw|ws|tv|cc|ly|to|sh|be|gl)\b/i;

// 3. Scam phrases — custom blocklist
const SCAM_PHRASES = [
  "free nitro", "free robux", "steam gift", "claim reward", "click here",
  "crypto airdrop", "send me", "dm me for", "double your",
  "kys", "kill yourself", "neck yourself",
];
const SCAM_RE = new RegExp(
  SCAM_PHRASES.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
  "i",
);

// 4. Spam patterns — character flooding, excessive caps
const CHAR_FLOOD_RE = /(.)\1{6,}/;
const MAX_CAPS_RATIO = 0.7;
const MIN_CAPS_LENGTH = 8;

function filterChat(text: string): { filtered: string; blocked: boolean } {
  // Block URLs
  if (URL_PATTERN.test(text)) return { filtered: text, blocked: true };
  // Block scam phrases
  if (SCAM_RE.test(text)) return { filtered: text, blocked: true };
  // Block profanity (EN + PT-BR, leetspeak, unicode)
  const result = checkProfanity(text, PROFANITY_CONFIG);
  if (result.containsProfanity) return { filtered: text, blocked: true };

  let cleaned = text;

  // Collapse character flooding: "heeeeello" → "heello"
  if (CHAR_FLOOD_RE.test(cleaned)) {
    cleaned = cleaned.replace(/(.)\1{3,}/g, "$1$1$1");
  }

  // Normalize excessive caps
  if (cleaned.length >= MIN_CAPS_LENGTH) {
    const upper = cleaned.replace(/[^A-Z]/g, "").length;
    if (upper / cleaned.length > MAX_CAPS_RATIO) {
      cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
    }
  }

  return { filtered: cleaned, blocked: false };
}

// ─── Mute tracking ───────────────────────────────────────────
interface MuteState {
  strikes: number[]; // timestamps of blocked messages
  muteCount: number; // how many times muted (for progressive duration)
  mutedUntil: number; // timestamp when mute expires (0 = not muted)
}

// ─── Server ───────────────────────────────────────────────────
export default class ArcadeServer implements Party.Server {
  options: Party.ServerOptions = { hibernate: true };

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

  // Restore player state from storage after hibernation wake
  async onStart() {
    const stored = await this.room.storage.list<PlayerState>({ prefix: "player:" });
    for (const [key, player] of stored) {
      const userId = key.slice("player:".length);
      this.players.set(userId, player);
    }
    // Rebuild occupied seats from stored players
    // (seats are lost on hibernate but players sitting are still at seat coords)
  }

  // ── Auth: verify Supabase JWT before allowing connection ────
  static async onBeforeConnect(
    request: Party.Request,
    lobby: Party.Lobby,
  ) {
    const url = new URL(request.url);
    const token = url.searchParams.get("token");
    if (!token) {
      return new Response("Missing token", { status: 401 });
    }

    // Extract sprite_id from query params
    const rawSpriteId = url.searchParams.get("sprite_id");
    let spriteId = -1;
    if (rawSpriteId !== null) {
      const parsed = parseInt(rawSpriteId, 10);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= MAX_SPRITE_ID) {
        spriteId = parsed;
      }
    }

    try {
      // Verify token by calling Supabase auth API directly
      // Works with any signing algorithm (HS256, RS256)
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
      request.headers.set(
        "x-user-meta",
        JSON.stringify(user.user_metadata ?? {}),
      );
      request.headers.set("x-sprite-id", String(spriteId));

      return request;
    } catch {
      return new Response("Auth failed", { status: 401 });
    }
  }

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

    // Enforce max players (duplicates replacing themselves don't count)
    if (!isDuplicate && this.players.size >= MAX_PLAYERS) {
      conn.close(4001, "room full");
      return;
    }

    const spawn = randomSpawn();
    const player: PlayerState = {
      id: userId,
      github_login:
        (meta.user_name as string) ??
        (meta.preferred_username as string) ??
        "anon",
      avatar_url: (meta.avatar_url as string) ?? "",
      sprite_id: (() => {
        const raw = parseInt(ctx.request.headers.get("x-sprite-id") ?? "", 10);
        return !isNaN(raw) && raw >= 0 && raw <= MAX_SPRITE_ID ? raw : Math.floor(Math.random() * (MAX_SPRITE_ID + 1));
      })(),
      x: spawn.x,
      y: spawn.y,
      dir: "up",
    };

    conn.setState({ userId });
    this.players.set(userId, player);
    this.room.storage.put(`player:${userId}`, player);

    // Send full state to new player
    const syncMsg: ServerMsg = {
      type: "sync",
      players: [...this.players.values()],
    };
    conn.send(JSON.stringify(syncMsg));

    // Send recent chat history
    if (this.chatLog.length > 0) {
      const historyMsg: ServerMsg = { type: "chat_history", entries: this.chatLog };
      conn.send(JSON.stringify(historyMsg));
    }

    // Broadcast join to everyone else
    const joinMsg: ServerMsg = { type: "join", player };
    this.room.broadcast(JSON.stringify(joinMsg), [conn.id]);
  }

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

      if (!isWalkable(nx, ny)) {
        // Turn to face the wall but don't move
        player.dir = dir;
        this.room.storage.put(`player:${userId}`, player);
        const moveMsg: ServerMsg = {
          type: "move",
          id: userId,
          x: player.x,
          y: player.y,
          dir,
        };
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
      if (x < 0 || x >= GRID_COLS || y < 0 || y >= GRID_ROWS) return;

      // Verify it's a valid seat position
      const key = seatKey(x, y);
      if (!SEAT_SET.has(key)) return;

      // Verify seat is not already occupied
      if (this.occupiedSeats.has(key)) return;

      // Verify player is adjacent (max 1 tile away) to the seat
      const dx = Math.abs(player.x - x);
      const dy = Math.abs(player.y - y);
      if (dx > 1 || dy > 1) return;

      // If player was already seated elsewhere, free that seat first
      const prevSeat = this.seatedAt.get(userId);
      if (prevSeat) this.occupiedSeats.delete(prevSeat);

      // Occupy the new seat
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

      // Free the seat
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

      // Check mute status
      const mute = this.muteStates.get(userId);
      if (mute && mute.mutedUntil > now) {
        // Still muted — silent drop, sender sees nothing
        return;
      }

      const raw =
        typeof msg.text === "string" ? msg.text.trim().slice(0, CHAT_MAX_LENGTH) : "";
      if (raw.length === 0) return;

      // Content filter (profanity, URLs, scam phrases, caps, flooding)
      const { filtered, blocked } = filterChat(raw);

      if (blocked) {
        // Add strike for auto-mute
        this.addStrike(userId, now);
        // Silent moderation: sender sees their own message, nobody else does
        const silentMsg: ServerMsg = { type: "chat", id: userId, text: raw };
        sender.send(JSON.stringify(silentMsg));
        return;
      }

      // Spam detection (repeated messages in window)
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

      // Append to chat log buffer
      this.chatLog.push({ username: player.github_login, text: filtered, ts: now });
      if (this.chatLog.length > CHAT_LOG_MAX) this.chatLog.shift();
    }
  }

  private addStrike(userId: string, now: number) {
    const state = this.muteStates.get(userId) ?? { strikes: [], muteCount: 0, mutedUntil: 0 };
    // Only keep strikes within the window
    state.strikes = state.strikes.filter((ts) => now - ts < MUTE_STRIKES_WINDOW_MS);
    state.strikes.push(now);

    if (state.strikes.length >= MUTE_STRIKES_THRESHOLD) {
      // Apply mute with progressive duration
      const duration = MUTE_DURATIONS_MS[Math.min(state.muteCount, MUTE_DURATIONS_MS.length - 1)];
      state.mutedUntil = now + duration;
      state.muteCount++;
      state.strikes = [];
    }

    this.muteStates.set(userId, state);
  }

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
    // Free any occupied seat
    const prevSeat = this.seatedAt.get(userId);
    if (prevSeat) {
      this.occupiedSeats.delete(prevSeat);
      this.seatedAt.delete(userId);
    }
    // Keep muteStates — don't let reconnect reset mute

    const leaveMsg: ServerMsg = { type: "leave", id: userId };
    this.room.broadcast(JSON.stringify(leaveMsg));
  }

  // ── HTTP: GET /parties/main/lobby → player count ────────────
  async onRequest(request: Party.Request) {
    if (request.method === "GET") {
      return new Response(JSON.stringify({ count: this.players.size }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
    return new Response("Not found", { status: 404 });
  }
}

ArcadeServer satisfies Party.Worker;
