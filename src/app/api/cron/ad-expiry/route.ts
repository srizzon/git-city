import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  sendAdExpiringEmail,
  sendAdExpiredEmail,
  sendAdFollowup7dEmail,
  sendAdFollowup30dEmail,
} from "@/lib/ad-emails";
import type { AdStats } from "@/lib/ad-emails";

export async function GET(request: NextRequest) {
  // Verify Vercel Cron secret
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getSupabaseAdmin();
  const results = { expiring: 0, expired: 0, followup_7d: 0, followup_30d: 0, errors: 0 };

  // Helper: get ad stats (impressions, clicks, link clicks, unique countries).
  // CTR is link clicks over impressions, the same as the advertiser dashboard.
  async function getAdStats(adId: string): Promise<AdStats> {
    const countEvents = (eventType: string) =>
      sb
        .from("sky_ad_events")
        .select("id", { count: "exact", head: true })
        .eq("ad_id", adId)
        .eq("event_type", eventType);

    const [impRes, clickRes, linkRes, countryRes] = await Promise.all([
      countEvents("impression"),
      countEvents("click"),
      countEvents("cta_click"),
      sb.rpc("count_ad_countries", { p_ad_id: adId }),
    ]);

    return {
      impressions: impRes.count ?? 0,
      clicks: clickRes.count ?? 0,
      linkClicks: linkRes.count ?? 0,
      countries: typeof countryRes.data === "number" ? countryRes.data : undefined,
    };
  }

  // Helper: get total devs in city
  async function getCityDevs(): Promise<number> {
    const { count } = await sb
      .from("developers")
      .select("id", { count: "exact", head: true });
    return count ?? 0;
  }

  // Helper: get devs count at a specific date
  async function getCityDevsAt(date: string): Promise<number> {
    const { count } = await sb
      .from("developers")
      .select("id", { count: "exact", head: true })
      .lte("created_at", date);
    return count ?? 0;
  }

  const now = new Date();

  // ── 1. Ads expiring within 48 hours (not yet notified) ──
  try {
    const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    const { data: expiringAds } = await sb
      .from("sky_ads")
      .select("id, brand, purchaser_email, ends_at, expiry_notified")
      .eq("active", true)
      .not("ends_at", "is", null)
      .not("purchaser_email", "is", null)
      .lte("ends_at", in48h.toISOString())
      .gt("ends_at", now.toISOString())
      .is("expiry_notified", null);

    if (expiringAds) {
      for (const ad of expiringAds) {
        try {
          const endsAt = new Date(ad.ends_at);
          const daysLeft = Math.max(1, Math.ceil((endsAt.getTime() - now.getTime()) / 86_400_000));
          const stats = await getAdStats(ad.id);

          await sendAdExpiringEmail(ad.purchaser_email, ad.brand ?? null, daysLeft, stats);

          await sb
            .from("sky_ads")
            .update({ expiry_notified: "expiring" })
            .eq("id", ad.id);

          results.expiring++;
        } catch (err) {
          console.error(`Failed to send expiring email for ad ${ad.id}:`, err);
          results.errors++;
        }
      }
    }
  } catch (err) {
    console.error("Error querying expiring ads:", err);
    results.errors++;
  }

  // Expired ads are flipped to active=false by pg_cron every 15 min
  // (deactivate_expired_ads), so steps 2-4 must not filter on active. Each step
  // only looks at a recent ends_at window so old ads never get a late email.

  // ── 2. Ads already expired (send final stats) ──
  try {
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

    // expiry_notified is NULL (never notified) or "expiring"; .neq() alone drops NULLs.
    const { data: expiredAds } = await sb
      .from("sky_ads")
      .select("id, brand, purchaser_email, ends_at, expiry_notified")
      .not("ends_at", "is", null)
      .not("purchaser_email", "is", null)
      .lt("ends_at", now.toISOString())
      .gte("ends_at", threeDaysAgo.toISOString())
      .or("expiry_notified.is.null,expiry_notified.eq.expiring");

    if (expiredAds) {
      for (const ad of expiredAds) {
        try {
          const stats = await getAdStats(ad.id);

          await sendAdExpiredEmail(ad.purchaser_email, ad.brand ?? null, stats);

          await sb
            .from("sky_ads")
            .update({ expiry_notified: "expired" })
            .eq("id", ad.id);

          results.expired++;
        } catch (err) {
          console.error(`Failed to send expired email for ad ${ad.id}:`, err);
          results.errors++;
        }
      }
    }
  } catch (err) {
    console.error("Error querying expired ads:", err);
    results.errors++;
  }

  // ── 3. 7-day follow-up ──
  try {
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);

    const { data: followupAds } = await sb
      .from("sky_ads")
      .select("id, brand, purchaser_email, ends_at")
      .eq("expiry_notified", "expired")
      .not("ends_at", "is", null)
      .not("purchaser_email", "is", null)
      .lt("ends_at", sevenDaysAgo.toISOString())
      .gte("ends_at", tenDaysAgo.toISOString());

    if (followupAds) {
      const cityDevs = await getCityDevs();

      for (const ad of followupAds) {
        try {
          const stats = await getAdStats(ad.id);

          await sendAdFollowup7dEmail(
            ad.purchaser_email,
            ad.brand ?? null,
            stats,
            cityDevs,
          );

          await sb
            .from("sky_ads")
            .update({ expiry_notified: "followup_7d" })
            .eq("id", ad.id);

          results.followup_7d++;
        } catch (err) {
          console.error(`Failed to send 7d followup for ad ${ad.id}:`, err);
          results.errors++;
        }
      }
    }
  } catch (err) {
    console.error("Error querying 7d followup ads:", err);
    results.errors++;
  }

  // ── 4. 30-day win-back ──
  try {
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const thirtyThreeDaysAgo = new Date(now.getTime() - 33 * 24 * 60 * 60 * 1000);

    const { data: winbackAds } = await sb
      .from("sky_ads")
      .select("id, brand, purchaser_email, ends_at")
      .eq("expiry_notified", "followup_7d")
      .not("ends_at", "is", null)
      .not("purchaser_email", "is", null)
      .lt("ends_at", thirtyDaysAgo.toISOString())
      .gte("ends_at", thirtyThreeDaysAgo.toISOString());

    if (winbackAds) {
      const cityDevs = await getCityDevs();

      for (const ad of winbackAds) {
        try {
          const stats = await getAdStats(ad.id);
          const cityDevsWhenEnded = await getCityDevsAt(ad.ends_at);

          await sendAdFollowup30dEmail(
            ad.purchaser_email,
            ad.brand ?? null,
            stats,
            cityDevs,
            cityDevsWhenEnded,
          );

          await sb
            .from("sky_ads")
            .update({ expiry_notified: "followup_30d" })
            .eq("id", ad.id);

          results.followup_30d++;
        } catch (err) {
          console.error(`Failed to send 30d winback for ad ${ad.id}:`, err);
          results.errors++;
        }
      }
    }
  } catch (err) {
    console.error("Error querying 30d winback ads:", err);
    results.errors++;
  }

  return NextResponse.json({ ok: true, ...results });
}
