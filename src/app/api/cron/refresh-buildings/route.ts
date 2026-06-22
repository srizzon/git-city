import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { fetchCurrentYearBatch, fetchFullContributions } from "@/lib/github-api";
import { evaluateEmblems } from "@/lib/emblems";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Re-evaluate commit (contributions-based) emblems for a dev whose contribution
// count just changed — so commit emblems unlock without the dev logging in.
// Only `contributions` is known here; other metrics evaluate at their call sites.
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

// ─── Rolling building refresh ────────────────────────────────────────────────
// Nothing else re-syncs an existing building's GitHub contributions (login only
// provisions NEW devs; the profile page refreshes one dev lazily), so without
// this a building can sit frozen for months. This cron refreshes the buildings
// that have gone stalest (oldest `fetched_at` first) so the whole city cycles.
//
// Key insight: past calendar years are immutable — only the CURRENT year grows.
// So we keep the current-year slice (`contributions_cy` for `contributions_cy_year`)
// and refresh just that:
//   new total = (contributions_total − old current-year) + fresh current-year
// The current-year fetch is light enough to batch ~20 logins/request (cost 1),
// so steady-state refresh is cheap and fast.
//
// Legacy rows (and year rollovers) have no valid split yet → they take ONE full
// 10-year fetch (single login/request; batching those 502s) to seed the split.
// After the first full cycle, ~everything is on the cheap path.
//
// Budget: ~2500/run × 12 runs/day (every 2h) → an 83k city cycles in ~3 days,
// so nothing is ever more than a few days stale. GitHub cost is ~1 point per
// request, trivial against the 5000/hour budget. Ranks reorder separately via
// pg_cron (recalculate_ranks).

const CY_BATCH = 20; // logins per current-year GraphQL request
const SEED_CONCURRENCY = 8; // parallel single-login full fetches (seeding)
const PER_RUN = Number(process.env.REFRESH_BUILDINGS_PER_RUN ?? 2500);
const RATE_LIMIT_FLOOR = 500; // stop early if GitHub points get this low

// ─── Eligibility tiers ───────────────────────────────────────────────────────
// A building is only a candidate when it's stale *for its tier* — so we never
// spend GitHub API on a building that's already fresh enough, and the cold long
// tail (unclaimed, never visited, never active) is effectively skipped.
const DAY = 86_400_000;
const ENGAGED_INTERVAL_D = 2; // claimed AND active in the city recently
const OWNER_INTERVAL_D = 10; // claimed but dormant
const VISIBLE_INTERVAL_D = 10; // unclaimed but people open its profile
const COLD_INTERVAL_D = 45; // invisible long tail — near-skipped floor (city doesn't fully rot)
const ACTIVE_WINDOW_D = 30; // "entered the city" within this many days = active
const VISIT_MIN = 5; // profile visits that make a building worth keeping fresh

interface Row {
  id: number;
  github_login: string;
  contributions_total: number | null;
  contributions_cy: number | null;
  contributions_cy_year: number | null;
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.GITHUB_TOKEN) {
    return NextResponse.json({ error: "GITHUB_TOKEN not set" }, { status: 500 });
  }

  const sb = getSupabaseAdmin();
  const currentYear = new Date().getFullYear();
  const nowIso = new Date().toISOString();

  // Only pick buildings that are due for THEIR tier (skips fresh-enough rows and
  // the cold long tail), stalest first. NULL fetched_at (never fetched) is always
  // due — note `fetched_at.lt.X` is NULL-safe-false, so it's listed explicitly.
  const iso = (days: number) => new Date(Date.now() - days * DAY).toISOString();
  const dueFilter = [
    `fetched_at.is.null`,
    `and(claimed.eq.true,last_active_at.gte.${iso(ACTIVE_WINDOW_D)},fetched_at.lt.${iso(ENGAGED_INTERVAL_D)})`,
    `and(claimed.eq.true,fetched_at.lt.${iso(OWNER_INTERVAL_D)})`,
    `and(visit_count.gte.${VISIT_MIN},fetched_at.lt.${iso(VISIBLE_INTERVAL_D)})`,
    `fetched_at.lt.${iso(COLD_INTERVAL_D)}`,
  ].join(",");

  const { data: rows, error } = await sb
    .from("developers")
    .select("id, github_login, contributions_total, contributions_cy, contributions_cy_year")
    .or(dueFilter)
    .order("fetched_at", { ascending: true, nullsFirst: true })
    .limit(PER_RUN);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const candidates = (rows ?? []).filter(
    (r): r is Row => typeof r.github_login === "string" && !!r.github_login,
  );
  if (candidates.length === 0) {
    return NextResponse.json({ ok: true, scanned: 0, refreshed: 0, seeded: 0, missed: 0 });
  }

  let refreshed = 0;
  let seeded = 0;
  let missed = 0;
  let stoppedForRateLimit = false;
  let rateRemaining: number | null = null;

  const updateRow = async (id: number, fields: Record<string, unknown>) => {
    const { error: e } = await sb.from("developers").update(fields).eq("id", id);
    if (e) console.error("refresh-buildings update error:", e.message);
  };
  const bumpFetched = async (ids: number[]) => {
    if (ids.length === 0) return;
    await sb.from("developers").update({ fetched_at: nowIso }).in("id", ids);
  };

  // Split-ready (cheap incremental current-year) vs needs-seed (full 10-year).
  const ready: Row[] = [];
  const seed: Row[] = [];
  for (const r of candidates) {
    if (r.contributions_cy_year === currentYear && r.contributions_total != null) ready.push(r);
    else seed.push(r);
  }

  // ── Cheap path: batched current-year, total = prior + fresh ────────────────
  const byLogin = new Map<string, Row>();
  for (const r of ready) byLogin.set(r.github_login.toLowerCase(), r);

  for (let i = 0; i < ready.length && !stoppedForRateLimit; i += CY_BATCH) {
    const chunk = ready.slice(i, i + CY_BATCH).map((r) => r.github_login);
    const { results, rateLimit } = await fetchCurrentYearBatch(chunk);
    if (rateLimit) {
      rateRemaining = rateLimit.remaining;
      if (rateLimit.remaining < RATE_LIMIT_FLOOR) stoppedForRateLimit = true;
    }

    const missIds: number[] = [];
    for (const login of chunk) {
      const r = byLogin.get(login.toLowerCase());
      if (!r) continue;
      const fresh = results.get(login.toLowerCase());
      if (fresh == null) {
        missIds.push(r.id);
        continue;
      }
      const prior = (r.contributions_total ?? 0) - (r.contributions_cy ?? 0);
      const newTotal = Math.max(0, prior + fresh);
      // Keep `contributions` (rank key) == total so ranking reflects the sum.
      await updateRow(r.id, {
        contributions: newTotal,
        contributions_total: newTotal,
        contributions_cy: fresh,
        fetched_at: nowIso,
      });
      // Unlock commit emblems offline when the count actually grew.
      if (newTotal > (r.contributions_total ?? 0)) {
        await evaluateCommitEmblems(r.id, newTotal, r.github_login);
      }
      refreshed++;
    }
    await bumpFetched(missIds);
    missed += missIds.length;
  }

  // ── Seed path: one full 10-year fetch per login to establish the split ─────
  if (!stoppedForRateLimit && seed.length > 0) {
    let idx = 0;
    const worker = async () => {
      while (idx < seed.length && !stoppedForRateLimit) {
        const r = seed[idx++];
        const full = await fetchFullContributions(r.github_login);
        if (!full) {
          // Deleted / suspended / org / transient — stamp so the cursor advances.
          await bumpFetched([r.id]);
          missed++;
          continue;
        }
        await updateRow(r.id, {
          contributions: full.contributions_total,
          contributions_total: full.contributions_total,
          contribution_years: full.contribution_years,
          contributions_cy: full.current_year_value,
          contributions_cy_year: full.current_year,
          fetched_at: nowIso,
        });
        await evaluateCommitEmblems(r.id, full.contributions_total, r.github_login);
        seeded++;
      }
    };
    await Promise.all(Array.from({ length: SEED_CONCURRENCY }, () => worker()));
  }

  return NextResponse.json({
    ok: true,
    scanned: candidates.length,
    refreshed,
    seeded,
    missed,
    stoppedForRateLimit,
    rateRemaining,
  });
}
