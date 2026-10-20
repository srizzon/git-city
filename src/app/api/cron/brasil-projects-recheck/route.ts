import { NextRequest, NextResponse } from "next/server";
import { getLeagueBySlug } from "@/lib/leagues/service";
import { BRASIL_SLUG } from "@/lib/towns/brasil-server";
import { recheckLive } from "@/lib/towns/brasil-projects-server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ─── Brasil projects: the nightly re-check ──────────────────────────────────
// Every live project screened again, oldest check first (04:00 in Brasília).
// A link that turned into a casino or malware after it was approved is hidden
// and waits in the admin's queue.

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const league = await getLeagueBySlug(BRASIL_SLUG);
  if (!league) return NextResponse.json({ error: "No Brasil town" }, { status: 404 });
  try {
    return NextResponse.json(await recheckLive(league.id, 150));
  } catch (err) {
    console.error("[cron] brasil-projects-recheck", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
