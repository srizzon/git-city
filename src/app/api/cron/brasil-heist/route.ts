import { NextRequest, NextResponse } from "next/server";
import { getLeagueBySlug } from "@/lib/leagues/service";
import { BRASIL_SLUG } from "@/lib/towns/brasil-server";
import { brasiliaToday } from "@/lib/towns/brasil-day";
import { heistDay, settleHeistDay } from "@/lib/towns/heist-server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// ─── City of the day: midnight ──────────────────────────────────────────────
// Runs 03:05 UTC (00:05 in Brasília): settles the day that just ended (how
// much of its city stood, the cops' bonus when it held) and picks today's
// city. A re-run settles and pays nothing twice. `?day=YYYY-MM-DD` settles
// another day.

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const param = request.nextUrl.searchParams.get("day");
  if (param && !/^\d{4}-\d{2}-\d{2}$/.test(param)) return NextResponse.json({ error: "Bad day" }, { status: 400 });
  const day = param ?? brasiliaToday(Date.now() - 86_400_000);
  const league = await getLeagueBySlug(BRASIL_SLUG);
  if (!league) return NextResponse.json({ error: "No Brasil town" }, { status: 404 });
  try {
    const settled = await settleHeistDay(league.id, day);
    const today = await heistDay(league.id);
    return NextResponse.json({ settled, day, today: today?.key ?? null });
  } catch (err) {
    console.error("[cron] brasil-heist", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
