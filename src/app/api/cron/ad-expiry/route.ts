import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendAdExpiringEmail, sendAdExpiredEmail } from "@/lib/ad-emails";

export async function GET(request: NextRequest) {
  // Verify Vercel Cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getSupabaseAdmin();
  const results = { expiring: 0, expired: 0, errors: 0 };

  // ── 1. Ads expiring within 48 hours (not yet notified) ──
  try {
    const now = new Date();
    const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    const { data: expiringAds } = await sb
      .from("sky_ads")
      .select("id, brand, purchaser_email, tracking_token, ends_at, expiry_notified")
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
          const trackingUrl = `https://thegitcity.com/advertise/track/${ad.tracking_token}`;

          await sendAdExpiringEmail(
            ad.purchaser_email,
            ad.brand ?? "Your Ad",
            daysLeft,
            trackingUrl,
          );

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

  // ── 2. Ads already expired (send final stats) ──
  try {
    const { data: expiredAds } = await sb
      .from("sky_ads")
      .select("id, brand, purchaser_email, ends_at, expiry_notified")
      .eq("active", true)
      .not("ends_at", "is", null)
      .not("purchaser_email", "is", null)
      .lt("ends_at", new Date().toISOString())
      .neq("expiry_notified", "expired");

    if (expiredAds) {
      for (const ad of expiredAds) {
        try {
          // Get aggregated stats for this ad
          const [impRes, clickRes] = await Promise.all([
            sb
              .from("sky_ad_events")
              .select("id", { count: "exact", head: true })
              .eq("ad_id", ad.id)
              .eq("event_type", "impression"),
            sb
              .from("sky_ad_events")
              .select("id", { count: "exact", head: true })
              .eq("ad_id", ad.id)
              .in("event_type", ["click", "cta_click"]),
          ]);

          await sendAdExpiredEmail(
            ad.purchaser_email,
            ad.brand ?? "Your Ad",
            {
              impressions: impRes.count ?? 0,
              clicks: clickRes.count ?? 0,
            },
            "https://thegitcity.com/advertise",
          );

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

  return NextResponse.json({ ok: true, ...results });
}
