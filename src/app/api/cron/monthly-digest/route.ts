import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendNotificationAsync } from "@/lib/notifications";
import { buildButton, buildStatsTable } from "@/lib/email-template";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://thegitcity.com";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Cron: 1st of month 10:00 UTC - Monthly highlights email.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getSupabaseAdmin();
  const now = new Date();
  // Previous month
  const prevMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
  const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const monthStart = new Date(prevYear, prevMonth, 1).toISOString();
  const monthEnd = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const yearMonth = `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}`;
  const monthName = MONTH_NAMES[prevMonth];
  const results = { sent: 0, skipped: 0, errors: 0 };

  let offset = 0;
  const batchSize = 50;

  while (true) {
    const { data: devs } = await sb
      .from("developers")
      .select("id, github_login, contributions, app_streak, rank")
      .eq("claimed", true)
      .not("email", "is", null)
      .range(offset, offset + batchSize - 1);

    if (!devs || devs.length === 0) break;

    const devIds = devs.map((d) => d.id);

    const [achievementsResult, raidsResult] = await Promise.allSettled([
      sb
        .from("developer_achievements")
        .select("developer_id")
        .in("developer_id", devIds)
        .gte("unlocked_at", monthStart)
        .lt("unlocked_at", monthEnd),
      sb
        .from("raids")
        .select("attacker_id, defender_id, success")
        .or(`attacker_id.in.(${devIds.join(",")}),defender_id.in.(${devIds.join(",")})`)
        .gte("created_at", monthStart)
        .lt("created_at", monthEnd),
    ]);

    const achievementCounts = new Map<number, number>();
    if (achievementsResult.status === "fulfilled" && achievementsResult.value.data) {
      for (const a of achievementsResult.value.data) {
        achievementCounts.set(a.developer_id, (achievementCounts.get(a.developer_id) ?? 0) + 1);
      }
    }

    const raidStats = new Map<number, { attacks: number; defenses: number }>();
    if (raidsResult.status === "fulfilled" && raidsResult.value.data) {
      for (const r of raidsResult.value.data) {
        if (devIds.includes(r.attacker_id)) {
          const curr = raidStats.get(r.attacker_id) ?? { attacks: 0, defenses: 0 };
          curr.attacks++;
          raidStats.set(r.attacker_id, curr);
        }
        if (devIds.includes(r.defender_id)) {
          const curr = raidStats.get(r.defender_id) ?? { attacks: 0, defenses: 0 };
          curr.defenses++;
          raidStats.set(r.defender_id, curr);
        }
      }
    }

    const sendResults = await Promise.allSettled(
      devs.map((dev) => {
        const achievements = achievementCounts.get(dev.id) ?? 0;
        const raids = raidStats.get(dev.id);

        const stats = [
          { label: "Total contributions", value: dev.contributions.toLocaleString() },
          { label: "Current streak", value: `${dev.app_streak ?? 0} days` },
        ];

        if (dev.rank) stats.push({ label: "City rank", value: `#${dev.rank}` });
        if (achievements > 0) stats.push({ label: "Achievements unlocked", value: achievements });
        if (raids) {
          stats.push({ label: "Raids launched", value: raids.attacks });
          stats.push({ label: "Raids defended", value: raids.defenses });
        }

        sendNotificationAsync({
          type: "monthly_digest",
          category: "digest",
          developerId: dev.id,
          dedupKey: `monthly_digest:${dev.id}:${yearMonth}`,
          title: `Your ${monthName} in Git City`,
          body: `${monthName} recap: ${dev.contributions.toLocaleString()} total contributions, rank #${dev.rank ?? "?"}.`,
          html: `
            <p style="color: #c8e64a; font-size: 16px;">Your ${monthName} in Git City</p>
            ${buildStatsTable(stats)}
            ${buildButton("Visit Git City", `${BASE_URL}/?user=${dev.github_login}`)}
          `,
          actionUrl: `${BASE_URL}/?user=${dev.github_login}`,
          priority: "high",
          channels: ["email"],
        });

        return Promise.resolve("sent");
      }),
    );

    for (const r of sendResults) {
      if (r.status === "fulfilled") results.sent++;
      else results.errors++;
    }

    if (devs.length < batchSize) break;
    offset += batchSize;
  }

  return NextResponse.json({ ok: true, ...results });
}
