import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendJobPublicDigestNotification } from "@/lib/notification-senders/job-public-digest";

const BATCH_SIZE = 50;
const MAX_DURATION_MS = 55_000;

/**
 * Weekly cron: sends job digest to public alert subscribers
 * (people who signed up with just email + tech stack, no account needed).
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  const admin = getSupabaseAdmin();
  const oneWeekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const results = { sent: 0, skipped: 0, errors: 0, timedOut: false };

  // Get recent active jobs
  const { data: recentJobs } = await admin
    .from("job_listings")
    .select("id, title, seniority, tech_stack, location_type, salary_min, salary_max, salary_currency, salary_period, company:job_company_profiles!inner(name)")
    .eq("status", "active")
    .gte("published_at", oneWeekAgo)
    .order("published_at", { ascending: false });

  if (!recentJobs || recentJobs.length === 0) {
    return NextResponse.json({ ok: true, ...results, reason: "no_new_jobs" });
  }

  const jobData = recentJobs.map((job) => ({
    id: job.id,
    title: job.title,
    seniority: job.seniority,
    techStack: ((job.tech_stack as string[]) ?? []).map((s) => s.toLowerCase()),
    locationType: job.location_type,
    salaryMin: job.salary_min,
    salaryMax: job.salary_max,
    salaryPeriod: job.salary_period,
    currency: job.salary_currency,
    companyName: (job.company as unknown as { name: string }).name,
  }));

  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    if (Date.now() - startTime > MAX_DURATION_MS) {
      results.timedOut = true;
      break;
    }

    // Get verified subscribers not emailed in the last 6 days
    const sixDaysAgo = new Date(Date.now() - 6 * 86_400_000).toISOString();
    const { data: subscribers } = await admin
      .from("job_alert_subscriptions")
      .select("id, email, tech_stack, unsubscribe_token")
      .eq("verified", true)
      .or(`last_sent_at.is.null,last_sent_at.lt.${sixDaysAgo}`)
      .range(offset, offset + BATCH_SIZE - 1);

    if (!subscribers || subscribers.length === 0) {
      hasMore = false;
      break;
    }

    for (const sub of subscribers) {
      const subStack = ((sub.tech_stack as string[]) ?? []).map((s) => s.toLowerCase());

      // Match jobs by tech stack overlap
      let matchingJobs;
      if (subStack.length > 0) {
        matchingJobs = jobData
          .map((job) => {
            const matchedSkills = subStack.filter((s) => job.techStack.includes(s));
            return { ...job, matchedSkills, matchScore: matchedSkills.length };
          })
          .filter((j) => j.matchScore >= 1)
          .sort((a, b) => b.matchScore - a.matchScore)
          .slice(0, 8);
      } else {
        // No stack preference: send top 8 recent jobs
        matchingJobs = jobData.slice(0, 8).map((j) => ({ ...j, matchedSkills: [] as string[], matchScore: 0 }));
      }

      if (matchingJobs.length === 0) {
        results.skipped++;
        continue;
      }

      try {
        await sendJobPublicDigestNotification(sub.email, matchingJobs, sub.unsubscribe_token);

        await admin
          .from("job_alert_subscriptions")
          .update({ last_sent_at: new Date().toISOString() })
          .eq("id", sub.id);

        results.sent++;
      } catch (err) {
        console.error(`[jobs-public-digest] Failed for ${sub.email}:`, err);
        results.errors++;
      }
    }

    if (subscribers.length < BATCH_SIZE) {
      hasMore = false;
    } else {
      offset += BATCH_SIZE;
    }
  }

  return NextResponse.json({ ok: true, ...results });
}
