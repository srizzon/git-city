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
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const results = { sent: 0, skipped: 0, errors: 0, queued: 0 };

  // Grab all pending queue items (oldest first, cap at 500)
  const { data: items } = await admin
    .from("job_application_email_queue")
    .select("id, listing_id, developer_login, has_profile, created_at")
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

  // Queue items to delete: sent, or skipped for good. A failed send stays
  // queued for the next run (dropped after a day so it can't loop forever).
  const handledIds: (typeof items)[number]["id"][] = [];
  const dayAgo = Date.now() - 86_400_000;

  for (const [listingId, applications] of byListing) {
    const handle = () => handledIds.push(...applications.map((a) => a.id));
    try {
      // Get listing + company email
      const { data: listing } = await admin
        .from("job_listings")
        .select("title, company:job_company_profiles!inner(advertiser_id)")
        .eq("id", listingId)
        .single();

      if (!listing) {
        results.skipped += applications.length;
        handle();
        continue;
      }

      const comp = listing.company as unknown as { advertiser_id: string | null };
      if (!comp.advertiser_id) {
        results.skipped += applications.length;
        handle();
        continue;
      }

      const { data: advertiser } = await admin
        .from("advertiser_accounts")
        .select("email")
        .eq("id", comp.advertiser_id)
        .single();

      if (!advertiser?.email) {
        results.skipped += applications.length;
        handle();
        continue;
      }

      // Enrich with profile data for richer emails
      const logins = applications.map((a) => a.developer_login);
      const { data: devs } = await admin
        .from("developers")
        .select("id, github_login")
        .in("github_login", logins);
      const devMap = new Map((devs ?? []).map((d) => [d.github_login, d.id]));
      const devIds = (devs ?? []).map((d) => d.id);
      const { data: profiles } = devIds.length > 0
        ? await admin.from("career_profiles").select("id, first_name, last_name, email, phone, skills, seniority, salary_min, salary_max, salary_currency, bio, resume_url, link_linkedin").in("id", devIds)
        : { data: [] };
      const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

      // Send single or batch email
      if (applications.length === 1) {
        const app = applications[0];
        const devId = devMap.get(app.developer_login);
        const profile = devId ? profileMap.get(devId) : null;
        await sendJobApplicationReceivedEmail(
          advertiser.email,
          listing.title,
          listingId,
          {
            developerLogin: app.developer_login,
            hasProfile: app.has_profile,
            firstName: profile?.first_name,
            lastName: profile?.last_name,
            email: profile?.email,
            phone: profile?.phone,
            skills: profile?.skills,
            seniority: profile?.seniority,
            salaryMin: profile?.salary_min,
            salaryMax: profile?.salary_max,
            salaryCurrency: profile?.salary_currency,
            bio: profile?.bio,
            resumeUrl: profile?.resume_url,
            linkedinUrl: profile?.link_linkedin,
          },
        );
      } else {
        await sendJobApplicationsBatchEmail(
          advertiser.email,
          listing.title,
          listingId,
          applications.map((a) => {
            const devId = devMap.get(a.developer_login);
            const profile = devId ? profileMap.get(devId) : null;
            return {
              login: a.developer_login,
              hasProfile: a.has_profile,
              firstName: profile?.first_name,
              lastName: profile?.last_name,
            };
          }),
        );
      }

      results.sent++;
      handle();
    } catch (err) {
      console.error(`[jobs-flush-app-emails] Failed for listing ${listingId}:`, err);
      results.errors++;
    }
  }

  const staleIds = items.filter((i) => Date.parse(i.created_at) < dayAgo).map((i) => i.id);
  const processedIds = [...new Set([...handledIds, ...staleIds])];
  if (processedIds.length === 0) return NextResponse.json({ ok: true, ...results });

  await admin
    .from("job_application_email_queue")
    .delete()
    .in("id", processedIds);

  return NextResponse.json({ ok: true, ...results });
}
