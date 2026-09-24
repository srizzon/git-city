// ─── League scoring (pure) ──────────────────────────────────
// The week runs Monday 00:00 UTC → Sunday 23:59:59 UTC. Only active members
// score. Everything here is pure so it can be unit-tested; standings.ts loads
// the rows and calls into this module.

export type ScoringMode = "xp" | "contributions";

export const CODE_POINTS_PER_CONTRIBUTION = 5;
export const CODE_DAILY_CONTRIBUTION_CAP = 20;
export const GLOBAL_MIN_ACTIVE_MEMBERS = 3;

/**
 * Repeatable XP sources that count toward the weekly race, with a daily cap.
 * Sources listed together share one cap. Anything not listed (github,
 * league_win, achievement, emblem, job_*, referral*, survey, event_*, …) is
 * excluded: one-off grants are too large and would decide a week alone.
 */
export const SOURCE_DAILY_CAPS: { sources: readonly string[]; cap: number }[] = [
  { sources: ["checkin"], cap: 10 },
  { sources: ["dailies"], cap: 25 },
  { sources: ["kudos_given", "kudos_received"], cap: 15 },
  { sources: ["visit"], cap: 20 },
  { sources: ["fly"], cap: 30 },
  { sources: ["raid_win", "raid_loss", "raid_defend"], cap: 150 },
  { sources: ["force_push"], cap: 50 },
  { sources: ["drop_pull"], cap: 25 },
];

const SOURCE_GROUP = new Map<string, number>();
SOURCE_DAILY_CAPS.forEach((g, i) => g.sources.forEach((s) => SOURCE_GROUP.set(s, i)));

export interface ContributionDay {
  day: string; // YYYY-MM-DD (UTC)
  contributions: number;
}

export interface XpRow {
  source: string;
  amount: number;
  created_at: string; // ISO timestamp
}

// ─── Week boundaries ────────────────────────────────────────

/** Monday 00:00 UTC of the week containing `date`. */
export function weekStart(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dow = d.getUTCDay(); // 0 = Sunday
  const back = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - back);
  return d;
}

/** Monday 00:00 UTC of the following week (exclusive end). */
export function weekEnd(start: Date): Date {
  const d = new Date(start);
  d.setUTCDate(d.getUTCDate() + 7);
  return d;
}

/** YYYY-MM-DD for a UTC date. */
export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The 7 YYYY-MM-DD days of the week starting at `start`. */
export function weekDays(start: Date): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    return isoDay(d);
  });
}

// ─── Scores ─────────────────────────────────────────────────

/** GitHub contributions per day, capped at 20/day, 5 points each. */
export function codePoints(days: ContributionDay[]): number {
  let total = 0;
  for (const d of days) {
    const c = Math.max(0, Math.floor(d.contributions));
    total += Math.min(c, CODE_DAILY_CONTRIBUTION_CAP) * CODE_POINTS_PER_CONTRIBUTION;
  }
  return total;
}

/** Game XP from repeatable sources, each source group capped per UTC day. */
export function gameXp(rows: XpRow[]): number {
  const buckets = new Map<string, number>();
  for (const r of rows) {
    const group = SOURCE_GROUP.get(r.source);
    if (group === undefined || r.amount <= 0) continue;
    const key = `${r.created_at.slice(0, 10)}:${group}`;
    buckets.set(key, (buckets.get(key) ?? 0) + r.amount);
  }
  let total = 0;
  for (const [key, sum] of buckets) {
    const group = Number(key.slice(key.indexOf(":") + 1));
    total += Math.min(sum, SOURCE_DAILY_CAPS[group].cap);
  }
  return total;
}

export interface MemberScore {
  codePoints: number;
  gameXp: number;
  total: number;
}

export function memberScore(mode: ScoringMode, days: ContributionDay[], xpRows: XpRow[]): MemberScore {
  const cp = codePoints(days);
  const xp = mode === "xp" ? gameXp(xpRows) : 0;
  return { codePoints: cp, gameXp: xp, total: cp + xp };
}

/**
 * Global company score: average XP-mode total per active member, so size
 * doesn't win by itself. Null when the league has fewer than 3 active members.
 */
export function globalScore(memberTotals: number[]): number | null {
  if (memberTotals.length < GLOBAL_MIN_ACTIVE_MEMBERS) return null;
  const sum = memberTotals.reduce((a, b) => a + b, 0);
  return Math.round(sum / memberTotals.length);
}

// ─── Standings ──────────────────────────────────────────────

export interface StandingInput extends MemberScore {
  developer_id: number;
  joined_at: string | null;
}

export type Standing<T extends StandingInput = StandingInput> = T & { rank: number };

/**
 * Sort by total desc. Ties: more code points first, then earlier joined_at.
 * Ranks are 1-based and unique (the tie-break always resolves).
 */
export function rankStandings<T extends StandingInput>(entries: T[]): Standing<T>[] {
  const joined = (e: T) => (e.joined_at ? Date.parse(e.joined_at) : Number.MAX_SAFE_INTEGER);
  return [...entries]
    .sort(
      (a, b) =>
        b.total - a.total ||
        b.codePoints - a.codePoints ||
        joined(a) - joined(b) ||
        a.developer_id - b.developer_id,
    )
    .map((e, i) => ({ ...e, rank: i + 1 }));
}

// ─── Overtakes ──────────────────────────────────────────────

export interface Overtake {
  developerId: number;
  overtakerLogin: string;
  gap: number;
  newRank: number;
}

/**
 * Members someone passed between two standings snapshots. Only reported when
 * the member was in the top 5 or actually dropped a rank. The overtaker is
 * the closest passer above them.
 */
export function detectOvertakes<T extends Standing & { login: string }>(prev: T[], next: T[]): Overtake[] {
  const prevRank = new Map(prev.map((s) => [s.developer_id, s.rank]));
  const out: Overtake[] = [];
  for (const me of next) {
    const was = prevRank.get(me.developer_id);
    if (!was) continue;
    if (!(was <= 5 || me.rank > was)) continue;
    const passers = next.filter((o) => {
      const oWas = prevRank.get(o.developer_id);
      return o.rank < me.rank && oWas !== undefined && oWas > was && o.total > me.total;
    });
    const closest = passers[passers.length - 1];
    if (!closest) continue;
    out.push({ developerId: me.developer_id, overtakerLogin: closest.login, gap: closest.total - me.total, newRank: me.rank });
  }
  return out;
}
