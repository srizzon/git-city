import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendJobWeeklyPerformanceReport } from "@/lib/notification-senders/job-performance-report";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const twoWeeksAgo = new Date(now.getTime() - 14 * 86_400_000).toISOString();
  const results = { sent: 0, skipped: 0, errors: 0 };

  // Get all companies with advertiser
  const { data: companies } = await admin
    .from("job_company_profiles")
    .select("id, name, advertiser_id")
    .not("advertiser_id", "is", null);

  if (!companies) return NextResponse.json({ ok: true, ...results });

  for (const company of companies) {
    try {
      const { data: advertiser } = await admin
        .from("advertiser_accounts")
        .select("email")
        .eq("id", company.advertiser_id!)
        .single();

      if (!advertiser?.email) {
        results.skipped++;
        continue;
      }

      // Get listings that have been visible this week
      const { data: listings } = await admin
        .from("job_listings")
        .select("id, title, status")
        .eq("company_id", company.id)
        .in("status", ["active", "paused", "filled", "expired"]);

      if (!listings || listings.length === 0) {
        results.skipped++;
        continue;
      }

      const listingIds = listings.map((l) => l.id);

      // Count events per listing+type in 2 queries (not loading all rows)
      const [thisWeekRes, prevWeekRes] = await Promise.all([
        admin.rpc("count_job_events_by_listing", {
          p_listing_ids: listingIds,
          p_from: oneWeekAgo,
          p_to: now.toISOString(),
        }),
        admin.rpc("count_job_events_by_listing", {
          p_listing_ids: listingIds,
          p_from: twoWeeksAgo,
          p_to: oneWeekAgo,
        }),
      ]);

      // Fallback: if RPC doesn't exist yet, use simple counting
      const thisWeek = (thisWeekRes.data ?? []) as { listing_id: string; event_type: string; cnt: number }[];
      const prevWeek = (prevWeekRes.data ?? []) as { listing_id: string; event_type: string; cnt: number }[];

      const getCount = (rows: typeof thisWeek, listingId: string, eventType: string) =>
        rows.find((r) => r.listing_id === listingId && r.event_type === eventType)?.cnt ?? 0;

      const listingStats = listings.map((l) => ({
        title: l.title,
        views: getCount(thisWeek, l.id, "view"),
        applies: getCount(thisWeek, l.id, "apply_click"),
        profileViews: getCount(thisWeek, l.id, "profile_copy"),
        status: l.status,
      }));

      const totals = {
        views: listingStats.reduce((s, l) => s + l.views, 0),
        applies: listingStats.reduce((s, l) => s + l.applies, 0),
        profileViews: listingStats.reduce((s, l) => s + l.profileViews, 0),
      };

      if (totals.views === 0 && totals.applies === 0 && totals.profileViews === 0) {
        results.skipped++;
        continue;
      }

      const prevTotals = {
        views: listingIds.reduce((s, id) => s + getCount(prevWeek, id, "view"), 0),
        applies: listingIds.reduce((s, id) => s + getCount(prevWeek, id, "apply_click"), 0),
        profileViews: listingIds.reduce((s, id) => s + getCount(prevWeek, id, "profile_copy"), 0),
      };

      await sendJobWeeklyPerformanceReport({
        companyName: company.name,
        companyEmail: advertiser.email,
        listings: listingStats,
        totals,
        prevTotals,
      });

      results.sent++;
    } catch (err) {
      console.error(`[jobs-weekly-report] Failed for company ${company.id}:`, err);
      results.errors++;
    }
  }

  return NextResponse.json({ ok: true, ...results });
}
