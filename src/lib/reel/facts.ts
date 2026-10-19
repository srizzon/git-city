// ─── The day's facts ────────────────────────────────────────
// Every number a reel can put on screen, read once a day from the Brasil
// map: the state race and its closest gaps, cities and founders, yesterday's
// biggest and smallest newcomers, streaks, languages, the island, comments
// per reel, this week's points and the offices they elect, and the
// presidential count. A reel spec copies what it uses into its `facts`, so a
// re-render later shows the day it was approved.
//
// It reads through the town's own server functions (the map's state, the
// points weeks, the election count) so the numbers are the ones the site
// shows; light on purpose (the DB went down on 2026-10-18 under per-comment
// recalcs): a few reads, the rest computed here.

import type { SupabaseClient } from "@supabase/supabase-js";
import { STATES, layoutFromState, type BrasilLayout, type Resident, type UF } from "@/lib/towns/brasil-map";
import { brasilOffices } from "@/lib/towns/brasil-roles";
import { BRASIL_SLUG, getBrasilWeek, readMapState, type BrasilWeek } from "@/lib/towns/brasil-server";
import { getCount, type Count } from "@/lib/towns/brasil-election-server";

export interface DevRow {
  id: number;
  github_login: string;
  contributions: number | null;
  current_streak: number | null;
  primary_language: string | null;
}

export interface CommentRow {
  reel: string;
  outcome: string | null;
  created_at: string;
}

export interface FactsInput {
  layout: BrasilLayout;
  residents: Resident[];
  devs: DevRow[];
  comments: CommentRow[];
  week: BrasilWeek;
  count: Count | null;
  now: number;
}

const DAY = 24 * 60 * 60 * 1000;

export function computeFacts({ layout, residents, devs, comments, week, count, now }: FactsInput) {
  const dev = new Map(devs.map((d) => [d.github_login.toLowerCase(), d]));
  const of = (login: string) => dev.get(login.toLowerCase());
  const fresh = residents.filter((r) => now - r.at < DAY);
  const ufOf = new Map(residents.map((r) => [r.dev.login.toLowerCase(), r.dev.uf]));
  const livePointsOf = (login: string) => week.live.totals[login.toLowerCase()] ?? 0;

  // The race: devs (and this week's points) per state, and the closest neighbors in the ranking.
  const states = STATES.map((s) => {
    const mine = residents.filter((r) => r.dev.uf === s.uf);
    const capital = layout.cities.find((c) => c.uf === s.uf && c.capital);
    const top = [...mine].sort((a, b) => (of(b.dev.login)?.contributions ?? 0) - (of(a.dev.login)?.contributions ?? 0))[0]?.dev.login ?? null;
    const langs = new Map<string, number>();
    for (const r of mine) {
      const l = of(r.dev.login)?.primary_language;
      if (l) langs.set(l, (langs.get(l) ?? 0) + 1);
    }
    const lang = [...langs].sort((a, b) => b[1] - a[1])[0] ?? null;
    const streak = mine.map((r) => [r.dev.login, of(r.dev.login)?.current_streak ?? 0] as const).sort((a, b) => b[1] - a[1])[0] ?? null;
    const leader = mine.map((r) => [r.dev.login, livePointsOf(r.dev.login)] as const).sort((a, b) => b[1] - a[1])[0] ?? null;
    return {
      uf: s.uf,
      name: s.name,
      devs: mine.length,
      new24h: mine.filter((r) => now - r.at < DAY).length,
      cities: layout.cities.filter((c) => c.uf === s.uf && c.devs.length > 0).length,
      founder: capital?.devs.find((d) => d.founder)?.dev.login ?? null,
      biggest: top,
      language: lang ? { name: lang[0], devs: lang[1] } : null,
      streak: streak && streak[1] > 0 ? { login: streak[0], days: streak[1] } : null,
      points: mine.reduce((t, r) => t + livePointsOf(r.dev.login), 0),
      pointsLeader: leader && leader[1] > 0 ? { login: leader[0], points: leader[1] } : null,
    };
  }).sort((a, b) => b.devs - a.devs || a.name.localeCompare(b.name));
  const ranked = states.map((s, i) => ({ ...s, place: i + 1 }));
  const gaps = ranked
    .slice(1)
    .map((s, i) => ({ ahead: ranked[i].uf, behind: s.uf, gap: ranked[i].devs - s.devs, places: [i + 1, i + 2] }))
    .sort((a, b) => a.gap - b.gap)
    .slice(0, 10);
  const byPoints = [...ranked].sort((a, b) => b.points - a.points).map((s) => ({ uf: s.uf, points: s.points }));

  // Cities: how many are lived in, and those founded in the last day.
  const lived = layout.cities.filter((c) => c.devs.length > 0);
  const foundedToday = lived
    .map((c) => ({ city: c.name, uf: c.uf, founder: c.devs.find((d) => d.founder) }))
    .filter((c) => c.founder && now - c.founder.at < DAY)
    .map((c) => ({ city: c.city, uf: c.uf, login: c.founder!.dev.login }));

  // Yesterday's newcomers by building size (contributions).
  const sized = fresh.map((r) => ({ login: r.dev.login, uf: r.dev.uf, contributions: of(r.dev.login)?.contributions ?? 0 })).sort((a, b) => b.contributions - a.contributions);

  // The offices the closed week's points elect (the site's own rule), the president from the vote.
  const president = count?.mode === "final" ? count.elected : null;
  const offices = brasilOffices(layout, new Map(Object.entries(week.totals)), president);
  const governors = Object.fromEntries(offices.governors);

  // This week's points so far: the leaders, and where their points came from.
  const leaders = Object.entries(week.live.totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([login, points]) => ({ login, uf: ufOf.get(login) ?? null, points, breakdown: week.live.breakdown[login] }));

  // Comments per reel (the importer's outcome says who was placed).
  const reels = new Map<string, { comments: number; placed: number }>();
  for (const c of comments) {
    const r = reels.get(c.reel) ?? { comments: 0, placed: 0 };
    r.comments++;
    if (c.outcome === "added") r.placed++;
    reels.set(c.reel, r);
  }

  return {
    asOf: new Date(now).toISOString(),
    total: residents.length,
    new24h: fresh.length,
    island: layout.island.devs.length,
    cities: lived.length,
    foundedToday,
    statesWithFounder: ranked.filter((s) => s.founder).length,
    statesWithoutFounder: ranked.filter((s) => !s.founder).map((s) => s.uf),
    states: ranked,
    gaps,
    statesByPoints: byPoints,
    newcomers: { biggest: sized[0] ?? null, smallest: sized[sized.length - 1] ?? null, count: sized.length },
    officesWeek: { weekStart: week.weekStart, provisional: week.provisional },
    governors,
    president,
    points: { weekStart: week.live.weekStart, leaders },
    election: count ? { mode: count.mode, term: count.term, opens: new Date(count.opens).toISOString(), closes: new Date(count.closes).toISOString(), total: count.total, rows: count.rows } : null,
    reels: Object.fromEntries(reels),
  };
}

export type Facts = ReturnType<typeof computeFacts>;

async function paged<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

/** Reads what computeFacts needs: the town's map, its residents' devs, the reel comments, the points weeks and the vote count. */
export async function loadFactsInput(sb: SupabaseClient, now: number): Promise<FactsInput> {
  const { data: league, error } = await sb.from("leagues").select("id").eq("slug", BRASIL_SLUG).maybeSingle<{ id: string }>();
  if (error || !league) throw new Error(`brasil town: ${error?.message ?? "not found"}`);
  const state = await readMapState(league.id);
  const ids = state.residents.map((r) => r.dev.id);
  const devs: DevRow[] = [];
  for (let i = 0; i < ids.length; i += 300) {
    const { data, error: e } = await sb.from("developers").select("id, github_login, contributions, current_streak, primary_language").in("id", ids.slice(i, i + 300));
    if (e) throw new Error(`developers: ${e.message}`);
    devs.push(...((data ?? []) as DevRow[]));
  }
  const [comments, week, count] = await Promise.all([
    paged<CommentRow>((a, b) => sb.from("brasil_comments").select("reel, outcome, created_at").range(a, b)),
    getBrasilWeek(league.id),
    // The presidency can be off (no vote yet): no count is no facts, not a failure.
    getCount(league.id).catch(() => null),
  ]);
  return { layout: layoutFromState(state), residents: state.residents, devs, comments, week, count, now };
}
