import { NextResponse } from "next/server";
import { getLeagueBySlug, getViewer, inviteMember } from "@/lib/leagues/service";
import { assertSameOrigin, leagueErrorResponse, readJson } from "@/lib/leagues/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // may create a building from GitHub data

// POST { login }: add a colleague as an invited building and return
// their personal invite link.
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const bad = assertSameOrigin(req);
  if (bad) return bad;
  const { slug } = await params;
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const league = await getLeagueBySlug(slug);
  if (!league) return NextResponse.json({ error: "Town not found." }, { status: 404 });

  const body = await readJson(req);
  try {
    // Link on the same host the inviter is using (preview, local, prod).
    const origin = (process.env.PORTLESS_URL ?? new URL(req.url).origin).replace(/\/$/, "");
    const result = await inviteMember(viewer, league, typeof body.login === "string" ? body.login : "", origin);
    return NextResponse.json(result);
  } catch (err) {
    return leagueErrorResponse(err);
  }
}
