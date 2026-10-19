// ─── Brasil town: the presidential election, server side ────
// Candidates and votes (brasil_candidates, brasil_votes, migration 173) for
// the term being run for (brasil-election.ts). Anyone on the map runs from
// the site and gets the term's lowest free number; an admin can add someone
// (a famous dev who said yes), putting them on the map first when they
// aren't. A vote is a number typed in, like on Brazil's voting machine; it can
// change, or go blank (no vote), until the vote closes; the first one scores. The president is the winner of the term in
// office, read once per term (a closed vote never changes). Server only.

import { getSupabaseAdmin } from "../supabase";
import { captureServer } from "../posthog-server";
import { createDeveloperFromGitHub } from "../create-developer";
import { GitHubFetchError } from "../github-api";
import { invalidateLeague } from "../leagues/cache";
import { cantVote, electionClock, nextNumber, winner, type ElectionClock } from "./brasil-election";
import { awardPoints } from "./brasil-points-server";
import { cityForState, placeBrasilResident } from "./brasil-server";
import type { UF } from "./brasil-map";

export interface Candidate {
  number: number;
  login: string;
  avatar_url: string | null;
  votes: number;
  addedBy: "self" | "admin";
}

export interface ElectionView {
  phase: ElectionClock["phase"];
  /** The term being run for, and its vote. */
  next: { n: number; opens: number; closes: number; start: number; end: number };
  /** The term in office. */
  current: { n: number; start: number; end: number } | null;
  president: { login: string; avatar_url: string | null } | null;
  /** Most votes first (sign-up order before the vote). */
  candidates: Candidate[];
  totalVotes: number;
  viewer: { login: string; onMap: boolean; running: number | null; votedFor: { number: number; login: string } | null; cantVote: string | null } | null;
}

interface CandidateRow {
  developer_id: number;
  number: number;
  added_by: "self" | "admin";
  created_at: string;
  developers: { github_login: string; avatar_url: string | null } | null;
}

async function standing(n: number): Promise<CandidateRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("brasil_candidates")
    .select("developer_id, number, added_by, created_at, developers(github_login, avatar_url)")
    .eq("term", n)
    .is("withdrawn_at", null)
    .order("number", { ascending: true })
    .returns<CandidateRow[]>();
  if (error) throw new Error(`brasil candidates: ${error.message}`);
  return (data ?? []).filter((c) => c.developers);
}

async function votesOf(n: number): Promise<{ voter: number; candidate: number; at: number }[]> {
  const out: { voter: number; candidate: number; at: number }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await getSupabaseAdmin()
      .from("brasil_votes")
      .select("voter_id, candidate_id, voted_at")
      .eq("term", n)
      .order("voter_id", { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(`brasil votes: ${error.message}`);
    for (const v of (data ?? []) as { voter_id: number; candidate_id: number; voted_at: string }[]) out.push({ voter: v.voter_id, candidate: v.candidate_id, at: Date.parse(v.voted_at) });
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Each closed term's winner, once read. */
const elected = new Map<number, { login: string; avatar_url: string | null } | null>();

async function presidentOf(n: number): Promise<{ login: string; avatar_url: string | null } | null> {
  if (elected.has(n)) return elected.get(n)!;
  const [cands, votes] = await Promise.all([standing(n), votesOf(n)]);
  const id = winner(votes, new Set(cands.map((c) => c.developer_id)));
  const c = cands.find((x) => x.developer_id === id);
  const p = c?.developers ? { login: c.developers.github_login, avatar_url: c.developers.avatar_url } : null;
  elected.set(n, p);
  return p;
}

/** The candidate holding a number in the race being run now (or the one that just closed), for a shared vote. */
export async function candidateByNumber(number: number, now = Date.now()): Promise<{ login: string; avatar_url: string | null } | null> {
  const clock = electionClock(now);
  for (const n of [clock.next.n, clock.current?.n].filter((x): x is number => !!x)) {
    const c = (await standing(n)).find((x) => x.number === number);
    if (c?.developers) return { login: c.developers.github_login, avatar_url: c.developers.avatar_url };
  }
  return null;
}

/** The president in office now (null before the first vote closes, or when nobody got a vote). */
export async function currentPresident(now = Date.now()): Promise<string | null> {
  const clock = electionClock(now);
  return clock.current ? ((await presidentOf(clock.current.n))?.login ?? null) : null;
}

async function isResident(leagueId: string, devId: number): Promise<boolean> {
  const { data } = await getSupabaseAdmin().from("brasil_residents").select("developer_id").eq("league_id", leagueId).eq("developer_id", devId).maybeSingle();
  return !!data;
}

export async function getElection(leagueId: string, viewer: { id: number; github_login: string } | null, now = Date.now()): Promise<ElectionView> {
  const clock = electionClock(now);
  const n = clock.next.n;
  const [cands, votes, president] = await Promise.all([standing(n), votesOf(n), clock.current ? presidentOf(clock.current.n) : Promise.resolve(null)]);
  const ids = new Set(cands.map((c) => c.developer_id));
  const count = new Map<number, number>();
  for (const v of votes) if (ids.has(v.candidate)) count.set(v.candidate, (count.get(v.candidate) ?? 0) + 1);
  const candidates = cands
    .map((c) => ({ id: c.developer_id, number: c.number, login: c.developers!.github_login, avatar_url: c.developers!.avatar_url, votes: count.get(c.developer_id) ?? 0, addedBy: c.added_by }))
    .sort((a, b) => (clock.phase === "voting" ? b.votes - a.votes : 0));

  let v: ElectionView["viewer"] = null;
  if (viewer) {
    const onMap = await isResident(leagueId, viewer.id);
    const { data: dev } = await getSupabaseAdmin().from("developers").select("account_created_at").eq("id", viewer.id).maybeSingle<{ account_created_at: string | null }>();
    const mine = votes.find((x) => x.voter === viewer.id);
    v = {
      login: viewer.github_login,
      onMap,
      running: candidates.find((c) => c.id === viewer.id)?.number ?? null,
      votedFor: (() => {
        const c = mine ? candidates.find((x) => x.id === mine.candidate) : null;
        return c ? { number: c.number, login: c.login } : null;
      })(),
      cantVote: cantVote({ onMap, accountCreated: dev?.account_created_at ? Date.parse(dev.account_created_at) : null, clock }),
    };
  }
  return {
    phase: clock.phase,
    next: { n, opens: clock.next.opens, closes: clock.next.closes, start: clock.next.start, end: clock.next.end },
    current: clock.current ? { n: clock.current.n, start: clock.current.start, end: clock.current.end } : null,
    president,
    candidates: candidates.map((c) => ({ number: c.number, login: c.login, avatar_url: c.avatar_url, votes: c.votes, addedBy: c.addedBy })),
    totalVotes: candidates.reduce((s, c) => s + c.votes, 0),
    viewer: v,
  };
}

/** Run for president (or stop running). Running again keeps the number you had this term. */
export async function setRunning(leagueId: string, dev: { id: number; github_login: string }, running: boolean, addedBy: "self" | "admin" = "self"): Promise<string | null> {
  const n = electionClock(Date.now()).next.n;
  const sb = getSupabaseAdmin();
  if (!running) {
    await sb.from("brasil_candidates").update({ withdrawn_at: new Date().toISOString() }).eq("term", n).eq("developer_id", dev.id);
    return null;
  }
  if (!(await isResident(leagueId, dev.id))) return "Put your building on the map to run.";
  const { data: had } = await sb.from("brasil_candidates").select("number").eq("term", n).eq("developer_id", dev.id).maybeSingle<{ number: number }>();
  if (had) {
    const { error } = await sb.from("brasil_candidates").update({ withdrawn_at: null }).eq("term", n).eq("developer_id", dev.id);
    if (error) throw new Error(`brasil run: ${error.message}`);
  } else {
    // Two people signing up at once can reach for the same number: the unique key turns one away, and it takes the next.
    for (let attempt = 0; ; attempt++) {
      const { data: taken } = await sb.from("brasil_candidates").select("number").eq("term", n);
      const number = nextNumber((taken ?? []).map((t: { number: number }) => t.number));
      if (number === null) return "Every number is taken this term.";
      const { error } = await sb.from("brasil_candidates").insert({ term: n, developer_id: dev.id, number, added_by: addedBy });
      if (!error) break;
      if (error.code !== "23505" || attempt >= 4) throw new Error(`brasil run: ${error.message}`);
    }
  }
  await captureServer(dev.github_login.toLowerCase(), "brasil_candidate_added", { term: n, by: addedBy });
  return null;
}

/** A vote (or a changed one) for the candidate with that number, or a blank one (null: no vote); the first vote of a term scores. */
export async function castVote(leagueId: string, voter: { id: number; github_login: string }, number: number | null): Promise<string | null> {
  const clock = electionClock(Date.now());
  const sb = getSupabaseAdmin();
  const onMap = await isResident(leagueId, voter.id);
  const { data: dev } = await sb.from("developers").select("account_created_at").eq("id", voter.id).maybeSingle<{ account_created_at: string | null }>();
  const why = cantVote({ onMap, accountCreated: dev?.account_created_at ? Date.parse(dev.account_created_at) : null, clock });
  if (why) return why;
  const n = clock.next.n;
  if (number === null) {
    await sb.from("brasil_votes").delete().eq("term", n).eq("voter_id", voter.id);
    return null;
  }
  const cand = (await standing(n)).find((c) => c.number === number);
  if (!cand) return "Nobody has that number.";
  const { error } = await sb
    .from("brasil_votes")
    .upsert({ term: n, voter_id: voter.id, candidate_id: cand.developer_id, voted_at: new Date().toISOString() }, { onConflict: "term,voter_id" });
  if (error) throw new Error(`brasil vote: ${error.message}`);
  await awardPoints(voter.id, "vote", `${n}:${voter.id}`);
  await captureServer(voter.github_login.toLowerCase(), "brasil_vote_cast", { term: n });
  return null;
}

/** Admin: put someone in the race, on the map first (in `uf`, or the island) when they aren't there. */
export async function adminAddCandidate(league: { id: string }, login: string, uf: UF | null): Promise<string | null> {
  const sb = getSupabaseAdmin();
  let { data: dev } = await sb.from("developers").select("id, github_login").eq("github_login", login).maybeSingle<{ id: number; github_login: string }>();
  if (!dev) {
    try {
      dev = await createDeveloperFromGitHub(login);
    } catch (err) {
      if (err instanceof GitHubFetchError) return `@${login} isn't on GitHub.`;
      throw err;
    }
  }
  if (!(await isResident(league.id, dev.id))) {
    await placeBrasilResident(league, { id: dev.id, login: dev.github_login }, cityForState(uf), "admin", false, false);
    invalidateLeague(league.id);
  }
  return setRunning(league.id, dev, true, "admin");
}
