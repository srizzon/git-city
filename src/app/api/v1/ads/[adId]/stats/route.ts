import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAdvertiserFromCookies } from "@/lib/advertiser-auth";
import { verifyApiKey } from "@/lib/advertiser-api-auth";
import { rateLimit } from "@/lib/rate-limit";

async function getAdvertiserId(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer gc_ak_")) {
    return verifyApiKey(authHeader.slice(7));
  }
  const advertiser = await getAdvertiserFromCookies();
  return advertiser?.id ?? null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ adId: string }> },
) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { ok } = rateLimit(`api:${ip}`, 60, 60_000);
  if (!ok) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const advertiserId = await getAdvertiserId(request);
  if (!advertiserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { adId } = await params;
  const sb = getSupabaseAdmin();

  // Verify ownership
  const { data: ad } = await sb
    .from("sky_ads")
    .select("id, amount_paid_cents, currency")
    .eq("id", adId)
    .eq("advertiser_id", advertiserId)
    .maybeSingle();

  if (!ad) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const period = request.nextUrl.searchParams.get("period") ?? "30d";
  const days = period === "7d" ? 7 : period === "90d" ? 90 : period === "all" ? null : 30;
  const since = days ? new Date(Date.now() - days * 86400000).toISOString().split("T")[0] : null;

  // Aggregate in Postgres via RPC (no row limit issues)
  const { data: dailyStats } = await sb.rpc("get_ad_daily_stats", {
    p_since: since,
    p_until: null,
    p_ad_ids: [adId],
  });

  let impressions = 0, clicks = 0, cta_clicks = 0, conversions = 0, revenue_cents = 0;
  const daily: { day: string; impressions: number; clicks: number; cta_clicks: number; conversions: number; revenue_cents: number }[] = [];

  for (const row of dailyStats ?? []) {
    const imp = Number(row.impressions);
    const clk = Number(row.clicks);
    const cta = Number(row.cta_clicks);
    const conv = Number(row.conversions ?? 0);
    const rev = Number(row.revenue_cents ?? 0);
    impressions += imp;
    clicks += clk;
    cta_clicks += cta;
    conversions += conv;
    revenue_cents += rev;
    daily.push({ day: row.day, impressions: imp, clicks: clk, cta_clicks: cta, conversions: conv, revenue_cents: rev });
  }

  const ctr = impressions > 0 ? ((cta_clicks / impressions) * 100).toFixed(2) + "%" : "0.00%";
  const conv_rate = cta_clicks > 0 ? ((conversions / cta_clicks) * 100).toFixed(2) + "%" : "0.00%";

  let cpc: string | null = null;
  if (ad.amount_paid_cents && cta_clicks > 0) {
    const cpcValue = ad.amount_paid_cents / 100 / cta_clicks;
    const symbol = ad.currency === "brl" ? "R$" : "$";
    cpc = `${symbol}${cpcValue.toFixed(2)}`;
  }

  return NextResponse.json({
    ad_id: adId,
    period,
    impressions,
    clicks,
    cta_clicks,
    conversions,
    revenue_cents,
    ctr,
    cpc,
    conv_rate,
    daily,
  }, {
    headers: { "Cache-Control": "private, max-age=60" },
  });
}
