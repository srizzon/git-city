import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendJobDigestNotification } from "@/lib/notification-senders/job-digest";
import { alertCronHighErrorRate, alertCronTimeout } from "@/lib/cron-monitor";

const BATCH_SIZE = 50;
const MAX_DURATION_MS = 55_000; // Abort at 55s to leave margin for response

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  const admin = getSupabaseAdmin();
  const oneWeekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const results = { sent: 0, skipped: 0, errors: 0, timedOut: false, lastOffset: 0 };

  // Get active job listings published this week (one query, reused for all devs)
  const { data: recentJobs } = await admin
    .from("job_listings")
    .select("id, title, seniority, tech_stack, location_type, salary_min, salary_max, currency, company:job_company_profiles!inner(name)")
    .eq("status", "active")
    .gte("published_at", oneWeekAgo)
    .order("published_at", { ascending: false });

  if (!recentJobs || recentJobs.length === 0) {
    return NextResponse.json({ ok: true, ...results, reason: "no_new_jobs" });
  }

  // Pre-build job data once (avoid rebuilding per dev)
  const jobData = recentJobs.map((job) => ({
    id: job.id,
    title: job.title,
    seniority: job.seniority,
    techStack: ((job.tech_stack as string[]) ?? []).map((s) => s.toLowerCase()),
    locationType: job.location_type,
    salaryMin: job.salary_min,
    salaryMax: job.salary_max,
    currency: job.currency,
    companyName: (job.company as unknown as { name: string }).name,
  }));

  // Single optimized query: join career_profiles + developers + preferences
  // Process in batches with cursor-based pagination
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    // Timeout guard
    if (Date.now() - startTime > MAX_DURATION_MS) {
      results.timedOut = true;
      results.lastOffset = offset;
      break;
    }

    const { data: rows } = await admin
      .from("career_profiles")
      .select(`
        id, skills, seniority,
        developer:developers!inner(id, github_login, email)
      `)
      .eq("open_to_work", true)
      .not("developer.email", "is", null)
      .range(offset, offset + BATCH_SIZE - 1);

    if (!rows || rows.length === 0) {
      hasMore = false;
      break;
    }

    // Batch-check preferences for all devs in this batch
    const devIds = rows.map((r) => (r.developer as unknown as { id: number }).id);
    const { data: allPrefs } = await admin
      .from("notification_preferences")
      .select("developer_id, email_enabled, jobs_digest")
      .in("developer_id", devIds);

    const prefsMap = new Map(
      (allPrefs ?? []).map((p) => [p.developer_id, p]),
    );

    for (const row of rows) {
      const dev = row.developer as unknown as { id: number; github_login: string; email: string };
      if (!dev.email || !dev.github_login) {
        results.skipped++;
        continue;
      }

      // Check preferences
      const prefs = prefsMap.get(dev.id);
      if (prefs && (prefs.email_enabled === false || prefs.jobs_digest === false)) {
        results.skipped++;
        continue;
      }

      const devSkills = ((row.skills ?? []) as string[]).map((s) => s.toLowerCase());
      if (devSkills.length === 0) {
        results.skipped++;
        continue;
      }

      // Match jobs (in-memory, fast since jobData is pre-built)
      const matchingJobs = jobData
        .map((job) => {
          const matchedSkills = devSkills.filter((s) => job.techStack.includes(s));
          return {
            id: job.id,
            title: job.title,
            companyName: job.companyName,
            seniority: job.seniority,
            locationType: job.locationType,
            salaryMin: job.salaryMin,
            salaryMax: job.salaryMax,
            currency: job.currency,
            matchedSkills: matchedSkills.map((s) => s.charAt(0).toUpperCase() + s.slice(1)),
            matchScore: matchedSkills.length + (job.seniority === row.seniority ? 2 : 0),
          };
        })
        .filter((j) => j.matchScore >= 1)
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, 10);

      if (matchingJobs.length === 0) {
        results.skipped++;
        continue;
      }

      sendJobDigestNotification(dev.id, dev.github_login, matchingJobs);
      results.sent++;
    }

    if (rows.length < BATCH_SIZE) {
      hasMore = false;
    } else {
      offset += BATCH_SIZE;
    }
  }

  // Alert on issues
  const duration = Date.now() - startTime;
  if (results.timedOut) {
    alertCronTimeout("jobs-weekly-digest", duration, { ok: true, ...results }).catch(() => {});
  }
  alertCronHighErrorRate("jobs-weekly-digest", { ok: true, ...results }, duration).catch(() => {});

  return NextResponse.json({ ok: true, ...results });
}
