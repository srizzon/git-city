import { NextRequest, NextResponse } from "next/server";
import { getLeagueBySlug } from "@/lib/leagues/service";
import { BRASIL_SLUG } from "@/lib/towns/brasil-server";
import { closeProjectWeek } from "@/lib/towns/brasil-projects-server";
import { projectWeek } from "@/lib/towns/brasil-projects";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ─── Brasil projects: the Monday close ──────────────────────────────────────
// Runs Monday 00:10 UTC (Sunday 21:10 in Brasília) and closes the week that
// just ended: its top 3, their points, every maker's email. A re-run pays and
// sends nothing twice. `?week=YYYY-MM-DD` closes another week.

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const param = request.nextUrl.searchParams.get("week");
  if (param && !/^\d{4}-\d{2}-\d{2}$/.test(param)) return NextResponse.json({ error: "Bad week" }, { status: 400 });
  const week = param ?? projectWeek(new Date(Date.now() - 86_400_000));
  const league = await getLeagueBySlug(BRASIL_SLUG);
  if (!league) return NextResponse.json({ error: "No Brasil town" }, { status: 404 });
  try {
    return NextResponse.json(await closeProjectWeek(league.id, week));
  } catch (err) {
    console.error("[cron] brasil-projects-close", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
