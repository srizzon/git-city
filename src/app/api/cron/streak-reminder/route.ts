import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendStreakReminderNotification } from "@/lib/notification-senders/streak-reminder";

/**
 * Cron: Daily 20:00 UTC - Remind developers who haven't checked in today
 * and have a streak >= 3.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getSupabaseAdmin();
  const today = new Date().toISOString().split("T")[0];
  const results = { reminded: 0, skipped: 0, errors: 0 };

  let offset = 0;
  const batchSize = 50;

  while (true) {
    // Find developers with streak >= 3 who haven't checked in today
    const { data: devs } = await sb
      .from("developers")
      .select("id, github_login, app_streak, streak_freeze_count, last_checkin_date")
      .eq("claimed", true)
      .not("email", "is", null)
      .gte("app_streak", 3)
      .neq("last_checkin_date", today)
      .range(offset, offset + batchSize - 1);

    if (!devs || devs.length === 0) break;

    // Check notification preferences in batch
    const devIds = devs.map((d) => d.id);
    const { data: prefs } = await sb
      .from("notification_preferences")
      .select("developer_id, streak_reminders")
      .in("developer_id", devIds);

    const prefsMap = new Map(
      (prefs ?? []).map((p) => [p.developer_id, p]),
    );

    for (const dev of devs) {
      try {
        // Check if they opted out of streak reminders
        const devPrefs = prefsMap.get(dev.id);
        if (devPrefs && devPrefs.streak_reminders === false) {
          results.skipped++;
          continue;
        }

        const hasFreezeAvailable = (dev.streak_freeze_count ?? 0) > 0;

        sendStreakReminderNotification(
          dev.id,
          dev.github_login,
          dev.app_streak,
          hasFreezeAvailable,
          today,
        );
        results.reminded++;
      } catch {
        results.errors++;
      }
    }

    if (devs.length < batchSize) break;
    offset += batchSize;
  }

  return NextResponse.json({ ok: true, ...results });
}
