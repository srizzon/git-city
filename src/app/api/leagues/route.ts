import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { createCustomLeague, getViewer } from "@/lib/leagues/service";
import { getGlobalRanking } from "@/lib/leagues/queries";
import { leagueErrorResponse, readJson } from "@/lib/leagues/http";

export const dynamic = "force-dynamic";

// GET: global company ranking for the current week.
export async function GET() {
  try {
    const ranking = await getGlobalRanking();
    return NextResponse.json(ranking, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch (err) {
    return leagueErrorResponse(err);
  }
}

// POST: create a custom league { name }.
export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!viewer.claimed) return NextResponse.json({ error: "Claim your building first." }, { status: 403 });

  const { ok } = rateLimit(`league-create:${viewer.id}`, 3, 60_000);
  if (!ok) return NextResponse.json({ error: "Too fast." }, { status: 429 });

  const body = await readJson(req);
  try {
    const league = await createCustomLeague(viewer, typeof body.name === "string" ? body.name : "");
    return NextResponse.json({ league });
  } catch (err) {
    return leagueErrorResponse(err);
  }
}
