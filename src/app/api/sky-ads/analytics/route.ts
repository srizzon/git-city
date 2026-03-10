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
  let dayFilter: string | null = null;
  if (period === "7d") {
    dayFilter = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
  } else if (period === "30d") {
    dayFilter = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
  }

  // Query aggregated stats
  let query = admin.from("sky_ad_daily_stats").select("ad_id, day, impressions, clicks, cta_clicks");
  if (dayFilter) {
    query = query.gte("day", dayFilter);
  }
  const { data: stats, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Get all ads with full details
  const { data: allAds } = await admin.from("sky_ads").select("id, brand, text, description, color, bg_color, link, active, vehicle, priority, plan_id, starts_at, ends_at, purchaser_email, tracking_token, created_at");
  const adMap = new Map((allAds ?? []).map((a) => [a.id, a]));

  // Aggregate by ad_id (live Supabase data + historical baselines)
  const aggregated = new Map<string, { impressions: number; clicks: number; cta_clicks: number }>();
  for (const row of stats ?? []) {
    const cur = aggregated.get(row.ad_id) ?? { impressions: 0, clicks: 0, cta_clicks: 0 };
    cur.impressions += Number(row.impressions);
    cur.clicks += Number(row.clicks);
    cur.cta_clicks += Number(row.cta_clicks);
    aggregated.set(row.ad_id, cur);
  }
  // Merge historical baselines
  for (const [adId, baseline] of Object.entries(HISTORICAL_BASELINES)) {
    const cur = aggregated.get(adId) ?? { impressions: 0, clicks: 0, cta_clicks: 0 };
    cur.impressions += baseline.impressions;
    cur.clicks += baseline.clicks;
    cur.cta_clicks += baseline.cta_clicks;
    aggregated.set(adId, cur);
  }

  function buildAdEntry(id: string, s: { impressions: number; clicks: number; cta_clicks: number }) {
    const ad = adMap.get(id);
    const totalClicks = s.clicks + s.cta_clicks;
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
      impressions: s.impressions,
      clicks: s.clicks,
      cta_clicks: s.cta_clicks,
      ctr: s.impressions > 0 ? ((totalClicks / s.impressions) * 100).toFixed(2) + "%" : "0%",
    };
  }

  const ads = Array.from(aggregated.entries()).map(([id, s]) => buildAdEntry(id, s));

  // Include ads with zero events
  for (const [id] of adMap) {
    if (!aggregated.has(id)) {
      ads.push(buildAdEntry(id, { impressions: 0, clicks: 0, cta_clicks: 0 }));
    }
  }

  return NextResponse.json({ ads });
}
