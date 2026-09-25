import { NextRequest, NextResponse } from "next/server";
import { weekStart } from "@/lib/leagues/scoring";
import { closeWeek } from "@/lib/leagues/close";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendLeagueWeeklyResults } from "@/lib/notification-senders/league-weekly";
import { closeTownWeek, type TownWeekResult } from "@/lib/towns/weekly";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ─── Monday week close ───────────────────────────────────────────────────────
// Runs Monday 00:05 UTC and closes the week that just ended. `?week=YYYY-MM-DD`
// closes another week (staging tests: pass the current Monday).

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const param = request.nextUrl.searchParams.get("week");
  let start: Date;
  if (param) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(param)) return NextResponse.json({ error: "Bad week" }, { status: 400 });
    start = weekStart(new Date(`${param}T12:00:00Z`));
  } else {
    start = weekStart(new Date());
    start.setUTCDate(start.getUTCDate() - 7);
  }

  try {
    const { closed, errors } = await closeWeek(start);

    // Results emails (awaited). Previous global rank shows the move.
    const prevWeek = new Date(start);
    prevWeek.setUTCDate(prevWeek.getUTCDate() - 7);
    const { data: prevRows } = await getSupabaseAdmin()
      .from("league_weeks")
      .select("league_id, standings")
      .eq("week_start", prevWeek.toISOString().slice(0, 10));
    const prevRank = new Map(
      (prevRows ?? []).map((r) => [r.league_id as string, ((r.standings as { global_rank?: number | null })?.global_rank ?? null)]),
    );
    let emailed = 0;
    for (const c of closed) {
      try {
        emailed += await sendLeagueWeeklyResults(c, prevRank.get(c.league.id) ?? null);
      } catch (err) {
        console.error(`[league-close] emails for ${c.league.slug}:`, err);
      }
    }
    // Visits rollup and Town of the week. A failure here doesn't undo the race.
    let towns: TownWeekResult | { error: string };
    try {
      towns = await closeTownWeek(start);
    } catch (err) {
      console.error("[league-close] town week:", err);
      towns = { error: String(err) };
    }

    return NextResponse.json({
      ok: true,
      towns,
      week_start: start.toISOString().slice(0, 10),
      closed: closed.length,
      winners: closed.filter((c) => c.winnerId).length,
      errors,
      emailed,
    });
  } catch (err) {
    console.error("[league-close]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
