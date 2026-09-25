import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendNotification, tallySends } from "@/lib/notifications";
import { mapWithConcurrency } from "@/lib/concurrency";
import {
  reEngagementHeader,
  renderReEngagementEmail,
  type ReEngagementData,
  type ReEngagementTier,
} from "@/lib/notification-senders/re-engagement";

export const maxDuration = 300;

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://thegitcity.com";
const TIME_BUDGET_MS = 240_000;
const SEND_CONCURRENCY = 4;

const TIERS: { daysInactive: number; tier: ReEngagementTier }[] = [
  { daysInactive: 7, tier: "7d" },
  { daysInactive: 14, tier: "14d" },
  { daysInactive: 30, tier: "30d" },
];

/**
 * Cron: Daily 14:00 UTC - Re-engagement emails for inactive developers.
 * Category: marketing (opt-in only, defaults to false).
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getSupabaseAdmin();
  const now = new Date();
  // Year-week for dedup (each tier once per week max)
  const yearWeek = `${now.getFullYear()}-W${String(Math.ceil(((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 86400000 + 1) / 7)).padStart(2, "0")}`;
  const started = Date.now();
  const results = { sent: 0, skipped: 0, errors: 0, timedOut: false };

  for (const tier of TIERS) {
    const inactiveAfter = new Date(now.getTime() - tier.daysInactive * 86_400_000).toISOString();
    const inactiveBefore = new Date(now.getTime() - (tier.daysInactive - 1) * 86_400_000).toISOString();

    // Developers who claimed a building since this tier's cohort went quiet
    const { count: newDevelopers } = await sb
      .from("developers")
      .select("id", { count: "exact", head: true })
      .eq("claimed", true)
      .gte("claimed_at", inactiveAfter);

    let offset = 0;
    const batchSize = 50;

    while (true) {
      if (Date.now() - started > TIME_BUDGET_MS) {
        results.timedOut = true;
        break;
      }

      // Find devs who were last active in the target window for this tier
      const { data: devs } = await sb
        .from("developers")
        .select("id, github_login")
        .eq("claimed", true)
        .not("email", "is", null)
        .lte("last_active_at", inactiveBefore)
        .gte("last_active_at", inactiveAfter)
        .order("id", { ascending: true })
        .range(offset, offset + batchSize - 1);

      if (!devs || devs.length === 0) break;

      // Check marketing opt-in
      const devIds = devs.map((d) => d.id);
      const { data: prefs } = await sb
        .from("notification_preferences")
        .select("developer_id, marketing")
        .in("developer_id", devIds);

      const marketingMap = new Map(
        (prefs ?? []).map((p) => [p.developer_id, p.marketing]),
      );

      // Get extra info (kudos received while away)
      const { data: recentKudos } = await sb
        .from("developer_kudos")
        .select("receiver_id")
        .in("receiver_id", devIds)
        .gte("given_date", inactiveAfter.split("T")[0]);

      const kudosCounts = new Map<number, number>();
      for (const k of recentKudos ?? []) {
        kudosCounts.set(k.receiver_id, (kudosCounts.get(k.receiver_id) ?? 0) + 1);
      }

      // Marketing defaults to false, must be explicitly opted in
      const optedIn = devs.filter((dev) => marketingMap.get(dev.id));
      results.skipped += devs.length - optedIn.length;

      const sendResults = await mapWithConcurrency(optedIn, SEND_CONCURRENCY, async (dev) => {
        const data: ReEngagementData = {
          login: dev.github_login,
          tier: tier.tier,
          kudos: kudosCounts.get(dev.id) ?? 0,
          newDevelopers: newDevelopers ?? 0,
        };
        const { subject, preheader } = reEngagementHeader(data);

        return sendNotification({
          type: "re_engagement",
          category: "marketing",
          developerId: dev.id,
          dedupKey: `re_engage:${dev.id}:${tier.tier}:${yearWeek}`,
          title: subject,
          body: preheader,
          render: (links) => renderReEngagementEmail(data, links),
          actionUrl: `${BASE_URL}/?user=${dev.github_login}`,
          priority: "low",
          channels: ["email"],
        });
      });
      tallySends(sendResults, results);

      if (devs.length < batchSize) break;
      offset += batchSize;
    }
  }

  return NextResponse.json({ ok: true, ...results });
}
