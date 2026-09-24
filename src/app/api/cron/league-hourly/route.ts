import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { fetchWeekContributionDays } from "@/lib/github-api";
import { detectOvertakes, isoDay, weekDays, weekStart } from "@/lib/leagues/scoring";
import { loadStandings } from "@/lib/leagues/standings";
import { sendLeagueOvertakenNotification } from "@/lib/notification-senders/league-overtaken";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ─── League hourly fetch ─────────────────────────────────────────────────────
// Refreshes this week's per-day GitHub contributions for every active league
// member (20 logins per GraphQL request). Stalest devs go first so a run that
// stops early on the rate-limit floor still cycles everyone over a few hours.
// A failed batch leaves the previous values in place (never zeroes a score).

const BATCH = 20;
const RATE_LIMIT_FLOOR = 500;
const TIME_BUDGET_MS = 240_000;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  const sb = getSupabaseAdmin();
  const start = weekStart(new Date());
  const startDay = isoDay(start);
  const validDays = new Set(weekDays(start));

  // Every dev who is active in at least one league.
  const devs = new Map<number, string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from("league_members")
      .select("developer_id, developers!league_members_developer_id_fkey(github_login)")
      .eq("status", "active")
      .order("developer_id")
      .range(from, from + 999)
      .returns<{ developer_id: number; developers: { github_login: string } | null }[]>();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    if (!data || data.length === 0) break;
    for (const r of data) if (r.developers) devs.set(r.developer_id, r.developers.github_login);
    if (data.length < 1000) break;
  }

  // Stalest first: devs with no row this week, then oldest fetched_at.
  const lastFetched = new Map<number, number>();
  const ids = [...devs.keys()];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await sb
      .from("league_weekly_stats")
      .select("developer_id, fetched_at")
      .eq("week_start", startDay)
      .in("developer_id", ids.slice(i, i + 200));
    for (const r of data ?? []) {
      const t = Date.parse(r.fetched_at);
      lastFetched.set(r.developer_id, Math.max(lastFetched.get(r.developer_id) ?? 0, t));
    }
  }
  const queue = ids.sort((a, b) => (lastFetched.get(a) ?? 0) - (lastFetched.get(b) ?? 0));

  // Standings before the fetch, to detect overtakes afterwards.
  const { data: leagueRows } = await sb.from("leagues").select("id, slug, name, scoring_mode");
  const leagues = (leagueRows ?? []).map((l) => ({
    id: l.id as string,
    slug: l.slug as string,
    name: l.name as string,
    scoring_mode: l.scoring_mode,
  }));
  const before = await loadStandings(leagues, start, sb);

  const idByLogin = new Map([...devs].map(([id, login]) => [login.toLowerCase(), id]));
  let fetched = 0;
  let failedBatches = 0;
  let stoppedReason: string | null = null;
  let remaining: number | null = null;

  for (let i = 0; i < queue.length; i += BATCH) {
    if (Date.now() - started > TIME_BUDGET_MS) {
      stoppedReason = "time_budget";
      break;
    }
    const logins = queue.slice(i, i + BATCH).map((id) => devs.get(id)!);
    const { results, rateLimit } = await fetchWeekContributionDays(logins, start);
    if (rateLimit) remaining = rateLimit.remaining;
    if (results.length === 0) {
      failedBatches++;
    } else {
      const now = new Date().toISOString();
      const rows = results.flatMap((r) => {
        const devId = idByLogin.get(r.login.toLowerCase());
        if (!devId) return [];
        return r.days
          .filter((d) => validDays.has(d.date))
          .map((d) => ({ developer_id: devId, week_start: startDay, day: d.date, contributions: d.count, fetched_at: now }));
      });
      if (rows.length > 0) {
        const { error } = await sb.from("league_weekly_stats").upsert(rows, { onConflict: "developer_id,day" });
        if (error) failedBatches++;
        else fetched += results.length;
      }
    }
    if (remaining !== null && remaining < RATE_LIMIT_FLOOR) {
      stoppedReason = "rate_limit";
      break;
    }
  }

  let overtakes = 0;
  if (fetched > 0) {
    const after = await loadStandings(leagues, start, sb);
    for (const league of leagues) {
      const prev = before.get(league.id);
      const next = after.get(league.id);
      if (!prev || !next || next.standings.length < 2) continue;
      for (const o of detectOvertakes(prev.standings, next.standings)) {
        sendLeagueOvertakenNotification({ ...o, leagueSlug: league.slug, leagueName: league.name });
        overtakes++;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    week_start: startDay,
    overtakes,
    members: queue.length,
    fetched,
    failed_batches: failedBatches,
    rate_limit_remaining: remaining,
    stopped: stoppedReason,
  });
}

