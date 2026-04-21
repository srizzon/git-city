// ─── Avatar config (legacy — arcade_avatars table) ────────────
export interface AvatarConfig {
  sprite_id: number;
}

// ─── Avatar loadout (new — arcade_avatar_loadouts table) ──────
export interface AvatarLoadout {
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

// ─── Directions ───────────────────────────────────────────────
export type Direction = "up" | "down" | "left" | "right";

// ─── Player state (synced via PartyKit) ───────────────────────
export interface PlayerState {
  id: string;
  github_login: string;
  avatar_url: string;
  sprite_id: number;
  loadout?: AvatarLoadout;
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
  | { type: "avatar"; sprite_id: number }
  | { type: "loadout"; loadout: AvatarLoadout }
  | { type: "game_start"; game: string }
  | { type: "game_stop"; game: string };

// ─── Room info (for room browser) ────────────────────────────
export interface RoomInfo {
  slug: string;
  name: string;
  playerCount: number;
  maxPlayers: number;
  roomType: string;
}

// ─── Arcade game result (10s challenge) ──────────────────────
export interface GameResult {
  diff_ms: number;
  best_ms: number;
  attempts: number;
  is_new_record: boolean;
  rank: number | null;
  milestones_earned: string[];
  px_earned: number;
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
  | { type: "loadout"; id: string; loadout: AvatarLoadout }
  | { type: "map_reload"; map: Record<string, unknown> }
  | { type: "game_ack"; game: string }
  | { type: "game_result"; game: string; result: GameResult };
