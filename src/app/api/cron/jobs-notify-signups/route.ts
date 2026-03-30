import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendJobNotifySignupFulfilled } from "@/lib/notification-senders/job-notify-signup";

/**
 * Fulfills job notification signups: when active jobs exist,
 * notify developers who signed up to be told.
 * One-shot: each signup is only fulfilled once.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const results = { notified: 0, skipped: 0, errors: 0 };

  // Check if there are any active jobs
  const { count: activeJobs } = await admin
    .from("job_listings")
    .select("*", { count: "exact", head: true })
    .eq("status", "active");

  if (!activeJobs || activeJobs === 0) {
    return NextResponse.json({ ok: true, ...results, reason: "no_active_jobs" });
  }

  // Get unfulfilled signups
  const { data: signups } = await admin
    .from("job_notification_signups")
    .select("developer_id")
    .is("notified_at", null)
    .limit(100);

  if (!signups || signups.length === 0) {
    return NextResponse.json({ ok: true, ...results, reason: "no_pending_signups" });
  }

  for (const signup of signups) {
    try {
      // Check if dev already has a career profile (they'd get the weekly digest instead)
      const { data: profile } = await admin
        .from("career_profiles")
        .select("id")
        .eq("id", signup.developer_id)
        .maybeSingle();

      if (profile) {
        // Mark as fulfilled without sending (they already get digest)
        await admin
          .from("job_notification_signups")
          .update({ notified_at: new Date().toISOString() })
          .eq("developer_id", signup.developer_id);
        results.skipped++;
        continue;
      }

      sendJobNotifySignupFulfilled(signup.developer_id, activeJobs);

      await admin
        .from("job_notification_signups")
        .update({ notified_at: new Date().toISOString() })
        .eq("developer_id", signup.developer_id);

      results.notified++;
    } catch (err) {
      console.error(`[jobs-notify-signups] Failed for dev ${signup.developer_id}:`, err);
      results.errors++;
    }
  }

  return NextResponse.json({ ok: true, ...results });
}
