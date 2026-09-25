import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { tallySends } from "@/lib/notifications";
import { sendStreakReminderNotification } from "@/lib/notification-senders/streak-reminder";
import { sendDailiesReminderNotification } from "@/lib/notification-senders/dailies-reminder";
import { mapWithConcurrency } from "@/lib/concurrency";

export const maxDuration = 300;

const TIME_BUDGET_MS = 240_000;
const SEND_CONCURRENCY = 4;

/**
 * Cron: Daily 20:00 UTC - Remind developers who haven't checked in today
 * and have a streak >= 3.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  const outOfTime = () => Date.now() - started > TIME_BUDGET_MS;
  const sb = getSupabaseAdmin();
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const yesterday = new Date(now.getTime() - 86_400_000).toISOString().split("T")[0];
  const twoDaysAgo = new Date(now.getTime() - 2 * 86_400_000).toISOString().split("T")[0];
  const results = { sent: 0, skipped: 0, errors: 0, timedOut: false };

  let offset = 0;
  const batchSize = 50;

  while (true) {
    if (outOfTime()) {
      results.timedOut = true;
      break;
    }

    // Streak >= 3 that is still alive but not extended today: last check-in
    // yesterday, or two days ago with a freeze to cover the gap. Older
    // app_streak values are stale (they only reset on the next check-in).
    const { data: devs } = await sb
      .from("developers")
      .select("id, github_login, app_streak, streak_freezes_available, last_checkin_date")
      .eq("claimed", true)
      .not("email", "is", null)
      .gte("app_streak", 3)
      .in("last_checkin_date", [yesterday, twoDaysAgo])
      .order("id", { ascending: true })
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

    const eligible = devs.filter((dev) => {
      // Check if they opted out of streak reminders
      const devPrefs = prefsMap.get(dev.id);
      if (devPrefs && devPrefs.streak_reminders === false) return false;
      if (dev.last_checkin_date === twoDaysAgo && (dev.streak_freezes_available ?? 0) === 0) return false;
      return true;
    });
    results.skipped += devs.length - eligible.length;

    const sendResults = await mapWithConcurrency(eligible, SEND_CONCURRENCY, (dev) =>
      sendStreakReminderNotification(
        dev.id,
        dev.github_login,
        dev.app_streak,
        (dev.streak_freezes_available ?? 0) > 0,
        today,
      ),
    );
    tallySends(sendResults, results);

    if (devs.length < batchSize) break;
    offset += batchSize;
  }

  // ─── Dailies reminders: users with 1-2 missions done but not 3 ────
  const dailiesResults = { sent: 0, skipped: 0, errors: 0 };

  // Count completions per developer (paged: PostgREST caps a response at 1000 rows)
  const countMap = new Map<number, number>();
  for (let from = 0; !outOfTime(); from += 1000) {
    const { data: rows } = await sb
      .from("daily_mission_progress")
      .select("developer_id")
      .eq("mission_date", today)
      .eq("completed", true)
      .order("developer_id", { ascending: true })
      .range(from, from + 999);

    if (!rows || rows.length === 0) break;
    for (const row of rows) {
      countMap.set(row.developer_id, (countMap.get(row.developer_id) ?? 0) + 1);
    }
    if (rows.length < 1000) break;
  }

  // Filter to devs with 1 or 2 completions (not 3, not 0)
  const partialDevIds = [...countMap.entries()]
    .filter(([, count]) => count >= 1 && count < 3)
    .map(([id]) => id);

  for (let i = 0; i < partialDevIds.length; i += batchSize) {
    if (outOfTime()) {
      results.timedOut = true;
      break;
    }

    const { data: devs } = await sb
      .from("developers")
      .select("id, github_login")
      .in("id", partialDevIds.slice(i, i + batchSize))
      .eq("claimed", true)
      .not("email", "is", null);

    const sendResults = await mapWithConcurrency(devs ?? [], SEND_CONCURRENCY, (dev) =>
      sendDailiesReminderNotification(dev.id, dev.github_login, countMap.get(dev.id) ?? 0, today),
    );
    tallySends(sendResults, dailiesResults);
  }

  return NextResponse.json({ ok: true, ...results, dailies: dailiesResults });
}
