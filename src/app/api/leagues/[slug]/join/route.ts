import { NextResponse } from "next/server";
import { getLeagueBySlug, getViewer, joinLeague } from "@/lib/leagues/service";
import { leagueErrorResponse, readJson } from "@/lib/leagues/http";

export const dynamic = "force-dynamic";

// POST { ref? }: join a custom league through an invite link.
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const league = await getLeagueBySlug(slug);
  if (!league) return NextResponse.json({ error: "League not found." }, { status: 404 });

  const body = await readJson(req);
  try {
    const status = await joinLeague(viewer, league, typeof body.ref === "string" ? body.ref : null);
    return NextResponse.json({ status });
  } catch (err) {
    return leagueErrorResponse(err);
  }
}
