import { NextResponse } from "next/server";
import { getLeagueBySlug, getViewer, joinLeague } from "@/lib/leagues/service";
import { assertSameOrigin, leagueErrorResponse, readJson } from "@/lib/leagues/http";

export const dynamic = "force-dynamic";

// POST { ref?, t? }: join a custom league: invited members, or anyone with
// the league's invite token (t).
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const bad = assertSameOrigin(req);
  if (bad) return bad;
  const { slug } = await params;
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const league = await getLeagueBySlug(slug);
  if (!league) return NextResponse.json({ error: "League not found." }, { status: 404 });

  const body = await readJson(req);
  try {
    const status = await joinLeague(
      viewer,
      league,
      typeof body.ref === "string" ? body.ref : null,
      typeof body.t === "string" ? body.t : null,
    );
    return NextResponse.json({ status });
  } catch (err) {
    return leagueErrorResponse(err);
  }
}
