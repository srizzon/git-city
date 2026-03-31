import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendWeeklyAdReport } from "@/lib/notification-senders/ad-report";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getSupabaseAdmin();
  const results = { sent: 0, skipped: 0, errors: 0 };

  // Deactivate expired ads before generating reports
  try { await sb.rpc("deactivate_expired_ads"); } catch {}

  // Get all advertisers with active ads
  const { data: advertisers } = await sb
    .from("advertiser_accounts")
    .select("id, email, name");

  if (!advertisers || advertisers.length === 0) {
    return NextResponse.json({ ok: true, ...results });
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString().split("T")[0];

  for (const advertiser of advertisers) {
    try {
      // Get advertiser's active ads
      const { data: ads } = await sb
        .from("sky_ads")
        .select("id, brand, text, active")
        .eq("advertiser_id", advertiser.id)
        .eq("active", true);

      if (!ads || ads.length === 0) {
        results.skipped++;
        continue;
      }

      const adIds = ads.map((a) => a.id);

      // Aggregate in Postgres via RPCs (no row limit issues)
      const [currentResult, prevResult] = await Promise.all([
        sb.rpc("get_ad_stats", { p_since: sevenDaysAgo, p_until: null, p_ad_ids: adIds }),
        sb.rpc("get_ad_stats", { p_since: fourteenDaysAgo, p_until: sevenDaysAgo, p_ad_ids: adIds }),
      ]);

      // Per-ad totals
      const adTotals = new Map<string, { impressions: number; engagements: number; linkClicks: number; conversions: number; revenue_cents: number }>();
      let totalImp = 0, totalEng = 0, totalLinks = 0, totalConv = 0, totalRev = 0;

      for (const row of currentResult.data ?? []) {
        const imp = Number(row.impressions);
        const eng = Number(row.clicks);
        const links = Number(row.cta_clicks);
        const conv = Number(row.conversions ?? 0);
        const rev = Number(row.revenue_cents ?? 0);
        adTotals.set(row.ad_id, { impressions: imp, engagements: eng, linkClicks: links, conversions: conv, revenue_cents: rev });
        totalImp += imp;
        totalEng += eng;
        totalLinks += links;
        totalConv += conv;
        totalRev += rev;
      }

      // Skip if zero impressions
      if (totalImp === 0) {
        results.skipped++;
        continue;
      }

      let prevImp = 0, prevEng = 0, prevLinks = 0, prevConv = 0;
      for (const row of prevResult.data ?? []) {
        prevImp += Number(row.impressions);
        prevEng += Number(row.clicks);
        prevLinks += Number(row.cta_clicks);
        prevConv += Number(row.conversions ?? 0);
      }

      const adReports = ads.map((ad) => {
        const t = adTotals.get(ad.id) ?? { impressions: 0, engagements: 0, linkClicks: 0, conversions: 0, revenue_cents: 0 };
        return {
          brand: ad.brand || ad.text.slice(0, 30),
          impressions: t.impressions,
          engagements: t.engagements,
          linkClicks: t.linkClicks,
          conversions: t.conversions,
          ctr: t.impressions > 0 ? ((t.linkClicks / t.impressions) * 100).toFixed(2) + "%" : "0%",
          convRate: t.linkClicks > 0 ? ((t.conversions / t.linkClicks) * 100).toFixed(2) + "%" : "0%",
        };
      });

      const convRate = totalLinks > 0 ? ((totalConv / totalLinks) * 100).toFixed(2) + "%" : "0%";

      await sendWeeklyAdReport({
        advertiserEmail: advertiser.email,
        advertiserName: advertiser.name,
        ads: adReports,
        totals: {
          impressions: totalImp,
          engagements: totalEng,
          linkClicks: totalLinks,
          conversions: totalConv,
          ctr: totalImp > 0 ? ((totalLinks / totalImp) * 100).toFixed(2) + "%" : "0%",
          convRate,
        },
        prevTotals: { impressions: prevImp, engagements: prevEng, linkClicks: prevLinks, conversions: prevConv },
      });

      results.sent++;
    } catch (err) {
      console.error(`Failed to send weekly report to ${advertiser.email}:`, err);
      results.errors++;
    }
  }

  return NextResponse.json({ ok: true, ...results });
}
