import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAdvertiserFromCookies } from "@/lib/advertiser-auth";
import { verifyApiKey } from "@/lib/advertiser-api-auth";

export const dynamic = "force-dynamic";

function getPeriodDays(period: string): number | null {
  switch (period) {
    case "7d": return 7;
    case "30d": return 30;
    case "90d": return 90;
    case "all": return null;
    default: return 30;
  }
}

async function getAdvertiserId(request: NextRequest): Promise<string | null> {
  // Try API key first
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer gc_ak_")) {
    return verifyApiKey(authHeader.slice(7));
  }
  // Fall back to cookie session
  const advertiser = await getAdvertiserFromCookies();
  return advertiser?.id ?? null;
}

export async function GET(request: NextRequest) {
  const advertiserId = await getAdvertiserId(request);
  if (!advertiserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getSupabaseAdmin();
  const period = request.nextUrl.searchParams.get("period") ?? "30d";
  const filterAdId = request.nextUrl.searchParams.get("ad_id");
  const days = getPeriodDays(period);

  // Get advertiser's ads
  const { data: ads } = await sb
    .from("sky_ads")
    .select("id, brand, text, description, color, bg_color, vehicle, active, priority, plan_id, starts_at, ends_at, created_at, link, amount_paid_cents, currency")
    .eq("advertiser_id", advertiserId);

  if (!ads || ads.length === 0) {
    return NextResponse.json({
      ads: [],
      totals: { impressions: 0, clicks: 0, cta_clicks: 0, ctr: "0.00%" },
      daily: [],
    });
  }

  const adIds = ads.map((a) => a.id);
  const queryAdIds = filterAdId && adIds.includes(filterAdId) ? [filterAdId] : adIds;

  const since = days ? new Date(Date.now() - days * 86400000).toISOString().split("T")[0] : null;
  const prevSince = days ? new Date(Date.now() - days * 2 * 86400000).toISOString().split("T")[0] : null;
  const prevUntil = since;

  // Aggregate in Postgres via RPCs (no row limit issues)
  const [currentResult, dailyResult] = await Promise.all([
    sb.rpc("get_ad_stats", { p_since: since, p_until: null, p_ad_ids: queryAdIds }),
    sb.rpc("get_ad_daily_stats", { p_since: since, p_until: null, p_ad_ids: queryAdIds }),
  ]);

  const prevResult = days
    ? await sb.rpc("get_ad_stats", { p_since: prevSince, p_until: prevUntil, p_ad_ids: queryAdIds })
    : null;

  // Build per-ad stats map
  const adStats = new Map<string, { impressions: number; clicks: number; cta_clicks: number; conversions: number; revenue_cents: number }>();
  for (const row of currentResult.data ?? []) {
    adStats.set(row.ad_id, {
      impressions: Number(row.impressions),
      clicks: Number(row.clicks),
      cta_clicks: Number(row.cta_clicks),
      conversions: Number(row.conversions ?? 0),
      revenue_cents: Number(row.revenue_cents ?? 0),
    });
  }

  // Build daily chart data
  const dailyMap = new Map<string, { impressions: number; clicks: number; conversions: number }>();
  for (const row of dailyResult.data ?? []) {
    const dayCur = dailyMap.get(row.day) ?? { impressions: 0, clicks: 0, conversions: 0 };
    dayCur.impressions += Number(row.impressions);
    dayCur.clicks += Number(row.clicks) + Number(row.cta_clicks);
    dayCur.conversions += Number(row.conversions ?? 0);
    dailyMap.set(row.day, dayCur);
  }

  // Previous period totals
  const prevTotals = { impressions: 0, clicks: 0, cta_clicks: 0, conversions: 0, revenue_cents: 0 };
  for (const row of prevResult?.data ?? []) {
    prevTotals.impressions += Number(row.impressions);
    prevTotals.clicks += Number(row.clicks);
    prevTotals.cta_clicks += Number(row.cta_clicks);
    prevTotals.conversions += Number(row.conversions ?? 0);
    prevTotals.revenue_cents += Number(row.revenue_cents ?? 0);
  }

  // Build response
  const totals = { impressions: 0, clicks: 0, cta_clicks: 0, conversions: 0, revenue_cents: 0 };
  const adsResponse = ads.map((ad) => {
    const s = adStats.get(ad.id) ?? { impressions: 0, clicks: 0, cta_clicks: 0, conversions: 0, revenue_cents: 0 };
    totals.impressions += s.impressions;
    totals.clicks += s.clicks;
    totals.cta_clicks += s.cta_clicks;
    totals.conversions += s.conversions;
    totals.revenue_cents += s.revenue_cents;

    // CPC = amount paid / link clicks
    let cpc: string | null = null;
    if (ad.amount_paid_cents && s.cta_clicks > 0) {
      const cpcValue = ad.amount_paid_cents / 100 / s.cta_clicks;
      const symbol = ad.currency === "brl" ? "R$" : "$";
      cpc = `${symbol}${cpcValue.toFixed(2)}`;
    }

    return {
      ...ad,
      impressions: s.impressions,
      clicks: s.clicks,
      cta_clicks: s.cta_clicks,
      conversions: s.conversions,
      revenue_cents: s.revenue_cents,
      ctr: s.impressions > 0 ? ((s.cta_clicks / s.impressions) * 100).toFixed(2) + "%" : "0.00%",
      cpc,
    };
  });

  const ctr = totals.impressions > 0 ? ((totals.cta_clicks / totals.impressions) * 100).toFixed(2) + "%" : "0.00%";

  // Percentage changes
  function pctChange(current: number, prev: number): number {
    if (prev === 0) return current > 0 ? 100 : 0;
    return ((current - prev) / prev) * 100;
  }

  const daily = Array.from(dailyMap.entries())
    .map(([day, d]) => ({ day, ...d }))
    .sort((a, b) => a.day.localeCompare(b.day));

  const convRate = totals.cta_clicks > 0
    ? ((totals.conversions / totals.cta_clicks) * 100).toFixed(2) + "%"
    : "0.00%";

  return NextResponse.json(
    {
      ads: adsResponse,
      totals: {
        impressions: totals.impressions,
        clicks: totals.clicks,
        cta_clicks: totals.cta_clicks,
        conversions: totals.conversions,
        revenue_cents: totals.revenue_cents,
        ctr,
        conv_rate: convRate,
        changes: {
          impressions: pctChange(totals.impressions, prevTotals.impressions),
          clicks: pctChange(totals.clicks, prevTotals.clicks),
          cta_clicks: pctChange(totals.cta_clicks, prevTotals.cta_clicks),
          conversions: pctChange(totals.conversions, prevTotals.conversions),
        },
      },
      daily,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
