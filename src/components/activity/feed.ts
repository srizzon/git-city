// Shared, framework-agnostic helpers for the City Activity experience.
// Pure functions only (no JSX / no "use client") so both the ambient Pulse
// and the Hub can import them freely.

export interface FeedEvent {
  id: string;
  event_type: string;
  actor_id: number | null;
  target_id: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
  actor: FeedDev | null;
  target: FeedDev | null;
}

export interface FeedDev {
  login: string;
  avatar_url: string | null;
  level?: number | null;
  rank?: number | null;
}

// ─── Category metadata (drives color + tag) ──────────────────

export type FeedCategory =
  | "raid"
  | "social"
  | "progress"
  | "streak"
  | "cosmetic"
  | "new"
  | "visit"
  | "misc";

export const CATEGORY_COLOR: Record<FeedCategory, string> = {
  raid: "#ef4444",
  social: "#c8e64a",
  progress: "#ffd700",
  streak: "#fb923c",
  cosmetic: "#a78bfa",
  new: "#60a5fa",
  visit: "#22d3ee",
  misc: "#94a3b8",
};

export interface FeedMeta {
  category: FeedCategory;
  label: string;
  color: string;
}

export function eventMeta(e: FeedEvent): FeedMeta {
  const m = (category: FeedCategory, label: string): FeedMeta => ({
    category,
    label,
    color: CATEGORY_COLOR[category],
  });

  switch (e.event_type) {
    case "raid_success":
      return m("raid", "RAID");
    case "raid_failed":
      return m("raid", "DEFENSE");
    case "kudos_given":
      return m("social", "KUDOS");
    case "gift_sent":
      return m("social", "GIFT");
    case "referral":
      return m("social", "REFERRAL");
    case "achievement_unlocked":
      return m("progress", "TROPHY");
    case "github_star_verified":
      return m("progress", "STAR");
    case "rank_up":
      return m("progress", "RANK");
    case "leaderboard_change":
      return m("progress", "TOP");
    case "drop_pulled":
      return m("progress", "DROP");
    case "dailies_completed":
      return m("progress", "MISSIONS");
    case "streak_checkin":
      return m("streak", "STREAK");
    case "item_equipped":
      return m("cosmetic", "EQUIP");
    case "item_purchased":
      return m("cosmetic", "SHOP");
    case "dev_joined":
      return m("new", "NEW");
    case "building_claimed":
      return m("new", "CLAIM");
    case "visit_milestone":
      return m("visit", "VISITS");
    case "dev_highlight":
      return m("misc", "HIGHLIGHT");
    default:
      return m("misc", "CITY");
  }
}

// ─── Login resolution ────────────────────────────────────────

export function actorLogin(e: FeedEvent): string | null {
  const meta = e.metadata ?? {};
  return (
    e.actor?.login ??
    (meta.login as string) ??
    (meta.giver_login as string) ??
    (meta.attacker_login as string) ??
    (meta.referrer_login as string) ??
    null
  );
}

export function targetLogin(e: FeedEvent): string | null {
  const meta = e.metadata ?? {};
  return (
    e.target?.login ??
    (meta.receiver_login as string) ??
    (meta.defender_login as string) ??
    (meta.referred_login as string) ??
    null
  );
}

// Pick the avatar that matches a given login, falling back gracefully.
export function avatarFor(e: FeedEvent, login: string | null): string | null {
  if (!login) return e.actor?.avatar_url ?? e.target?.avatar_url ?? null;
  const l = login.toLowerCase();
  if (e.actor?.login?.toLowerCase() === l) return e.actor.avatar_url;
  if (e.target?.login?.toLowerCase() === l) return e.target.avatar_url;
  return e.actor?.avatar_url ?? e.target?.avatar_url ?? null;
}

// Resolve the full dev record (avatar, level, rank) for a given login.
export function devFor(e: FeedEvent, login: string | null): FeedDev | null {
  if (!login) return e.actor ?? e.target ?? null;
  const l = login.toLowerCase();
  if (e.actor?.login?.toLowerCase() === l) return e.actor;
  if (e.target?.login?.toLowerCase() === l) return e.target;
  return e.actor ?? e.target ?? null;
}

// Primary login a row should navigate to (the "other" person from the
// viewer's perspective when possible).
export function primaryLogin(e: FeedEvent, viewerLogin?: string | null): string | null {
  const viewer = viewerLogin?.toLowerCase();
  const actor = actorLogin(e);
  const target = targetLogin(e);
  if (viewer && actor?.toLowerCase() === viewer && target) return target;
  return actor ?? target;
}

// ─── Inline reciprocity action ───────────────────────────────

export type FeedAction =
  | { kind: "counter_attack"; login: string }
  | { kind: "kudos_back"; login: string };

export function feedAction(e: FeedEvent, viewerLogin?: string | null): FeedAction | null {
  const viewer = viewerLogin?.toLowerCase();
  if (!viewer) return null;

  const actor = actorLogin(e);
  const target = targetLogin(e);
  const targetIsViewer = target?.toLowerCase() === viewer;

  switch (e.event_type) {
    case "raid_success":
    case "raid_failed":
      if (targetIsViewer && actor) return { kind: "counter_attack", login: actor };
      return null;
    case "kudos_given":
    case "gift_sent":
    case "referral":
      if (targetIsViewer && actor) return { kind: "kudos_back", login: actor };
      return null;
    default:
      return null;
  }
}

// ─── Text ────────────────────────────────────────────────────

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Human-readable line. When `viewerLogin` is given, the viewer renders as
// "you" so personalized feeds read naturally. No emojis.
export function formatEvent(e: FeedEvent, viewerLogin?: string | null): string {
  const meta = e.metadata ?? {};
  const viewer = viewerLogin?.toLowerCase() ?? null;

  const who = (login: string | null | undefined, fallback = "someone"): string => {
    if (!login) return fallback;
    if (viewer && login.toLowerCase() === viewer) return "you";
    return `@${login}`;
  };

  const actor = actorLogin(e);
  const target = targetLogin(e);
  let line: string;

  switch (e.event_type) {
    case "achievement_unlocked":
      if (meta.count && (meta.count as number) > 1)
        line = `${who(actor)} unlocked ${meta.count} achievements`;
      else line = `${who(actor)} unlocked "${meta.achievement_name ?? "an achievement"}"`;
      break;
    case "building_claimed":
      line = `${who(actor)} claimed their building`;
      break;
    case "item_purchased":
      line = `${who(actor)} bought ${meta.item_id ?? "an item"}`;
      break;
    case "kudos_given":
      line = `${who(actor)} gave kudos to ${who(target)}`;
      break;
    case "referral":
      line = `${who(actor)} brought ${who(target)} to the city`;
      break;
    case "gift_sent":
      line = `${who(actor)} gifted ${meta.item_id ?? "an item"} to ${who(target)}`;
      break;
    case "dev_joined":
      line = `${who(actor)} joined the city`;
      break;
    case "visit_milestone":
      line = `${who(target ?? actor)}'s building got ${meta.visit_count ?? "many"} visits today`;
      break;
    case "item_equipped":
      line = `${who(actor)} equipped ${meta.item_id ?? "an item"}`;
      break;
    case "rank_up":
      line = `${who(actor)} climbed to #${meta.new_rank ?? "?"}`;
      break;
    case "leaderboard_change":
      line = `${who(actor)} entered the top ${meta.position ?? 3}`;
      break;
    case "raid_success":
      line = `${who(actor)} raided ${who(target)}'s building`;
      break;
    case "raid_failed":
      line = `${who(target)} defended against ${who(actor)}`;
      break;
    case "streak_checkin":
      line = `${who(actor)} checked in (${meta.streak ?? "?"}-day streak)`;
      break;
    case "github_star_verified":
      line = `${who(actor)} unlocked the GitHub Star`;
      break;
    case "drop_pulled":
      line = `${who(actor)} pulled a reward drop`;
      break;
    case "dailies_completed":
      line = `${who(actor)} completed today's missions`;
      break;
    case "dev_highlight": {
      const subject = who(actor);
      switch (meta.highlight) {
        case "contributions":
          line = `${subject} has ${Number(meta.value).toLocaleString()} contributions`;
          break;
        case "stars":
          line = `${subject} has ${Number(meta.value).toLocaleString()} stars across their repos`;
          break;
        case "rank":
          line = `${subject} ranked #${meta.value} in the city`;
          break;
        case "streak":
          line = `${subject} is on a ${meta.value}-day commit streak`;
          break;
        case "language":
          line = `${subject} builds with ${meta.value}`;
          break;
        case "repos":
          line = `${subject} has ${meta.value} public repos`;
          break;
        default:
          line = `${subject} is in the city`;
      }
      break;
    }
    default:
      line = `${who(actor)} is active in the city`;
  }

  return capitalize(line);
}

// ─── Time ────────────────────────────────────────────────────

// Merge event lists while keeping the first occurrence of each id. Pagination
// ties on created_at and the today-seed vs. cursor fetch can surface the same
// event twice; deduping keeps React keys unique.
export function dedupeById(events: FeedEvent[]): FeedEvent[] {
  const seen = new Set<string>();
  const out: FeedEvent[] = [];
  for (const e of events) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e);
  }
  return out;
}

export function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// Bucket an event into a time group for the Hub.
export type TimeBucket = "now" | "today" | "week" | "older";

export function timeBucket(dateStr: string): TimeBucket {
  const d = new Date(dateStr).getTime();
  const diff = Date.now() - d;
  if (diff < 3600_000) return "now";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (d >= today.getTime()) return "today";
  if (diff < 7 * 86400_000) return "week";
  return "older";
}

export const BUCKET_LABEL: Record<TimeBucket, string> = {
  now: "HAPPENING NOW",
  today: "EARLIER TODAY",
  week: "THIS WEEK",
  older: "EARLIER",
};
