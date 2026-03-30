import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendJobDigestNotification } from "@/lib/notification-senders/job-digest";

const BATCH_SIZE = 50;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const oneWeekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const results = { sent: 0, skipped: 0, errors: 0 };

  // Get active job listings published this week
  const { data: recentJobs } = await admin
    .from("job_listings")
    .select("id, title, seniority, tech_stack, location_type, salary_min, salary_max, currency, company:job_company_profiles!inner(name)")
    .eq("status", "active")
    .gte("published_at", oneWeekAgo)
    .order("published_at", { ascending: false });

  if (!recentJobs || recentJobs.length === 0) {
    return NextResponse.json({ ok: true, ...results, reason: "no_new_jobs" });
  }

  // Process developers in batches
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data: profiles } = await admin
      .from("career_profiles")
      .select("id, skills, seniority")
      .eq("open_to_work", true)
      .range(offset, offset + BATCH_SIZE - 1);

    if (!profiles || profiles.length === 0) {
      hasMore = false;
      break;
    }

    for (const profile of profiles) {
      try {
        // Check if dev has email
        const { data: dev } = await admin
          .from("developers")
          .select("id, github_login, email")
          .eq("id", profile.id)
          .single();

        if (!dev?.email || !dev.github_login) {
          results.skipped++;
          continue;
        }

        // Check notification preferences
        const { data: prefs } = await admin
          .from("notification_preferences")
          .select("email_enabled, jobs_digest")
          .eq("developer_id", dev.id)
          .maybeSingle();

        if (prefs && (prefs.email_enabled === false || prefs.jobs_digest === false)) {
          results.skipped++;
          continue;
        }

        // Match jobs by skills overlap and seniority
        const devSkills = (profile.skills ?? []) as string[];
        if (devSkills.length === 0) {
          results.skipped++;
          continue;
        }

        const matchingJobs = recentJobs
          .map((job) => {
            const jobStack = (job.tech_stack as string[]) ?? [];
            const matchedSkills = devSkills.filter((s) =>
              jobStack.some((js) => js.toLowerCase() === s.toLowerCase()),
            );
            return {
              id: job.id,
              title: job.title,
              companyName: (job.company as unknown as { name: string }).name,
              seniority: job.seniority,
              locationType: job.location_type,
              salaryMin: job.salary_min,
              salaryMax: job.salary_max,
              currency: job.currency,
              matchedSkills,
              matchScore: matchedSkills.length + (job.seniority === profile.seniority ? 2 : 0),
            };
          })
          .filter((j) => j.matchScore >= 1) // At least 1 skill match or seniority match
          .sort((a, b) => b.matchScore - a.matchScore)
          .slice(0, 10);

        if (matchingJobs.length === 0) {
          results.skipped++;
          continue;
        }

        sendJobDigestNotification(dev.id, dev.github_login, matchingJobs);
        results.sent++;
      } catch (err) {
        console.error(`[jobs-digest] Failed for profile ${profile.id}:`, err);
        results.errors++;
      }
    }

    if (profiles.length < BATCH_SIZE) {
      hasMore = false;
    } else {
      offset += BATCH_SIZE;
    }
  }

  return NextResponse.json({ ok: true, ...results });
}
