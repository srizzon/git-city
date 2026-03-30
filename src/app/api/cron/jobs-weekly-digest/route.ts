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

  // ─── Pass 1: Developers with career profiles (existing behavior) ───
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
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
      if (!dev.email || !dev.github_login) { results.skipped++; continue; }

      const prefs = prefsMap.get(dev.id);
      if (prefs && (prefs.email_enabled === false || prefs.jobs_digest === false)) { results.skipped++; continue; }

      const devSkills = ((row.skills ?? []) as string[]).map((s) => s.toLowerCase());
      if (devSkills.length === 0) { results.skipped++; continue; }

      const matchingJobs = jobData
        .map((job) => {
          const matchedSkills = devSkills.filter((s) => job.techStack.includes(s));
          return {
            id: job.id, title: job.title, companyName: job.companyName,
            seniority: job.seniority, locationType: job.locationType,
            salaryMin: job.salaryMin, salaryMax: job.salaryMax, currency: job.currency,
            matchedSkills: matchedSkills.map((s) => s.charAt(0).toUpperCase() + s.slice(1)),
            matchScore: matchedSkills.length + (job.seniority === row.seniority ? 2 : 0),
          };
        })
        .filter((j) => j.matchScore >= 1)
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, 10);

      if (matchingJobs.length === 0) { results.skipped++; continue; }
      sendJobDigestNotification(dev.id, dev.github_login, matchingJobs);
      results.sent++;
    }

    hasMore = rows.length === BATCH_SIZE;
    offset += BATCH_SIZE;
  }

  // ─── Pass 2: GitHub-powered passive matching ───
  // For claimed devs WITHOUT career profile: match by primary_language
  const LANG_TO_STACK: Record<string, string[]> = {
    "TypeScript": ["typescript", "react", "nextjs", "node", "angular", "vue"],
    "JavaScript": ["javascript", "react", "node", "vue", "express"],
    "Python": ["python", "django", "flask", "fastapi"],
    "Rust": ["rust"],
    "Go": ["go", "golang"],
    "Java": ["java", "spring", "kotlin"],
    "Ruby": ["ruby", "rails"],
    "Swift": ["swift", "ios"],
    "Kotlin": ["kotlin", "android"],
    "Dart": ["dart", "flutter"],
    "C#": ["csharp", "dotnet", ".net"],
    "PHP": ["php", "laravel"],
    "Elixir": ["elixir", "phoenix"],
    "Solidity": ["solidity", "ethereum", "web3"],
    "C++": ["cpp", "c++"],
    "Lua": ["lua", "gamedev"],
    "GDScript": ["godot", "gamedev"],
  };

  if (!results.timedOut) {
    let passiveOffset = 0;
    let passiveHasMore = true;

    while (passiveHasMore) {
      if (Date.now() - startTime > MAX_DURATION_MS) {
        results.timedOut = true;
        break;
      }

      // Get devs who interacted with jobs (applied or signed up for notifications)
      // but DON'T have a career profile (those were handled in pass 1).
      // This ensures we only email devs who showed interest in the job board.
      const { data: jobDevIds } = await admin
        .from("job_applications")
        .select("developer_id")
        .range(passiveOffset, passiveOffset + BATCH_SIZE - 1);

      if (!jobDevIds || jobDevIds.length === 0) { passiveHasMore = false; break; }

      const uniqueDevIds = [...new Set(jobDevIds.map((r) => r.developer_id))];

      const { data: devs } = await admin
        .from("developers")
        .select("id, github_login, email, primary_language")
        .in("id", uniqueDevIds)
        .not("email", "is", null)
        .not("primary_language", "is", null);

      if (!devs || devs.length === 0) {
        passiveHasMore = jobDevIds.length === BATCH_SIZE;
        passiveOffset += BATCH_SIZE;
        continue;
      }

      // Filter out devs who already have career profiles (handled in pass 1)
      const devIds = devs.map((d) => d.id);
      const { data: profileIds } = await admin
        .from("career_profiles")
        .select("id")
        .in("id", devIds);
      const hasProfileSet = new Set((profileIds ?? []).map((p) => p.id));

      // Check notification preferences
      const { data: allPrefs } = await admin
        .from("notification_preferences")
        .select("developer_id, email_enabled, jobs_digest")
        .in("developer_id", devIds);
      const prefsMap = new Map((allPrefs ?? []).map((p) => [p.developer_id, p]));

      for (const dev of devs) {
        if (hasProfileSet.has(dev.id)) { results.skipped++; continue; }
        if (!dev.email || !dev.primary_language) { results.skipped++; continue; }

        const prefs = prefsMap.get(dev.id);
        if (prefs && (prefs.email_enabled === false || prefs.jobs_digest === false)) { results.skipped++; continue; }

        const inferredSkills = LANG_TO_STACK[dev.primary_language] ?? [];
        if (inferredSkills.length === 0) { results.skipped++; continue; }

        const matchingJobs = jobData
          .map((job) => {
            const matchedSkills = inferredSkills.filter((s) => job.techStack.includes(s));
            return {
              id: job.id, title: job.title, companyName: job.companyName,
              seniority: job.seniority, locationType: job.locationType,
              salaryMin: job.salaryMin, salaryMax: job.salaryMax, currency: job.currency,
              matchedSkills: matchedSkills.map((s) => s.charAt(0).toUpperCase() + s.slice(1)),
              matchScore: matchedSkills.length,
            };
          })
          .filter((j) => j.matchScore >= 1)
          .sort((a, b) => b.matchScore - a.matchScore)
          .slice(0, 10);

        if (matchingJobs.length === 0) { results.skipped++; continue; }
        sendJobDigestNotification(dev.id, dev.github_login, matchingJobs);
        results.sent++;
      }

      passiveHasMore = devs.length === BATCH_SIZE;
      passiveOffset += BATCH_SIZE;
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
