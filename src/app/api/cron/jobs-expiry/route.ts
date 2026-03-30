import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { EXPIRY_WARNING_DAYS } from "@/lib/jobs/constants";
import { sendJobExpiringEmail, sendJobExpiredEmail } from "@/lib/notification-senders/job-expiry";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const now = new Date();
  const warningDate = new Date(now.getTime() + EXPIRY_WARNING_DAYS * 24 * 60 * 60 * 1000);
  const results = { expiring: 0, expired: 0, errors: 0 };

  // 1. Listings expiring soon (not yet notified)
  try {
    const { data: expiringSoon } = await admin
      .from("job_listings")
      .select("id, title, expires_at, view_count, apply_count, company:job_company_profiles!inner(advertiser_id)")
      .eq("status", "active")
      .lte("expires_at", warningDate.toISOString())
      .gt("expires_at", now.toISOString())
      .is("expiry_notified", null);

    if (expiringSoon) {
      for (const listing of expiringSoon) {
        try {
          const comp = listing.company as unknown as { advertiser_id: string | null };
          if (!comp.advertiser_id) continue;

          const { data: advertiser } = await admin
            .from("advertiser_accounts")
            .select("email")
            .eq("id", comp.advertiser_id)
            .single();

          if (!advertiser?.email) continue;

          const expiresAt = new Date(listing.expires_at);
          const daysLeft = Math.max(1, Math.ceil((expiresAt.getTime() - now.getTime()) / 86_400_000));

          await sendJobExpiringEmail(
            advertiser.email,
            listing.title,
            daysLeft,
            { views: listing.view_count ?? 0, applies: listing.apply_count ?? 0 },
          );

          await admin
            .from("job_listings")
            .update({ expiry_notified: "expiring" })
            .eq("id", listing.id);

          results.expiring++;
        } catch (err) {
          console.error(`[jobs-expiry] Failed expiring email for ${listing.id}:`, err);
          results.errors++;
        }
      }
    }
  } catch (err) {
    console.error("[jobs-expiry] Error querying expiring listings:", err);
    results.errors++;
  }

  // 2. Listings that have expired (send final stats + update status)
  try {
    const { data: expired } = await admin
      .from("job_listings")
      .select("id, title, view_count, apply_count, company_id, company:job_company_profiles!inner(advertiser_id, hired_count)")
      .eq("status", "active")
      .lte("expires_at", now.toISOString());

    if (expired && expired.length > 0) {
      const expiredIds = expired.map((l) => l.id);
      await admin
        .from("job_listings")
        .update({ status: "expired", expiry_notified: "expired" })
        .in("id", expiredIds);

      for (const listing of expired) {
        try {
          const comp = listing.company as unknown as { advertiser_id: string | null; hired_count: number };
          if (!comp.advertiser_id) continue;

          const { data: advertiser } = await admin
            .from("advertiser_accounts")
            .select("email")
            .eq("id", comp.advertiser_id)
            .single();

          if (!advertiser?.email) continue;

          // Count hires for this specific listing
          const { count: hireCount } = await admin
            .from("job_applications")
            .select("*", { count: "exact", head: true })
            .eq("listing_id", listing.id)
            .eq("status", "hired");

          await sendJobExpiredEmail(
            advertiser.email,
            listing.title,
            {
              views: listing.view_count ?? 0,
              applies: listing.apply_count ?? 0,
              hires: hireCount ?? 0,
            },
          );

          results.expired++;
        } catch (err) {
          console.error(`[jobs-expiry] Failed expired email for ${listing.id}:`, err);
          results.errors++;
        }
      }
    }
  } catch (err) {
    console.error("[jobs-expiry] Error querying expired listings:", err);
    results.errors++;
  }

  return NextResponse.json({ ok: true, ...results, timestamp: now.toISOString() });
}
