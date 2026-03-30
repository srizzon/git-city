import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  sendJobApplicationReceivedEmail,
  sendJobApplicationsBatchEmail,
} from "@/lib/notification-senders/job-application-received";

/**
 * Flushes the job_application_email_queue.
 * Groups queued applications by listing_id:
 *   - 1 application  -> detailed single-candidate email
 *   - 2+ applications -> batch digest email
 * Runs every 15 minutes via Vercel Cron.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const results = { sent: 0, skipped: 0, errors: 0, queued: 0 };

  // Grab all pending queue items (oldest first, cap at 500)
  const { data: items } = await admin
    .from("job_application_email_queue")
    .select("id, listing_id, developer_login, has_profile")
    .order("created_at", { ascending: true })
    .limit(500);

  if (!items || items.length === 0) {
    return NextResponse.json({ ok: true, ...results });
  }

  results.queued = items.length;

  // Group by listing_id
  const byListing = new Map<string, typeof items>();
  for (const item of items) {
    const existing = byListing.get(item.listing_id) ?? [];
    existing.push(item);
    byListing.set(item.listing_id, existing);
  }

  for (const [listingId, applications] of byListing) {
    try {
      // Get listing + company email
      const { data: listing } = await admin
        .from("job_listings")
        .select("title, company:job_company_profiles!inner(advertiser_id)")
        .eq("id", listingId)
        .single();

      if (!listing) {
        results.skipped += applications.length;
        continue;
      }

      const comp = listing.company as unknown as { advertiser_id: string | null };
      if (!comp.advertiser_id) {
        results.skipped += applications.length;
        continue;
      }

      const { data: advertiser } = await admin
        .from("advertiser_accounts")
        .select("email")
        .eq("id", comp.advertiser_id)
        .single();

      if (!advertiser?.email) {
        results.skipped += applications.length;
        continue;
      }

      // Send single or batch email
      if (applications.length === 1) {
        const app = applications[0];
        await sendJobApplicationReceivedEmail(
          advertiser.email,
          listing.title,
          listingId,
          { developerLogin: app.developer_login, hasProfile: app.has_profile },
        );
      } else {
        await sendJobApplicationsBatchEmail(
          advertiser.email,
          listing.title,
          applications.map((a) => ({ login: a.developer_login, hasProfile: a.has_profile })),
        );
      }

      results.sent++;
    } catch (err) {
      console.error(`[jobs-flush-app-emails] Failed for listing ${listingId}:`, err);
      results.errors++;
    }
  }

  // Delete all processed items
  const processedIds = items.map((i) => i.id);
  await admin
    .from("job_application_email_queue")
    .delete()
    .in("id", processedIds);

  return NextResponse.json({ ok: true, ...results });
}
