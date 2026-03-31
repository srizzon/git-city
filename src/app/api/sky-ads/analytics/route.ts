import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getGithubLoginFromUser, isAdminGithubLogin } from "@/lib/admin";

// Historical baselines from Himetrica (tracking was lost in Supabase due to www origin bug).
// These get added on top of live Supabase counts. Remove once Supabase data catches up.
// To get per-ad numbers: filter Himetrica events by ad_id property.
const HISTORICAL_BASELINES: Record<string, { impressions: number; clicks: number; cta_clicks: number }> = {
  "gitcity":   { impressions: 311161, clicks: 2527, cta_clicks: 1110 },
  "samuel":    { impressions: 280045, clicks: 2274, cta_clicks: 999 },
  "build":     { impressions: 248929, clicks: 2022, cta_clicks: 888 },
  "advertise": { impressions: 31116,  clicks: 253,  cta_clicks: 110 },
};

export async function GET(request: Request) {
  // Auth check
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const login = getGithubLoginFromUser(user);
  if (!isAdminGithubLogin(login)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period") ?? "30d";

  // Refresh materialized view (ignore errors - view may be empty on first run)
  try { await admin.rpc("refresh_sky_ad_stats"); } catch {}

  // Build date filter
  let since: string | null = null;
  if (period === "7d") {
    since = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
  } else if (period === "30d") {
    since = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
  }

  // Aggregate in Postgres via RPC (no row limit issues)
  const { data: stats, error } = await admin.rpc("get_ad_stats", {
    p_since: since,
    p_until: null,
    p_ad_ids: null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Get all ads with full details
  const { data: allAds } = await admin.from("sky_ads").select("id, brand, text, description, color, bg_color, link, active, vehicle, priority, plan_id, starts_at, ends_at, purchaser_email, tracking_token, created_at, amount_paid_cents, currency");
  const adMap = new Map((allAds ?? []).map((a) => [a.id, a]));

  // Build aggregated map from RPC results + historical baselines
  const aggregated = new Map<string, { impressions: number; clicks: number; cta_clicks: number }>();
  for (const row of stats ?? []) {
    aggregated.set(row.ad_id, {
      impressions: Number(row.impressions),
      clicks: Number(row.clicks),
      cta_clicks: Number(row.cta_clicks),
    });
  }

  // Merge historical baselines (only for "all" period since these predate Supabase tracking)
  if (period === "all") {
    for (const [adId, baseline] of Object.entries(HISTORICAL_BASELINES)) {
      const cur = aggregated.get(adId) ?? { impressions: 0, clicks: 0, cta_clicks: 0 };
      cur.impressions += baseline.impressions;
      cur.clicks += baseline.clicks;
      cur.cta_clicks += baseline.cta_clicks;
      aggregated.set(adId, cur);
    }
  }

  // Fetch last 7 days of daily stats for spark charts
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
  const { data: dailyStats } = await admin.rpc("get_ad_daily_stats", {
    p_since: sevenDaysAgo,
    p_until: null,
    p_ad_ids: null,
  });

  // Build daily map: ad_id -> { day -> impressions }
  const dailyByAd = new Map<string, Map<string, number>>();
  for (const row of dailyStats ?? []) {
    let dayMap = dailyByAd.get(row.ad_id);
    if (!dayMap) {
      dayMap = new Map();
      dailyByAd.set(row.ad_id, dayMap);
    }
    dayMap.set(row.day, (dayMap.get(row.day) ?? 0) + Number(row.impressions));
  }

  // Generate ordered array of last 7 days
  const last7Days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    last7Days.push(new Date(Date.now() - i * 86400000).toISOString().split("T")[0]);
  }

  function buildAdEntry(id: string, s: { impressions: number; clicks: number; cta_clicks: number }) {
    const ad = adMap.get(id);
    const dayMap = dailyByAd.get(id);
    const daily = last7Days.map((d) => dayMap?.get(d) ?? 0);
    const amountCents = ad?.amount_paid_cents ?? null;
    const cur = ad?.currency ?? null;

    // CPC = amount paid / link clicks
    let cpc: string | null = null;
    if (amountCents && s.cta_clicks > 0) {
      const cpcValue = amountCents / 100 / s.cta_clicks;
      const symbol = cur === "brl" ? "R$" : "$";
      cpc = `${symbol}${cpcValue.toFixed(2)}`;
    }

    return {
      id,
      brand: ad?.brand ?? id,
      text: ad?.text ?? "",
      description: ad?.description ?? null,
      color: ad?.color ?? "#f8d880",
      bg_color: ad?.bg_color ?? "#1a1018",
      link: ad?.link ?? null,
      vehicle: ad?.vehicle ?? "plane",
      active: ad?.active ?? false,
      priority: ad?.priority ?? 0,
      plan_id: ad?.plan_id ?? null,
      starts_at: ad?.starts_at ?? null,
      ends_at: ad?.ends_at ?? null,
      purchaser_email: ad?.purchaser_email ?? null,
      tracking_token: ad?.tracking_token ?? null,
      created_at: ad?.created_at ?? null,
      amount_paid_cents: amountCents,
      currency: cur,
      impressions: s.impressions,
      clicks: s.clicks,
      cta_clicks: s.cta_clicks,
      ctr: s.impressions > 0 ? ((s.cta_clicks / s.impressions) * 100).toFixed(2) + "%" : "0%",
      cpc,
      daily,
    };
  }

  const ads = Array.from(aggregated.entries()).map(([id, s]) => buildAdEntry(id, s));

  // Include ads with zero events
  for (const [id] of adMap) {
    if (!aggregated.has(id)) {
      ads.push(buildAdEntry(id, { impressions: 0, clicks: 0, cta_clicks: 0 }));
    }
  }

  return NextResponse.json({ ads }, {
    headers: { "Cache-Control": "private, max-age=30" },
  });
}
