import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendStreakReminderNotification } from "@/lib/notification-senders/streak-reminder";
import { sendDailiesReminderNotification } from "@/lib/notification-senders/dailies-reminder";

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

  // ─── Dailies reminders: users with 1-2 missions done but not 3 ────
  const dailiesResults = { reminded: 0, skipped: 0 };
  let dailiesOffset = 0;

  while (true) {
    // Find devs who have some (but not all) missions done today
    const { data: partial } = await sb
      .from("daily_mission_progress")
      .select("developer_id")
      .eq("mission_date", today)
      .eq("completed", true);

    if (!partial || partial.length === 0) break;

    // Count completions per developer
    const countMap = new Map<number, number>();
    for (const row of partial) {
      countMap.set(row.developer_id, (countMap.get(row.developer_id) ?? 0) + 1);
    }

    // Filter to devs with 1 or 2 completions (not 3, not 0)
    const partialDevIds = [...countMap.entries()]
      .filter(([, count]) => count >= 1 && count < 3)
      .map(([id]) => id);

    if (partialDevIds.length === 0) break;

    // Batch fetch developer info
    const batch = partialDevIds.slice(dailiesOffset, dailiesOffset + batchSize);
    if (batch.length === 0) break;

    const { data: devs } = await sb
      .from("developers")
      .select("id, github_login")
      .in("id", batch)
      .eq("claimed", true)
      .not("email", "is", null);

    for (const dev of devs ?? []) {
      try {
        const completedCount = countMap.get(dev.id) ?? 0;
        sendDailiesReminderNotification(dev.id, dev.github_login, completedCount, today);
        dailiesResults.reminded++;
      } catch {
        dailiesResults.skipped++;
      }
    }

    // Only one pass needed since we fetched all progress rows at once
    break;
  }

  return NextResponse.json({ ok: true, ...results, dailies: dailiesResults });
}
