import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendNotificationAsync } from "@/lib/notifications";
import { buildButton, buildStatsTable } from "@/lib/email-template";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://thegitcity.com";

/**
 * Cron: Monday 10:00 UTC - Weekly recap email for active developers.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getSupabaseAdmin();
  const now = new Date();
  const weekStart = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const weekStartDate = weekStart.split("T")[0];
  const results = { sent: 0, skipped: 0, errors: 0 };

  let offset = 0;
  const batchSize = 50;

  while (true) {
    const { data: devs } = await sb
      .from("developers")
      .select("id, github_login, contributions, app_streak, kudos_count, rank")
      .eq("claimed", true)
      .not("email", "is", null)
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
        .from("developer_achievements")
        .select("developer_id, achievement_id")
        .in("developer_id", devIds)
        .gte("unlocked_at", weekStart),
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

    const sendResults = await Promise.allSettled(
      devs.map((dev) => {
        const weeklyKudos = kudosMap.get(dev.id) ?? 0;
        const weeklyRaids = raidsMap.get(dev.id);
        const weeklyAchievements = achievementsMap.get(dev.id) ?? 0;

        // Skip devs with zero activity
        if (weeklyKudos === 0 && !weeklyRaids && weeklyAchievements === 0 && (dev.app_streak ?? 0) === 0) {
          return Promise.resolve("skipped");
        }

        const stats = [
          { label: "Current streak", value: `${dev.app_streak ?? 0} days` },
          { label: "Kudos received", value: weeklyKudos },
        ];

        if (weeklyRaids) {
          stats.push({ label: "Raids defended", value: `${weeklyRaids.defended}/${weeklyRaids.total}` });
        }
        if (weeklyAchievements > 0) {
          stats.push({ label: "Achievements", value: weeklyAchievements });
        }
        if (dev.rank) {
          stats.push({ label: "City rank", value: `#${dev.rank}` });
        }

        sendNotificationAsync({
          type: "weekly_digest",
          category: "digest",
          developerId: dev.id,
          dedupKey: `weekly_digest:${dev.id}:${weekStartDate}`,
          title: `Your week in Git City: ${dev.app_streak ?? 0}-day streak, rank #${dev.rank ?? "?"}`,
          body: `Streak: ${dev.app_streak ?? 0} days. Kudos: ${weeklyKudos}. Check your weekly recap.`,
          html: `
            <p style="color: #c8e64a; font-size: 16px;">Your week in Git City</p>
            ${buildStatsTable(stats)}
            ${buildButton("Visit Git City", `${BASE_URL}/?user=${dev.github_login}`)}
          `,
          actionUrl: `${BASE_URL}/?user=${dev.github_login}`,
          priority: "high", // Digests are their own batch, don't re-batch
          channels: ["email"],
        });

        return Promise.resolve("sent");
      }),
    );

    for (const r of sendResults) {
      if (r.status === "fulfilled") {
        if (r.value === "skipped") results.skipped++;
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
