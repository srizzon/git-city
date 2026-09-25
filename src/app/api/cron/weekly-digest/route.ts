import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendNotification } from "@/lib/notifications";
import { buildButton, buildStatsTable } from "@/lib/email-template";
import { mapWithConcurrency } from "@/lib/concurrency";

export const maxDuration = 300;

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://thegitcity.com";
const TIME_BUDGET_MS = 240_000;
const SEND_CONCURRENCY = 4;
const ACTIVE_WINDOW_DAYS = 30;

/**
 * Cron: Monday 10:00 UTC - Weekly recap email for active developers.
 * Audience: active in the last 30 days AND something happened this week.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  const sb = getSupabaseAdmin();
  const now = new Date();
  const weekStart = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const weekStartDate = weekStart.split("T")[0];
  const activeSince = new Date(now.getTime() - ACTIVE_WINDOW_DAYS * 86_400_000).toISOString();
  const today = now.toISOString().split("T")[0];
  const yesterday = new Date(now.getTime() - 86_400_000).toISOString().split("T")[0];
  const results = { sent: 0, skipped: 0, errors: 0, timedOut: false };

  let offset = 0;
  const batchSize = 50;

  while (true) {
    if (Date.now() - started > TIME_BUDGET_MS) {
      results.timedOut = true;
      break;
    }

    const { data: devs } = await sb
      .from("developers")
      .select("id, github_login, contributions, app_streak, last_checkin_date, kudos_count, rank")
      .eq("claimed", true)
      .not("email", "is", null)
      .gte("last_active_at", activeSince)
      .order("id", { ascending: true })
      .range(offset, offset + batchSize - 1);

    if (!devs || devs.length === 0) break;

    const devIds = devs.map((d) => d.id);

    // Fetch weekly activity data in parallel
    const [kudosResult, raidsResult, achievementsResult] = await Promise.allSettled([
      // Kudos received this week
      sb
        .from("developer_kudos")
        .select("receiver_id", { count: "exact", head: false })
        .in("receiver_id", devIds)
        .gte("given_date", weekStartDate),
      // Raids this week (as defender)
      sb
        .from("raids")
        .select("defender_id, success")
        .in("defender_id", devIds)
        .gte("created_at", weekStart),
      // Achievements this week
      sb
        .from("emblem_grants")
        .select("developer_id, achievement_id:emblem_id")
        .in("developer_id", devIds)
        .gte("first_earned_at", weekStart),
    ]);

    // Build lookup maps
    const kudosMap = new Map<number, number>();
    if (kudosResult.status === "fulfilled" && kudosResult.value.data) {
      for (const k of kudosResult.value.data) {
        kudosMap.set(k.receiver_id, (kudosMap.get(k.receiver_id) ?? 0) + 1);
      }
    }

    const raidsMap = new Map<number, { total: number; defended: number }>();
    if (raidsResult.status === "fulfilled" && raidsResult.value.data) {
      for (const r of raidsResult.value.data) {
        const curr = raidsMap.get(r.defender_id) ?? { total: 0, defended: 0 };
        curr.total++;
        if (!r.success) curr.defended++;
        raidsMap.set(r.defender_id, curr);
      }
    }

    const achievementsMap = new Map<number, number>();
    if (achievementsResult.status === "fulfilled" && achievementsResult.value.data) {
      for (const a of achievementsResult.value.data) {
        achievementsMap.set(a.developer_id, (achievementsMap.get(a.developer_id) ?? 0) + 1);
      }
    }

    const sendResults = await mapWithConcurrency(devs, SEND_CONCURRENCY, async (dev) => {
      if (Date.now() - started > TIME_BUDGET_MS) {
        results.timedOut = true;
        return "skipped";
      }

      const weeklyKudos = kudosMap.get(dev.id) ?? 0;
      const weeklyRaids = raidsMap.get(dev.id);
      const weeklyAchievements = achievementsMap.get(dev.id) ?? 0;
      // app_streak is only reset on the next check-in, so it's stale unless
      // the last check-in was today or yesterday.
      const streakIsCurrent = dev.last_checkin_date === today || dev.last_checkin_date === yesterday;
      const streak = streakIsCurrent ? (dev.app_streak ?? 0) : 0;

      // Skip devs with nothing to report
      if (weeklyKudos === 0 && !weeklyRaids && weeklyAchievements === 0 && streak === 0) {
        return "skipped";
      }

      const stats: { label: string; value: string | number }[] = [];
      if (streak > 0) {
        stats.push({ label: "Current streak", value: `${streak} days` });
      }
      stats.push({ label: "Kudos received", value: weeklyKudos });

      if (weeklyRaids) {
        stats.push({ label: "Battles defended", value: `${weeklyRaids.defended}/${weeklyRaids.total}` });
      }
      if (weeklyAchievements > 0) {
        stats.push({ label: "Achievements", value: weeklyAchievements });
      }
      if (dev.rank) {
        stats.push({ label: "City rank", value: `#${dev.rank}` });
      }

      const title = streak > 0
        ? `Your week in Git City: ${streak}-day streak, rank #${dev.rank ?? "?"}`
        : `Your week in Git City: rank #${dev.rank ?? "?"}`;
      const body = streak > 0
        ? `Streak: ${streak} days. Kudos: ${weeklyKudos}. Check your weekly recap.`
        : `Kudos: ${weeklyKudos}. Check your weekly recap.`;

      const sent = await sendNotification({
        type: "weekly_digest",
        category: "digest",
        developerId: dev.id,
        dedupKey: `weekly_digest:${dev.id}:${weekStartDate}`,
        title,
        body,
        html: `
          <p style="color: #c8e64a; font-size: 16px;">Your week in Git City</p>
          ${buildStatsTable(stats)}
          ${buildButton("Visit Git City", `${BASE_URL}/?user=${dev.github_login}`)}
        `,
        actionUrl: `${BASE_URL}/?user=${dev.github_login}`,
        priority: "high", // Digests are their own batch, don't re-batch
        channels: ["email"],
      });

      if (sent.some((r) => r.success)) return "sent";
      return sent.some((r) => r.skipped === "resend_error" || r.skipped === "send_error") ? "error" : "skipped";
    });

    for (const r of sendResults) {
      if (r.status === "fulfilled") {
        if (r.value === "skipped") results.skipped++;
        else if (r.value === "error") results.errors++;
        else results.sent++;
      } else {
        results.errors++;
      }
    }

    if (devs.length < batchSize) break;
    offset += batchSize;
  }

  return NextResponse.json({ ok: true, ...results });
}
