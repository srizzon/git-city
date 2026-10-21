// ─── Quick reactions ────────────────────────────────────────
// Keys 1–6 pop an emoji over your car for everyone in the drive room, like
// Rocket League's quick chat: fixed slots, one key, no typing. Shared by the
// party (validation, rate limit) and the client, so relative imports only.

export const EMOTES = ["😂", "🔥", "👋", "😡", "👑", "💀"] as const;
/** How long a bubble stays over the car (ms). */
export const EMOTE_MS = 2200;
/** One reaction per driver this often, at most (ms); the server drops the rest. */
export const EMOTE_MIN_MS = 600;
/** Typed chat (Enter): its longest message, as the room's rules cut it (lib/chat-filter), and how long its bubble stays (ms). */
export const CHAT_MAX = 100;
export const CHAT_MS = 5000;
/** Lines in the HUD's reaction log. */
export const LOG_LINES = 5;

export function validEmote(e: unknown): e is number {
  return typeof e === "number" && Number.isInteger(e) && e >= 0 && e < EMOTES.length;
}

/** The slot for a key press (Digit1…Digit6, numpad too), or null. */
export function emoteForKey(code: string): number | null {
  const m = /^(?:Digit|Numpad)([1-9])$/.exec(code);
  if (!m) return null;
  const i = Number(m[1]) - 1;
  return i < EMOTES.length ? i : null;
}
