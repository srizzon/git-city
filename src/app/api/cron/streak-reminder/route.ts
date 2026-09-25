import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { tallySends } from "@/lib/notifications";
import { sendDailyReminderNotification } from "@/lib/notification-senders/daily-reminder";
import { getDailyMissions } from "@/lib/dailies";
import { mapWithConcurrency } from "@/lib/concurrency";

export const maxDuration = 300;

const TIME_BUDGET_MS = 240_000;
const SEND_CONCURRENCY = 4;

/**
 * Cron: Daily 20:00 UTC - at most one daily reminder per developer.
 * A streak >= 3 that is alive but not extended today gets the streak reminder
 * (listing today's missions left); anyone else with 1-2 missions done gets
 * the missions reminder.
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
  const batchSize = 50;

  // Today's completed missions per developer (paged: PostgREST caps a response at 1000 rows)
  const doneMap = new Map<number, Set<string>>();
  for (let from = 0; !outOfTime(); from += 1000) {
    const { data: rows } = await sb
      .from("daily_mission_progress")
      .select("developer_id, mission_id")
      .eq("mission_date", today)
      .eq("completed", true)
      .order("developer_id", { ascending: true })
      .range(from, from + 999);

    if (!rows || rows.length === 0) break;
    for (const row of rows) {
      const done = doneMap.get(row.developer_id) ?? new Set<string>();
      done.add(row.mission_id);
      doneMap.set(row.developer_id, done);
    }
    if (rows.length < 1000) break;
  }
  const missionsLeft = (devId: number) => {
    const done = doneMap.get(devId);
    return getDailyMissions(devId, today).filter((m) => !done?.has(m.id));
  };

  // Everyone who qualifies for the streak reminder, sent or not, is left out
  // of the missions reminder so nobody gets two emails.
  const streakCandidates = new Set<number>();

  // ─── Streak reminders ────
  let offset = 0;
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
      if (dev.last_checkin_date === twoDaysAgo && (dev.streak_freezes_available ?? 0) === 0) return false;
      streakCandidates.add(dev.id);
      // Check if they opted out of daily reminders
      const devPrefs = prefsMap.get(dev.id);
      if (devPrefs && devPrefs.streak_reminders === false) return false;
      return true;
    });
    results.skipped += devs.length - eligible.length;

    const sendResults = await mapWithConcurrency(eligible, SEND_CONCURRENCY, (dev) =>
      sendDailyReminderNotification(
        dev.id,
        {
          kind: "streak",
          login: dev.github_login,
          streak: dev.app_streak,
          freezes: dev.streak_freezes_available ?? 0,
          missedYesterday: dev.last_checkin_date === twoDaysAgo,
          missionsLeft: missionsLeft(dev.id),
        },
        today,
      ),
    );
    tallySends(sendResults, results);

    if (devs.length < batchSize) break;
    offset += batchSize;
  }

  // ─── Missions reminders: 1 or 2 missions done (not 3, not 0) ────
  const dailiesResults = { sent: 0, skipped: 0, errors: 0 };
  const partialDevIds = [...doneMap.keys()].filter((id) => {
    const left = missionsLeft(id).length;
    return left >= 1 && left <= 2 && !streakCandidates.has(id);
  });

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
      {
        const left = missionsLeft(dev.id);
        return sendDailyReminderNotification(
          dev.id,
          { kind: "missions", login: dev.github_login, missionsDone: 3 - left.length, missionsLeft: left },
          today,
        );
      },
    );
    tallySends(sendResults, dailiesResults);
  }

  return NextResponse.json({ ok: true, ...results, dailies: dailiesResults });
}
