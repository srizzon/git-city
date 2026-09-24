import { NextRequest, NextResponse } from "next/server";
import { weekStart } from "@/lib/leagues/scoring";
import { closeWeek } from "@/lib/leagues/close";

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
    return NextResponse.json({
      ok: true,
      week_start: start.toISOString().slice(0, 10),
      closed: closed.length,
      winners: closed.filter((c) => c.winnerId).length,
      errors,
    });
  } catch (err) {
    console.error("[league-close]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
