// ─── Brasil town: the presidential election ─────────────────
// The president is voted in, for a term of TERM_DAYS. Anyone on the map can
// run (an admin can add someone too); everyone on the map votes once a term,
// on the site, and can change their vote until it closes. Each term's vote is
// the last week before it starts, all of it on Brasília time (Sunday 21h is
// Monday 00:00 UTC). The first one is short: it opens Friday Oct 23 21h and
// closes on Sunday Oct 25 21h, the day of Brazil's real runoff. Pure.

const DAY = 86_400_000;

/**
 * The presidency is built but off (Sam, 2026-10-19: not launching it yet).
 * Off: no Vote button or panel, no president, the election API and the vote
 * card answer nothing, and voting isn't on the points table. The admin can
 * still line up candidates.
 */
export const PRESIDENCY_ON = false;

/** The first term starts (and its vote closes): Sunday Oct 25 2026, 21h Brasília. */
export const FIRST_TERM = Date.parse("2026-10-26T00:00:00Z");
/** The first vote opens: Friday Oct 23 2026, 21h Brasília. */
export const FIRST_VOTE = Date.parse("2026-10-24T00:00:00Z");
export const TERM_DAYS = 28;
/** Every vote after the first lasts a week. */
export const VOTE_DAYS = 7;
/** A voter's GitHub account must be this old when the vote opens (fresh accounts are fakes). */
export const VOTER_ACCOUNT_DAYS = 30;

export interface Term {
  n: number;
  start: number;
  end: number;
  /** Its vote. */
  opens: number;
  closes: number;
}

export function term(n: number): Term {
  const start = FIRST_TERM + (n - 1) * TERM_DAYS * DAY;
  return { n, start, end: start + TERM_DAYS * DAY, opens: n === 1 ? FIRST_VOTE : start - VOTE_DAYS * DAY, closes: start };
}

export interface ElectionClock {
  /** The term in office (null before the first one). */
  current: Term | null;
  /** The term being run for now: its candidates sign up until its vote closes. */
  next: Term;
  phase: "candidacy" | "voting";
}

export function electionClock(now: number): ElectionClock {
  const n = now < FIRST_TERM ? 0 : Math.floor((now - FIRST_TERM) / (TERM_DAYS * DAY)) + 1;
  const next = term(n + 1);
  return { current: n > 0 ? term(n) : null, next, phase: now >= next.opens ? "voting" : "candidacy" };
}

/**
 * The winner of a closed vote: most votes; a tie goes to whoever reached
 * that count first (their last vote came earlier). Votes for someone not
 * standing (withdrew) don't count. Null when nobody got a vote.
 */
export function winner(votes: readonly { candidate: number; at: number }[], standing: ReadonlySet<number>): number | null {
  const tally = new Map<number, { n: number; last: number }>();
  for (const v of votes) {
    if (!standing.has(v.candidate)) continue;
    const t = tally.get(v.candidate) ?? { n: 0, last: 0 };
    t.n++;
    t.last = Math.max(t.last, v.at);
    tally.set(v.candidate, t);
  }
  let best: [number, { n: number; last: number }] | null = null;
  for (const e of tally) if (!best || e[1].n > best[1].n || (e[1].n === best[1].n && e[1].last < best[1].last)) best = e;
  return best?.[0] ?? null;
}

/**
 * A candidate's number: two digits from 31 up, typed on the vote like on
 * Brazil's voting machine. Never a real party's number (the map stays out of real
 * politics): the parties' current ballot numbers, and 17 and 25, which were.
 */
const PARTY_NUMBERS = new Set([10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 25, 27, 28, 29, 30, 33, 35, 36, 40, 43, 44, 45, 50, 51, 55, 65, 70, 77, 80, 90]);
export const BALLOT_NUMBERS: number[] = Array.from({ length: 69 }, (_, i) => i + 31).filter((n) => !PARTY_NUMBERS.has(n));

/** The lowest number nobody holds this term, or null when they're all taken. */
export function nextNumber(taken: Iterable<number>): number | null {
  const used = new Set(taken);
  return BALLOT_NUMBERS.find((n) => !used.has(n)) ?? null;
}

/** Why a dev can't vote, or null when they can. */
export function cantVote(opts: { onMap: boolean; accountCreated: number | null; clock: ElectionClock }): string | null {
  if (opts.clock.phase !== "voting") return "The vote isn't open yet.";
  if (!opts.onMap) return "Put your building on the map to vote.";
  if (opts.accountCreated !== null && opts.accountCreated > opts.clock.next.opens - VOTER_ACCOUNT_DAYS * DAY) return `Your GitHub account must be ${VOTER_ACCOUNT_DAYS} days old to vote.`;
  return null;
}
