// ─── The day's facts ────────────────────────────────────────
// Every number a reel can put on screen, read once a day from the Brasil
// map: the state race and its closest gaps, founders, yesterday's biggest
// and smallest newcomers, streaks, languages, the island, comments per
// reel, this week's offices, and (once those tables exist) points and the
// presidential vote. A reel spec copies what it uses into its `facts`, so a
// re-render later shows the day it was approved.
//
// Light on purpose (the DB went down on 2026-10-18 under per-comment
// recalcs): a few paged selects, the rest computed here.

import type { SupabaseClient } from "@supabase/supabase-js";
import { STATES, layoutFromResidents, type Resident, type UF } from "@/lib/towns/brasil-map";
import { brasilOffices } from "@/lib/towns/brasil-roles";

export interface DevRow {
  id: number;
  github_login: string;
  contributions: number | null;
  current_streak: number | null;
  primary_language: string | null;
  current_week_contributions: number | null;
}

export interface CommentRow {
  reel: string;
  outcome: string | null;
  created_at: string;
}

export interface FactsInput {
  residents: Resident[];
  devs: DevRow[];
  comments: CommentRow[];
  /** Optional tables (the points plan): absent until migrated. */
  points?: { login: string; uf: UF | null; points: number }[];
  votes?: { candidate: string; votes: number }[];
  now: number;
}

const DAY = 24 * 60 * 60 * 1000;
const nameOf = (uf: UF) => STATES.find((s) => s.uf === uf)?.name ?? uf;

export function computeFacts({ residents, devs, comments, points, votes, now }: FactsInput) {
  const layout = layoutFromResidents(residents);
  const dev = new Map(devs.map((d) => [d.github_login.toLowerCase(), d]));
  const of = (login: string) => dev.get(login.toLowerCase());
  const fresh = residents.filter((r) => now - r.at < DAY);

  // The race: devs per state, and the closest neighbors in the ranking.
  const states = STATES.map((s) => {
    const mine = residents.filter((r) => r.dev.uf === s.uf);
    const capital = layout.cities.find((c) => c.uf === s.uf && !c.second);
    const founder = capital?.devs.find((d) => d.founder)?.dev.login ?? null;
    const top = [...mine].sort((a, b) => (of(b.dev.login)?.contributions ?? 0) - (of(a.dev.login)?.contributions ?? 0))[0]?.dev.login ?? null;
    const langs = new Map<string, number>();
    for (const r of mine) {
      const l = of(r.dev.login)?.primary_language;
      if (l) langs.set(l, (langs.get(l) ?? 0) + 1);
    }
    const lang = [...langs].sort((a, b) => b[1] - a[1])[0] ?? null;
    const streak = [...mine].map((r) => [r.dev.login, of(r.dev.login)?.current_streak ?? 0] as const).sort((a, b) => b[1] - a[1])[0] ?? null;
    return {
      uf: s.uf,
      name: s.name,
      devs: mine.length,
      new24h: mine.filter((r) => now - r.at < DAY).length,
      founder,
      biggest: top,
      language: lang ? { name: lang[0], devs: lang[1] } : null,
      streak: streak && streak[1] > 0 ? { login: streak[0], days: streak[1] } : null,
    };
  }).sort((a, b) => b.devs - a.devs || a.name.localeCompare(b.name));
  const ranked = states.map((s, i) => ({ ...s, place: i + 1 }));
  const gaps = ranked
    .slice(1)
    .map((s, i) => ({ ahead: ranked[i].uf, behind: s.uf, gap: ranked[i].devs - s.devs, places: [i + 1, i + 2] }))
    .sort((a, b) => a.gap - b.gap)
    .slice(0, 10);

  // Yesterday's newcomers by building size (contributions).
  const sized = fresh
    .map((r) => ({ login: r.dev.login, uf: r.dev.uf, contributions: of(r.dev.login)?.contributions ?? 0 }))
    .sort((a, b) => b.contributions - a.contributions);

  // This week's offices, from this week's contributions.
  const totals = new Map(devs.map((d) => [d.github_login.toLowerCase(), d.current_week_contributions ?? 0]));
  const offices = brasilOffices(layout, totals);
  const governors = Object.fromEntries(offices.governors);

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
    statesWithFounder: ranked.filter((s) => s.founder).length,
    statesWithoutFounder: ranked.filter((s) => !s.founder).map((s) => s.uf),
    states: ranked,
    gaps,
    newcomers: { biggest: sized[0] ?? null, smallest: sized[sized.length - 1] ?? null, count: sized.length },
    governors,
    stateName: Object.fromEntries(STATES.map((s) => [s.uf, nameOf(s.uf)])),
    reels: Object.fromEntries(reels),
    points: points ? [...points].sort((a, b) => b.points - a.points).slice(0, 20) : null,
    votes: votes ? [...votes].sort((a, b) => b.votes - a.votes) : null,
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

/** Reads what computeFacts needs: the Brasil town's residents, their devs, the reel comments, and the optional tables. */
export async function loadFactsInput(sb: SupabaseClient, now: number): Promise<FactsInput> {
  const { data: league, error } = await sb.from("leagues").select("id").eq("slug", "brasil-town").maybeSingle<{ id: string }>();
  if (error || !league) throw new Error(`brasil town: ${error?.message ?? "not found"}`);
  type Row = { developer_id: number; uf: string | null; hub: number; x: number; z: number; placed_at: string; developers: { github_login: string } | null };
  const rows = await paged<Row>((a, b) =>
    sb
      .from("brasil_residents")
      .select("developer_id, uf, hub, x, z, placed_at, developers(github_login)")
      .eq("league_id", league.id)
      .order("placed_at", { ascending: true })
      .range(a, b)
      .returns<Row[]>(),
  );
  const residents: Resident[] = rows.flatMap((r) =>
    r.developers ? [{ dev: { id: r.developer_id, login: r.developers.github_login, uf: (r.uf as UF | null) ?? null }, x: r.x, z: r.z, hub: r.hub, at: Date.parse(r.placed_at) }] : [],
  );
  const ids = residents.map((r) => r.dev.id);
  const devs: DevRow[] = [];
  for (let i = 0; i < ids.length; i += 300) {
    const { data, error: e } = await sb
      .from("developers")
      .select("id, github_login, contributions, current_streak, primary_language, current_week_contributions")
      .in("id", ids.slice(i, i + 300));
    if (e) throw new Error(`developers: ${e.message}`);
    devs.push(...((data ?? []) as DevRow[]));
  }
  const comments = await paged<CommentRow>((a, b) => sb.from("brasil_comments").select("reel, outcome, created_at").range(a, b));
  // The points plan's tables, once migrated (until then they don't exist: null).
  const optional = async <T>(table: string, columns: string): Promise<T[] | undefined> => {
    const { data, error: e } = await sb.from(table).select(columns).limit(5000);
    return e ? undefined : ((data ?? []) as T[]);
  };
  const ledger = await optional<{ login: string; uf: UF | null; points: number }>("brasil_points", "login, uf, points");
  const votes = await optional<{ candidate: string }>("brasil_votes", "candidate");
  const points = ledger && Object.values(
    ledger.reduce<Record<string, { login: string; uf: UF | null; points: number }>>((acc, r) => {
      const k = r.login.toLowerCase();
      acc[k] = { login: r.login, uf: r.uf, points: (acc[k]?.points ?? 0) + r.points };
      return acc;
    }, {}),
  );
  const tally = votes && Object.entries(votes.reduce<Record<string, number>>((acc, v) => ((acc[v.candidate] = (acc[v.candidate] ?? 0) + 1), acc), {})).map(([candidate, n]) => ({ candidate, votes: n }));
  return { residents, devs, comments, points, votes: tally, now };
}
