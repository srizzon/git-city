import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { getLeagueBySlug, getViewer, inviteMember } from "@/lib/leagues/service";
import { leagueErrorResponse, readJson } from "@/lib/leagues/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // may create a building from GitHub data

// POST { login }: add a colleague as a dark (invited) building and return
// their personal invite link.
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { ok } = rateLimit(`league-invite:${viewer.id}`, 1, 2000);
  if (!ok) return NextResponse.json({ error: "Too fast." }, { status: 429 });

  const league = await getLeagueBySlug(slug);
  if (!league) return NextResponse.json({ error: "League not found." }, { status: 404 });

  const body = await readJson(req);
  try {
    const result = await inviteMember(viewer, league, typeof body.login === "string" ? body.login : "");
    return NextResponse.json(result);
  } catch (err) {
    return leagueErrorResponse(err);
  }
}
