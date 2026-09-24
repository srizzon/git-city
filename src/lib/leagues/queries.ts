import "server-only";
import { unstable_cache } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase";
import { CITY_DEV_COLUMNS, loadCityExtras, mergeCityExtras } from "@/lib/city-extras";
import type { LayoutNorms } from "@/lib/github";
import { isoDay, weekStart, type ScoringMode } from "./scoring";
import { leagueTag } from "./cache";
import { loadStandings, loadLeagueStandings, type LeagueWeekStandings } from "./standings";
import type { League, MemberStatus, Viewer } from "./service";

// ─── Global company ranking ─────────────────────────────────

export interface GlobalRankingRow {
  rank: number | null; // null = unranked (under 3 active members)
  league_id: string;
  slug: string;
  name: string;
  github_org: string | null;
  active_members: number;
  score: number | null;
}

export interface GlobalRanking {
  week_start: string;
  rows: GlobalRankingRow[];
  last_week_winner: { slug: string; name: string; score: number } | null;
}

let rankingCache: { at: number; value: GlobalRanking } | null = null;
const RANKING_TTL_MS = 5 * 60_000;

export async function getGlobalRanking(): Promise<GlobalRanking> {
  if (rankingCache && Date.now() - rankingCache.at < RANKING_TTL_MS) return rankingCache.value;

  const sb = getSupabaseAdmin();
  const start = weekStart(new Date());
  const { data: leagues } = await sb
    .from("leagues")
    .select("id, slug, name, github_org, scoring_mode")
    .eq("kind", "company")
    .eq("hidden", false);

  const standings = await loadStandings(
    // Global always scores in XP mode.
    (leagues ?? []).map((l) => ({ id: l.id as string, scoring_mode: "xp" as const })),
    start,
    sb,
  );

  const rows: GlobalRankingRow[] = (leagues ?? [])
    .map((l) => {
      const s = standings.get(l.id);
      return {
        rank: null,
        league_id: l.id,
        slug: l.slug,
        name: l.name,
        github_org: l.github_org,
        active_members: s?.standings.length ?? 0,
        score: s?.globalScore ?? null,
      };
    })
    .filter((r) => r.active_members > 0)
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || b.active_members - a.active_members);
  let n = 0;
  for (const r of rows) if (r.score !== null) r.rank = ++n;

  const lastWeek = new Date(start);
  lastWeek.setUTCDate(lastWeek.getUTCDate() - 7);
  const lastWeekWinner = await getGlobalWinner(isoDay(lastWeek));

  const value = { week_start: isoDay(start), rows, last_week_winner: lastWeekWinner };
  rankingCache = { at: Date.now(), value };
  return value;
}

/** Top company of a closed week, stored on its league_weeks row by the close cron. */
export async function getGlobalWinner(week: string): Promise<GlobalRanking["last_week_winner"]> {
  const { data } = await getSupabaseAdmin()
    .from("league_weeks")
    .select("standings, leagues!inner(slug, name)")
    .eq("week_start", week)
    .not("standings->global_winner", "is", null)
    .limit(1)
    .returns<{ standings: { global_winner?: { score: number } }; leagues: { slug: string; name: string } }[]>();
  const row = data?.[0];
  if (!row?.standings.global_winner) return null;
  return { slug: row.leagues.slug, name: row.leagues.name, score: row.standings.global_winner.score };
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
  winner: { login: string; avatar_url: string | null; score: number; ex_member: boolean } | null;
  global_winner: boolean;
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
    const { data } = await sb
      .from("league_members")
      .select(
        "developer_id, status, verification, joined_at, invited_by, developers!league_members_developer_id_fkey(github_login, name, avatar_url, contributions)",
      )
      .eq("league_id", leagueId)
      .order("developer_id")
      .range(from, from + 999)
      .returns<Row[]>();
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
  global_winner: unknown;
}

/**
 * The viewer-independent part of the page: this week's standings and the last
 * 52 closed weeks (only each week's leader, not the whole frozen table).
 * Cached 60s per league; joins, leaves and city writes expire it.
 */
function getLeagueBoard(leagueId: string, scoringMode: ScoringMode) {
  return unstable_cache(
    async () => {
      const sb = getSupabaseAdmin();
      const [week, weeksRes] = await Promise.all([
        loadLeagueStandings({ id: leagueId, scoring_mode: scoringMode }, weekStart(new Date()), sb),
        sb
          .from("league_weeks")
          .select("week_start, winner_id, top:standings->standings->0, global_winner:standings->global_winner")
          .eq("league_id", leagueId)
          .order("week_start", { ascending: false })
          .limit(52)
          .returns<FrozenWeek[]>(),
      ]);
      return { week, weeks: weeksRes.data ?? [] };
    },
    ["league-board", leagueId, scoringMode],
    { revalidate: 60, tags: [leagueTag(leagueId)] },
  )();
}

export async function getLeaguePageData(league: League, viewer: Viewer | null): Promise<LeaguePageData> {
  const [members, { week, weeks }] = await Promise.all([
    getLeagueMembers(league.id),
    getLeagueBoard(league.id, league.scoring_mode),
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
            score: top.total,
            ex_member: member?.status !== "active",
          }
        : null,
      global_winner: !!w.global_winner,
    };
  });

  const mine = viewer ? byId.get(viewer.id) : undefined;
  return {
    league,
    members,
    week,
    hall_of_fame: hall,
    viewer: viewer
      ? { login: viewer.github_login, status: mine?.status ?? null, is_admin: league.admin_id === viewer.id }
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
  const sb = getSupabaseAdmin();
  const ids = shown.map((m) => m.developer_id);
  const status = new Map(shown.map((m) => [m.developer_id, m.status]));

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
  return mergeCityExtras(devs, extras).map((d) => ({ ...d, invited: status.get(d.id) === "invited" }));
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
