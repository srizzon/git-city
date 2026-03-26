// ─── Avatar config (persisted in arcade_avatars table) ────────
export interface AvatarConfig {
  sprite_id: number;
}

// ─── Directions ───────────────────────────────────────────────
export type Direction = "up" | "down" | "left" | "right";

// ─── Player state (synced via PartyKit) ───────────────────────
export interface PlayerState {
  id: string;
  github_login: string;
  avatar_url: string;
  sprite_id: number;
  x: number; // tile col
  y: number; // tile row
  dir: Direction;
}

// ─── Chat bubble (client-only, ephemeral) ─────────────────────
export interface ChatBubble {
  id: string; // player id
  text: string;
  timer: number; // seconds remaining
}

// ─── Chat log entry (persisted in server memory) ──────────────
export interface ChatLogEntry {
  username: string;
  text: string;
  ts: number; // timestamp (ms)
}

// ─── Protocol: Client → Server ────────────────────────────────
export type ClientMsg =
  | { type: "move"; dir: Direction }
  | { type: "chat"; text: string }
  | { type: "sit"; x: number; y: number; dir: Direction }
  | { type: "stand" }
  | { type: "avatar"; sprite_id: number };

// ─── Room info (for room browser) ────────────────────────────
export interface RoomInfo {
  slug: string;
  name: string;
  playerCount: number;
  maxPlayers: number;
  roomType: string;
}

// ─── Protocol: Server → Client ────────────────────────────────
export type ServerMsg =
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
