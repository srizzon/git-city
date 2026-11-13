import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase";
import { fetchCurrentYearBatch, fetchFullContributions } from "@/lib/github-api";
import { evaluateEmblems } from "@/lib/emblems";
import { alertCronFailure } from "@/lib/cron-monitor";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ─── Rolling building refresh ────────────────────────────────────────────────
// Nothing else re-syncs a building's GitHub contributions on a schedule (login
// only provisions NEW devs; /api/dev refreshes one dev when someone opens it),
// so this cron is what keeps the city's commit counts true.
//
// Past calendar years are immutable — only the CURRENT year grows. So we keep
// the current-year slice (`contributions_cy` for `contributions_cy_year`) and
// refresh just that:
//   new total = (contributions_total − old current-year) + fresh current-year
// The current-year fetch batches 20 logins per GraphQL request (cost 1).
// Rows with no valid split (legacy, year rollover) take ONE full 10-year fetch,
// single login per request (batching those 502s), to seed it.
//
// How it stays healthy:
// - Candidates come in pages of PAGE rows from one small query per tier, each
//   walking an index (last_active_at, fetched_at). The old single OR across
//   tiers couldn't use them, seq scanned the 200 MB table and died on
//   PostgREST's 8s statement timeout — that silently stopped 11 of 12 runs a
//   day in Nov 2026. Big pages are slow too on a cold cache (4000 rows ≈ 5s),
//   so pages stay small.
// - Tiers run in priority order (active players first), each page processed
//   before the next is selected, so a short run still refreshes the players
//   who look at their building.
// - The run stops itself before Vercel's 300s limit, so it always reports.
// - A GitHub request that fails is retried once and otherwise left un-stamped:
//   the building stays at the front of the queue instead of losing its turn.
// - Every run checks active players' freshness and alerts when it slips.

const CY_BATCH = 20; // logins per current-year GraphQL request
const BATCH_CONCURRENCY = 2; // current-year requests in flight
const SEED_CONCURRENCY = 6; // parallel single-login full fetches (seeding)
const PAGE = 500; // candidate rows per query
const PER_RUN = Number(process.env.REFRESH_BUILDINGS_PER_RUN ?? 4000);
const RATE_LIMIT_FLOOR = 500; // stop early if GitHub points get this low
const RUN_BUDGET_MS = 230_000; // stop taking work here; maxDuration is 300s
const MAX_CONSECUTIVE_FAILURES = 4; // GitHub is down: stop instead of spinning

// ─── Tiers ───────────────────────────────────────────────────────────────────
// A building is only a candidate when it's stale *for its tier*. Even the
// whole city cycling every 10 days is ~500 GitHub requests a day.
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ENGAGED_INTERVAL_H = 6; // claimed AND entered the city recently
const OWNER_INTERVAL_D = 7; // claimed but dormant
const ALL_INTERVAL_D = 10; // every other building
const ACTIVE_WINDOW_D = 30; // "entered the city" within this many days = active

// Freshness promise checked at the end of every run: an active player's
// building is never more than this old. Breaking it alerts.
const ENGAGED_SLO_H = 24;
const ENGAGED_SLO_MAX_STALE_SHARE = 0.05;

const COLUMNS = "id, github_login, contributions_total, contributions_cy, contributions_cy_year";

interface Row {
  id: number;
  github_login: string;
  contributions_total: number | null;
  contributions_cy: number | null;
  contributions_cy_year: number | null;
}

type Tier = {
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  select: (q: any, limit: number) => any;
};

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

const TIERS: Tier[] = [
  {
    name: "engaged",
    select: (q, limit) =>
      q
        .eq("claimed", true)
        .gte("last_active_at", ago(ACTIVE_WINDOW_D * DAY))
        .lt("fetched_at", ago(ENGAGED_INTERVAL_H * HOUR))
        .order("fetched_at", { ascending: true })
        .limit(limit),
  },
  {
    name: "never",
    select: (q, limit) => q.is("fetched_at", null).limit(limit),
  },
  {
    name: "owners",
    select: (q, limit) =>
      q
        .eq("claimed", true)
        .lt("fetched_at", ago(OWNER_INTERVAL_D * DAY))
        .order("fetched_at", { ascending: true })
        .limit(limit),
  },
  {
    name: "all",
    select: (q, limit) =>
      q
        .lt("fetched_at", ago(ALL_INTERVAL_D * DAY))
        .order("fetched_at", { ascending: true })
        .limit(limit),
  },
];

// Re-evaluate commit (contributions-based) emblems for a dev whose contribution
// count just changed — so commit emblems unlock without the dev logging in.
async function evaluateCommitEmblems(devId: number, contributions: number, login: string) {
  await evaluateEmblems(
    devId,
    {
      contributions,
      public_repos: 0,
      total_stars: 0,
      referral_count: 0,
      kudos_count: 0,
      gifts_sent: 0,
      gifts_received: 0,
    },
    login,
  );
}

interface RunState {
  sb: SupabaseClient;
  deadline: number;
  nowIso: string;
  currentYear: number;
  stopped: null | "budget" | "rate_limit" | "github_down";
  rateRemaining: number | null;
  consecutiveFailures: number;
  refreshed: number;
  seeded: number;
  missed: number; // GitHub has no such user (renamed / deleted): stamped
  failed: number; // GitHub request failed: left un-stamped for the next run
  dbErrors: string[];
}

function shouldStop(s: RunState): boolean {
  if (s.stopped) return true;
  if (Date.now() >= s.deadline) s.stopped = "budget";
  return s.stopped !== null;
}

async function updateRow(s: RunState, id: number, fields: Record<string, unknown>) {
  const { error } = await s.sb.from("developers").update(fields).eq("id", id);
  if (error) s.dbErrors.push(error.message);
}

// Cheap path: batched current-year fetch, total = prior years + fresh.
async function refreshChunk(s: RunState, chunk: Row[]) {
  const logins = chunk.map((r) => r.github_login);
  let res = await fetchCurrentYearBatch(logins);
  if (res.failed) res = await fetchCurrentYearBatch(logins);

  if (res.rateLimit) {
    s.rateRemaining = res.rateLimit.remaining;
    if (res.rateLimit.remaining < RATE_LIMIT_FLOOR) s.stopped = "rate_limit";
  }
  if (res.failed) {
    s.failed += chunk.length;
    if (++s.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) s.stopped = "github_down";
    return;
  }
  s.consecutiveFailures = 0;

  const missIds: number[] = [];
  await Promise.all(
    chunk.map(async (r) => {
      const fresh = res.results.get(r.github_login.toLowerCase());
      if (fresh == null) {
        missIds.push(r.id);
        return;
      }
      const prior = (r.contributions_total ?? 0) - (r.contributions_cy ?? 0);
      const newTotal = Math.max(0, prior + fresh);
      // Keep `contributions` (rank key) == total so ranking reflects the sum.
      await updateRow(s, r.id, {
        contributions: newTotal,
        contributions_total: newTotal,
        contributions_cy: fresh,
        fetched_at: s.nowIso,
      });
      if (newTotal > (r.contributions_total ?? 0)) {
        await evaluateCommitEmblems(r.id, newTotal, r.github_login);
      }
      s.refreshed++;
    }),
  );
  if (missIds.length > 0) {
    const { error } = await s.sb.from("developers").update({ fetched_at: s.nowIso }).in("id", missIds);
    if (error) s.dbErrors.push(error.message);
    s.missed += missIds.length;
  }
}

// Seed path: one full 10-year fetch per login to establish the split. A failed
// seed is stamped anyway: a history too long for GitHub to answer in time
// would otherwise sit at the front of the queue forever and starve the rest.
async function seedRow(s: RunState, r: Row) {
  const full = await fetchFullContributions(r.github_login);
  if (!full) {
    await updateRow(s, r.id, { fetched_at: s.nowIso });
    s.missed++;
    return;
  }
  await updateRow(s, r.id, {
    contributions: full.contributions_total,
    contributions_total: full.contributions_total,
    contribution_years: full.contribution_years,
    contributions_cy: full.current_year_value,
    contributions_cy_year: full.current_year,
    fetched_at: s.nowIso,
  });
  await evaluateCommitEmblems(r.id, full.contributions_total, r.github_login);
  s.seeded++;
}

async function pool<T>(items: T[], concurrency: number, s: RunState, work: (item: T) => Promise<void>) {
  let idx = 0;
  const worker = async () => {
    while (idx < items.length && !shouldStop(s)) {
      await work(items[idx++]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}

async function processRows(s: RunState, rows: Row[]) {
  const ready: Row[] = [];
  const seed: Row[] = [];
  for (const r of rows) {
    if (r.contributions_cy_year === s.currentYear && r.contributions_total != null) ready.push(r);
    else seed.push(r);
  }
  const chunks: Row[][] = [];
  for (let i = 0; i < ready.length; i += CY_BATCH) chunks.push(ready.slice(i, i + CY_BATCH));
  await pool(chunks, BATCH_CONCURRENCY, s, (c) => refreshChunk(s, c));
  await pool(seed, SEED_CONCURRENCY, s, (r) => seedRow(s, r));
}

// Share of active players whose building is older than the freshness promise.
async function engagedFreshness(sb: SupabaseClient) {
  const base = () =>
    sb
      .from("developers")
      .select("id", { count: "exact", head: true })
      .eq("claimed", true)
      .gte("last_active_at", ago(ACTIVE_WINDOW_D * DAY));
  const [all, stale] = await Promise.all([
    base(),
    base().or(`fetched_at.is.null,fetched_at.lt.${ago(ENGAGED_SLO_H * HOUR)}`),
  ]);
  if (all.error || stale.error) return null;
  const total = all.count ?? 0;
  const staleCount = stale.count ?? 0;
  return { total, stale: staleCount, share: total > 0 ? staleCount / total : 0 };
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  if (!process.env.GITHUB_TOKEN) {
    await alertCronFailure("refresh-buildings", "GITHUB_TOKEN not set", 0);
    return NextResponse.json({ error: "GITHUB_TOKEN not set" }, { status: 500 });
  }

  const s: RunState = {
    sb: getSupabaseAdmin(),
    deadline: started + RUN_BUDGET_MS,
    nowIso: new Date().toISOString(),
    currentYear: new Date().getFullYear(),
    stopped: null,
    rateRemaining: null,
    consecutiveFailures: 0,
    refreshed: 0,
    seeded: 0,
    missed: 0,
    failed: 0,
    dbErrors: [],
  };

  const perTier: Record<string, number> = {};
  const selectErrors: string[] = [];
  const seen = new Set<number>();
  let budget = PER_RUN;

  try {
    for (const tier of TIERS) {
      perTier[tier.name] = 0;
      while (budget > 0 && !shouldStop(s)) {
        // Rows left un-stamped this run (failed GitHub/DB calls) still sort
        // first; ask for that many extra so a page always has new work.
        const unstamped = s.failed + s.dbErrors.length;
        const limit = Math.min(PAGE, budget) + unstamped;
        const { data, error } = await tier.select(s.sb.from("developers").select(COLUMNS), limit);
        if (error) {
          // One tier's query failing must not cost the others their turn.
          selectErrors.push(`${tier.name}: ${error.message}`);
          break;
        }
        const page = (data ?? []) as Row[];
        const rows = page.filter(
          (r) => typeof r.github_login === "string" && !!r.github_login && !seen.has(r.id),
        );
        for (const r of page) seen.add(r.id);
        if (rows.length === 0) break;
        perTier[tier.name] += rows.length;
        budget -= rows.length;
        await processRows(s, rows);
        if (page.length < limit) break; // tier exhausted
      }
    }
  } catch (err) {
    await alertCronFailure("refresh-buildings", err, Date.now() - started);
    console.error("refresh-buildings crashed:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }

  const freshness = await engagedFreshness(s.sb);
  const problems: string[] = [];
  if (selectErrors.length > 0) problems.push(`candidate query failed (${selectErrors.join("; ")})`);
  if (s.stopped === "github_down") problems.push("GitHub requests kept failing");
  else if (s.failed > 0 && s.refreshed === 0 && s.seeded === 0)
    problems.push(`every GitHub request failed (${s.failed} buildings left for the next run)`);
  if (s.dbErrors.length > 0) problems.push(`${s.dbErrors.length} row updates failed (${s.dbErrors[0]})`);
  if (!freshness) problems.push("freshness check failed");
  else if (freshness.share > ENGAGED_SLO_MAX_STALE_SHARE)
    problems.push(
      `${freshness.stale}/${freshness.total} active players' buildings are older than ${ENGAGED_SLO_H}h`,
    );

  const result = {
    ok: problems.length === 0,
    perTier,
    refreshed: s.refreshed,
    seeded: s.seeded,
    missed: s.missed,
    failed: s.failed,
    stopped: s.stopped,
    rateRemaining: s.rateRemaining,
    engagedStale: freshness,
    seconds: Math.round((Date.now() - started) / 1000),
    problems,
  };

  if (problems.length > 0) {
    console.error("refresh-buildings unhealthy:", JSON.stringify(result));
    await alertCronFailure("refresh-buildings", problems.join(" | "), Date.now() - started);
    return NextResponse.json(result, { status: 500 });
  }
  return NextResponse.json(result);
}
