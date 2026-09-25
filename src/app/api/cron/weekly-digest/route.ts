import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendNotification, sendOutcome } from "@/lib/notifications";
import { mapWithConcurrency } from "@/lib/concurrency";
import {
  RECAP_DEV_COLUMNS,
  hasRecapNews,
  loadRecapContext,
  loadWeeklyRecaps,
  recapHeader,
  renderWeeklyRecapEmail,
} from "@/lib/notification-senders/weekly-recap";

export const maxDuration = 300;

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://thegitcity.com";
const TIME_BUDGET_MS = 240_000;
const SEND_CONCURRENCY = 4;
const ACTIVE_WINDOW_DAYS = 30;
const BATCH_SIZE = 50;

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
  const results = { sent: 0, skipped: 0, errors: 0, timedOut: false };

  const ctx = await loadRecapContext(now);

  let offset = 0;

  while (true) {
    if (Date.now() - started > TIME_BUDGET_MS) {
      results.timedOut = true;
      break;
    }

    const { data: devs } = await sb
      .from("developers")
      .select(RECAP_DEV_COLUMNS)
      .eq("claimed", true)
      .not("email", "is", null)
      .gte("last_active_at", activeSince)
      .order("id", { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1);

    if (!devs || devs.length === 0) break;

    const recaps = await loadWeeklyRecaps(devs, ctx);

    const sendResults = await mapWithConcurrency(devs, SEND_CONCURRENCY, async (dev) => {
      if (Date.now() - started > TIME_BUDGET_MS) {
        results.timedOut = true;
        return "skipped";
      }

      const data = recaps.get(dev.id);
      if (!data) return "skipped";
      if (!hasRecapNews(data)) return "skipped";

      const { subject, preheader } = recapHeader(data);
      const sent = await sendNotification({
        type: "weekly_digest",
        category: "digest",
        developerId: dev.id,
        dedupKey: `weekly_digest:${dev.id}:${weekStartDate}`,
        title: subject,
        body: preheader,
        render: (links) => renderWeeklyRecapEmail(data, links),
        actionUrl: `${BASE_URL}/?user=${dev.github_login}`,
        priority: "high", // Digests are their own batch, don't re-batch
        channels: ["email"],
      });
      return sendOutcome(sent);
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

    if (devs.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
  }

  return NextResponse.json({ ok: true, ...results, townOfWeek: ctx.townOfWeek?.name ?? null, newDevelopers: ctx.newDevelopers });
}
