// ─── Brasil town: points ────────────────────────────────────
// Whoever moves their state the most governs it. Points come mostly from
// Instagram (a comment a day, a tagged friend who joins, a story tagging the
// account) and a little from coding; the week's points elect the governors,
// senators and mayors (brasil-roles.ts). Weeks run Monday 00:00 UTC, Sunday
// 21h in Brasília, like the towns' race. Days (one comment, one story a day)
// run on Brasília time. Pure.

import { weekStart } from "../leagues/scoring";

export const POINTS = {
  join: 20,
  comment: 5,
  invite: 50,
  story: 20,
  coded: 10,
  vote: 10,
} as const;

export type PointKind = keyof typeof POINTS;
/** Kinds stored in brasil_points (coding is read from the standings). */
export type LedgerKind = Exclude<PointKind, "coded">;

/** Most friends one dev is paid for in a week. */
export const INVITES_PER_WEEK = 10;
/** Most @s read from one comment as tagged friends. */
export const TAGS_PER_COMMENT = 5;

/** The first week points count: before it, offices came from contributions. */
export const POINTS_START = "2026-10-19";

const BRT_MS = 3 * 3_600_000;

/** The Brasília calendar day of a moment ("2026-10-19"). */
export function brasiliaDay(at: Date): string {
  return new Date(at.getTime() - BRT_MS).toISOString().slice(0, 10);
}

/** The week (its Monday, UTC) a moment scores in. */
export function pointsWeek(at: Date): string {
  return weekStart(at).toISOString().slice(0, 10);
}

/** An Instagram username: letters, digits, dots and underscores, 30 at most. */
const IG_HANDLE = /@([a-z0-9._]{1,30})/gi;

/**
 * The Instagram accounts a comment tags, as friends: every @ but the
 * account's own, the commenter's and their GitHub login (someone writing
 * their own @ again), at most TAGS_PER_COMMENT, lowercase, once each.
 */
export function taggedFriends(text: string, skip: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  const no = new Set(skip.filter((s): s is string => !!s).map((s) => s.toLowerCase()));
  for (const m of text.matchAll(IG_HANDLE)) {
    const h = m[1].toLowerCase().replace(/\.+$/, "");
    if (!h || no.has(h) || out.includes(h)) continue;
    out.push(h);
    if (out.length >= TAGS_PER_COMMENT) break;
  }
  return out;
}

export interface PointsBreakdown {
  join: number;
  comment: number;
  invite: number;
  story: number;
  coded: number;
  vote: number;
}

export const emptyBreakdown = (): PointsBreakdown => ({ join: 0, comment: 0, invite: 0, story: 0, coded: 0, vote: 0 });

export const totalOf = (b: PointsBreakdown) => b.join + b.comment + b.invite + b.story + b.coded + b.vote;

/**
 * Each dev's week: the ledger's rows plus POINTS.coded for every day they
 * coded (`days`: contributions per day, Mon..Sun). Logins lowercase.
 */
export function weekBreakdowns(
  ledger: readonly { login: string; kind: LedgerKind; points: number }[],
  days: ReadonlyMap<string, readonly number[]>,
): Map<string, PointsBreakdown> {
  const out = new Map<string, PointsBreakdown>();
  const of = (login: string) => {
    const l = login.toLowerCase();
    let b = out.get(l);
    if (!b) out.set(l, (b = emptyBreakdown()));
    return b;
  };
  for (const r of ledger) of(r.login)[r.kind] += r.points;
  for (const [login, d] of days) {
    const coded = d.filter((n) => n > 0).length;
    if (coded) of(login).coded += coded * POINTS.coded;
  }
  return out;
}
