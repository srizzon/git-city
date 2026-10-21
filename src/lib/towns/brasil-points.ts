// ─── Brasil town: points ────────────────────────────────────
// Whoever moves their state the most governs it. Points come mostly from
// Instagram (a comment a day, a tagged friend who joins, a story tagging the
// account), a little from coding and from the State War's loops; the week's points elect the governors,
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
  /** The State War (removed 2026-10-19): its points already earned still count. */
  paint: 1,
  /** Finishing a race with another signed-in racer (more for winning and records: RACE_POINTS). */
  race: 3,
  /** The week's #1 project (brasil-projects.ts POINTS_FOR_RANK pays 2nd and 3rd less). */
  project: 100,
  /** Knocking down someone's building on the map (SMASH_DAY_CAP a day). */
  smash: 5,
} as const;

/** Most smash points per dev per (Brasília) day: ten buildings. */
export const SMASH_DAY_CAP = 50;

/** Races (lib/towns/brasil-race): what each finish pays, and the day's cap. */
export const RACE_POINTS = {
  finish: 3,
  /** The winner, per other signed-in racer. */
  beat: 3,
  maxBeats: 5,
  /** Paid for the same winner over the same racer this many times a day at most. */
  samePairPerDay: 3,
  /** A new route record, once per route a week. */
  record: 10,
  /** Race points per dev per (Brasília) day. */
  dayCap: 30,
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
  paint: number;
  race: number;
  project: number;
  smash: number;
}

export const emptyBreakdown = (): PointsBreakdown => ({ join: 0, comment: 0, invite: 0, story: 0, coded: 0, vote: 0, paint: 0, race: 0, project: 0, smash: 0 });

export const totalOf = (b: PointsBreakdown) => b.join + b.comment + b.invite + b.story + b.coded + b.vote + b.paint + b.race + b.project + b.smash;

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
