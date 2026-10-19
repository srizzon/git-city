import "server-only";
import { unstable_cache } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isAdminGithubLogin } from "@/lib/admin";
import { CITY_DEV_COLUMNS, loadCityExtras, mergeCityExtras } from "@/lib/city-extras";
import type { LayoutNorms } from "@/lib/github";
import { isoDay, rankTowns, weekStart } from "./scoring";
import { leagueTag } from "./cache";
import { loadStandings, loadLeagueStandings, type LeagueWeekStandings } from "./standings";
import type { League, MemberStatus, Viewer } from "./service";
import type { TownPlace } from "@/lib/towns/place";
import { frozenScore } from "@/lib/towns/hall";

// ─── Town ranking ───────────────────────────────────────────

export interface TownRankingRow {
  rank: number;
  league_id: string;
  slug: string;
  name: string;
  kind: string;
  github_org: string | null;
  per_dev: number;
  coding: number;
  /** Per dev by day, Mon..Sun. */
  days: number[];
}

export interface TownRanking {
  week_start: string;
  /** Ranked towns only (3+ members coding), best first. */
  rows: TownRankingRow[];
}

let rankingCache: { at: number; value: TownRanking } | null = null;
const RANKING_TTL_MS = 5 * 60_000;

/** This week's town-vs-town ranking: every visible town, average per member who coded. */
export async function getTownRanking(): Promise<TownRanking> {
  if (rankingCache && Date.now() - rankingCache.at < RANKING_TTL_MS) return rankingCache.value;

  const sb = getSupabaseAdmin();
  const start = weekStart(new Date());
  const { data: leagues } = await sb
    .from("leagues")
    .select("id, slug, name, kind, github_org, created_at")
    .eq("hidden", false);

  const standings = await loadStandings((leagues ?? []).map((l) => ({ id: l.id as string })), start, sb);
  const rows: TownRankingRow[] = rankTowns(
    (leagues ?? []).map((l) => ({
      id: l.id as string,
      created_at: l.created_at as string | null,
      score: standings.get(l.id)?.town ?? null,
      slug: l.slug as string,
      name: l.name as string,
      kind: l.kind as string,
      github_org: l.github_org as string | null,
      days: standings.get(l.id)?.days ?? [0, 0, 0, 0, 0, 0, 0],
    })),
  ).map((t) => ({
    rank: t.rank,
    league_id: t.id,
    slug: t.slug,
    name: t.name,
    kind: t.kind,
    github_org: t.github_org,
    per_dev: t.score.perDev,
    coding: t.score.coding,
    days: t.days,
  }));

  const value = { week_start: isoDay(start), rows };
  rankingCache = { at: Date.now(), value };
  return value;
}

/** Where a town stands this week, for its page. `coding` counts its members coding when unranked. */
export function townPlace(ranking: TownRanking, leagueId: string, coding: number): TownPlace {
  const i = ranking.rows.findIndex((r) => r.league_id === leagueId);
  const total = ranking.rows.length;
  if (i < 0) return { rank: null, total, coding, gap: null, above: null };
  const me = ranking.rows[i];
  if (i === 0) {
    const next = ranking.rows[1];
    return { rank: 1, total, coding: me.coding, gap: next ? me.per_dev - next.per_dev : null, above: null };
  }
  const up = ranking.rows[i - 1];
  return { rank: me.rank, total, coding: me.coding, gap: up.per_dev - me.per_dev, above: up.name };
}

// ─── League page ────────────────────────────────────────────

export interface LeagueMemberRow {
  developer_id: number;
  login: string;
  name: string | null;
  avatar_url: string | null;
  status: MemberStatus;
  verification: "public" | "private" | null;
  contributions: number;
  joined_at: string | null;
  invited_by: number | null;
}

export interface HallOfFameWeek {
  week_start: string;
  /** score is null for weeks scored under the old points rules. */
  winner: { login: string; avatar_url: string | null; score: number | null; ex_member: boolean } | null;
  /** The town finished 1st among towns that week, so it took the monument. */
  monument: boolean;
}

export interface LeaguePageData {
  league: League;
  members: LeagueMemberRow[];
  week: LeagueWeekStandings;
  hall_of_fame: HallOfFameWeek[];
  viewer: {
    login: string;
    status: MemberStatus | null;
    is_admin: boolean;
    /** Town admin, or the site admin (edits any town). */
    can_edit: boolean;
  } | null;
  counts: { total: number; joined: number; invited: number };
}

export async function getLeagueMembers(leagueId: string): Promise<LeagueMemberRow[]> {
  const sb = getSupabaseAdmin();
  const out: LeagueMemberRow[] = [];
  type Row = {
    developer_id: number;
    status: MemberStatus;
    verification: "public" | "private" | null;
    joined_at: string | null;
    invited_by: number | null;
    developers: { github_login: string; name: string | null; avatar_url: string | null; contributions: number } | null;
  };
  for (let from = 0; ; from += 1000) {
    // A failed read throws: read as "no members" it would be cached as an empty town.
    const { data, error } = await sb
      .from("league_members")
      .select(
        "developer_id, status, verification, joined_at, invited_by, developers!league_members_developer_id_fkey(github_login, name, avatar_url, contributions)",
      )
      .eq("league_id", leagueId)
      .order("developer_id")
      .range(from, from + 999)
      .returns<Row[]>();
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data) {
      if (!r.developers) continue;
      out.push({
        developer_id: r.developer_id,
        login: r.developers.github_login,
        name: r.developers.name,
        avatar_url: r.developers.avatar_url,
        status: r.status,
        verification: r.verification,
        contributions: r.developers.contributions,
        joined_at: r.joined_at,
        invited_by: r.invited_by,
      });
    }
    if (data.length < 1000) break;
  }
  return out;
}

interface FrozenWeek {
  week_start: string;
  winner_id: number | null;
  /** standings[0] of the frozen week: the leader, who is the winner when there is one. */
  top: { developer_id: number; login: string; avatar_url: string | null; total: number } | null;
  version: number | null;
  town_rank: number | null;
}

/**
 * The viewer-independent part of the page: this week's standings and the last
 * 52 closed weeks (only each week's leader, not the whole frozen table).
 * Cached 60s per league; joins, leaves and city writes expire it.
 */
function getLeagueBoard(leagueId: string) {
  return unstable_cache(
    async () => {
      const sb = getSupabaseAdmin();
      const [week, weeksRes] = await Promise.all([
        loadLeagueStandings({ id: leagueId }, weekStart(new Date()), sb),
        sb
          .from("league_weeks")
          .select("week_start, winner_id, top:standings->standings->0, version:standings->version, town_rank:standings->town_rank")
          .eq("league_id", leagueId)
          .order("week_start", { ascending: false })
          .limit(52)
          .returns<FrozenWeek[]>(),
      ]);
      return { week, weeks: weeksRes.data ?? [] };
    },
    ["league-board-v4", leagueId],
    { revalidate: 60, tags: [leagueTag(leagueId)] },
  )();
}

export async function getLeaguePageData(league: League, viewer: Viewer | null): Promise<LeaguePageData> {
  const [members, { week, weeks }] = await Promise.all([
    getLeagueMembers(league.id),
    getLeagueBoard(league.id),
  ]);

  const byId = new Map(members.map((m) => [m.developer_id, m]));
  const hall: HallOfFameWeek[] = weeks.map((w) => {
    const top = w.top && w.top.developer_id === w.winner_id ? w.top : null;
    const member = w.winner_id ? byId.get(w.winner_id) : undefined;
    return {
      week_start: w.week_start,
      winner: top
        ? {
            login: member?.login ?? top.login,
            avatar_url: member?.avatar_url ?? top.avatar_url,
            score: frozenScore(w.version, top.total),
            ex_member: member?.status !== "active",
          }
        : null,
      monument: w.town_rank === 1,
    };
  });

  const mine = viewer ? byId.get(viewer.id) : undefined;
  return {
    league,
    members,
    week,
    hall_of_fame: hall,
    viewer: viewer
      ? {
          login: viewer.github_login,
          status: mine?.status ?? null,
          is_admin: league.admin_id === viewer.id,
          can_edit: league.admin_id === viewer.id || isAdminGithubLogin(viewer.github_login),
        }
      : null,
    counts: {
      total: members.filter((m) => m.status !== "former").length,
      joined: members.filter((m) => m.status === "active").length,
      invited: members.filter((m) => m.status === "invited").length,
    },
  };
}

/** Leagues a dev belongs to (active), for profile chips. */
export async function getDevLeagues(devId: number): Promise<{ slug: string; name: string; kind: string }[]> {
  const { data } = await getSupabaseAdmin()
    .from("league_members")
    .select("leagues!inner(slug, name, kind)")
    .eq("developer_id", devId)
    .eq("status", "active")
    .eq("leagues.hidden", false)
    .returns<{ leagues: { slug: string; name: string; kind: string } }[]>();
  return (data ?? []).map((r) => r.leagues).sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "company" ? -1 : 1));
}

// ─── Mini-city ──────────────────────────────────────────────

/**
 * Developer rows for the league's mini-city (active + invited members), in the
 * /api/city shape, with invited members flagged `invited` (drawn faded).
 */
export async function getLeagueCityDevs(members: LeagueMemberRow[]): Promise<Record<string, unknown>[]> {
  const shown = members.filter((m) => m.status !== "former");
  if (shown.length === 0) return [];
  const status = new Map(shown.map((m) => [m.developer_id, m.status]));
  const devs = await getCityDevsByIds(shown.map((m) => m.developer_id));
  return devs.map((d) => ({ ...d, invited: status.get(d.id as number) === "invited" }));
}

/** The city records (main-city size, lit windows, loadout) of these developers, by rank. */
export async function getCityDevsByIds(ids: number[]): Promise<Record<string, unknown>[]> {
  if (ids.length === 0) return [];
  const sb = getSupabaseAdmin();
  const devs: { id: number; rank: number | null }[] = [];
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await sb
      .from("developers")
      .select(CITY_DEV_COLUMNS)
      .in("id", ids.slice(i, i + 300))
      .returns<{ id: number; rank: number | null }[]>();
    devs.push(...(data ?? []));
  }
  devs.sort((a, b) => (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER));
  const extras = await loadCityExtras(sb, ids);
  return mergeCityExtras(devs, extras);
}

/**
 * City-wide height maxima so mini-city buildings match their main-city size
 * (the layout only reads maxContrib/maxStars/maxContribV2 for heights; the
 * other norms fall back to the subset). Cached 1h.
 */
export const getCityNorms = unstable_cache(
  async (): Promise<LayoutNorms> => {
    const sb = getSupabaseAdmin();
    const top = async (col: string) => {
      const { data } = await sb
        .from("developers")
        .select(col)
        .not(col, "is", null)
        .order(col, { ascending: false })
        .limit(1)
        .returns<Record<string, number>[]>();
      return Number(data?.[0]?.[col] ?? 1) || 1;
    };
    const [contributions, stars, contributionsTotal] = await Promise.all([
      top("contributions"),
      top("total_stars"),
      top("contributions_total"),
    ]);
    return {
      maxContrib: contributions,
      maxStars: stars,
      maxContribV2: contributionsTotal,
      maxComposite: 1e-6,
      maxXp: 1,
      maxSpent: 1,
      maxVisits: 1,
      maxCustom: 1,
      devCount: 0,
    };
  },
  ["league-city-norms"],
  { revalidate: 3600 },
);
