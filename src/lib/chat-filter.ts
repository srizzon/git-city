import { checkProfanity } from "glin-profanity";

// ─── Chat safety ────────────────────────────────────────────
// The rules every typed chat in Git City goes through, the arcade's first:
// links, scams and threats, and profanity in any language (leetspeak too)
// are blocked; floods of one letter and all caps are toned down. Per sender:
// one message a second, no more than three of the same in 10 s, and five
// strikes in a minute (a blocked or repeated message each) mute them for
// 30 s, then 2 min, then 5 min. A blocked message is "shadowed": the sender
// sees it as sent, nobody else does. Server only (parties).

export const CHAT_MAX_LENGTH = 100;
const CHAT_INTERVAL_MS = 1000;
const SPAM_WINDOW_MS = 10_000;
const SPAM_MAX_DUPLICATES = 3;
const MUTE_STRIKES_THRESHOLD = 5;
const MUTE_STRIKES_WINDOW_MS = 60_000;
const MUTE_DURATIONS_MS = [30_000, 120_000, 300_000];

const PROFANITY_CONFIG = {
  allLanguages: true,
  detectLeetspeak: true,
  leetspeakLevel: "aggressive" as const,
  normalizeUnicode: true,
  cacheResults: true,
  maxCacheSize: 500,
};

const URL_PATTERN = /(?:https?:\/\/|www\.)\S+|[\w-]+\.(?:com|net|org|io|gg|xyz|co|me|dev|app|link|click|info|biz|ru|cn|tk|ml|ga|cf|gq|top|pw|ws|tv|cc|ly|to|sh|be|gl|br)\b/i;

const SCAM_PHRASES = [
  "free nitro", "free robux", "steam gift", "claim reward", "click here",
  "crypto airdrop", "send me", "dm me for", "double your",
  "kys", "kill yourself", "neck yourself",
  // The same in Portuguese: the Brasil map's drivers.
  "se mata", "vai se matar", "chama no pv", "chama no privado", "pix pra mim", "manda pix",
];
const SCAM_RE = new RegExp(
  SCAM_PHRASES.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
  "i",
);

const CHAR_FLOOD_RE = /(.)\1{6,}/;
const MAX_CAPS_RATIO = 0.7;
const MIN_CAPS_LENGTH = 8;

export function filterChat(text: string): { filtered: string; blocked: boolean } {
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

interface MuteState {
  strikes: number[];
  muteCount: number;
  mutedUntil: number;
}

export type ChatVerdict =
  /** Too soon, muted or empty: nothing happens. */
  | { kind: "drop" }
  /** Blocked or repeated: only the sender sees `text`. */
  | { kind: "shadow"; text: string }
  | { kind: "send"; text: string };

/** One room's chat rules, keyed by sender (an account, so a reconnect keeps its mute). */
export class ChatGuard {
  private last = new Map<string, number>();
  private history = new Map<string, { text: string; ts: number }[]>();
  private mutes = new Map<string, MuteState>();

  check(sender: string, raw: unknown, now: number): ChatVerdict {
    if (now - (this.last.get(sender) ?? 0) < CHAT_INTERVAL_MS) return { kind: "drop" };
    this.last.set(sender, now);
    const mute = this.mutes.get(sender);
    if (mute && mute.mutedUntil > now) return { kind: "drop" };

    const text = typeof raw === "string" ? raw.trim().slice(0, CHAT_MAX_LENGTH) : "";
    if (text.length === 0) return { kind: "drop" };

    const { filtered, blocked } = filterChat(text);
    if (blocked) {
      this.strike(sender, now);
      return { kind: "shadow", text };
    }
    const recent = (this.history.get(sender) ?? []).filter((h) => now - h.ts < SPAM_WINDOW_MS);
    const dupes = recent.filter((h) => h.text.toLowerCase() === filtered.toLowerCase()).length;
    if (dupes >= SPAM_MAX_DUPLICATES) {
      this.strike(sender, now);
      return { kind: "shadow", text: filtered };
    }
    recent.push({ text: filtered, ts: now });
    this.history.set(sender, recent);
    return { kind: "send", text: filtered };
  }

  /** They left: their pace and repeats go, their mute stays (leaving and coming back doesn't lift it). */
  forget(sender: string) {
    this.last.delete(sender);
    this.history.delete(sender);
  }

  private strike(sender: string, now: number) {
    const state = this.mutes.get(sender) ?? { strikes: [], muteCount: 0, mutedUntil: 0 };
    state.strikes = state.strikes.filter((ts) => now - ts < MUTE_STRIKES_WINDOW_MS);
    state.strikes.push(now);
    if (state.strikes.length >= MUTE_STRIKES_THRESHOLD) {
      state.mutedUntil = now + MUTE_DURATIONS_MS[Math.min(state.muteCount, MUTE_DURATIONS_MS.length - 1)];
      state.muteCount++;
      state.strikes = [];
    }
    this.mutes.set(sender, state);
  }
}
