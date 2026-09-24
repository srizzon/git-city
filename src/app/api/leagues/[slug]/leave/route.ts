import { NextResponse } from "next/server";
import { getLeagueBySlug, getViewer, leaveLeague } from "@/lib/leagues/service";
import { assertSameOrigin, leagueErrorResponse } from "@/lib/leagues/http";

export const dynamic = "force-dynamic";

// POST: an active member leaves (former + building leaves the city). An admin
// who leaves hands admin to the most active member.
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const bad = assertSameOrigin(req);
  if (bad) return bad;
  const { slug } = await params;
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const league = await getLeagueBySlug(slug);
  if (!league) return NextResponse.json({ error: "League not found." }, { status: 404 });

  try {
    await leaveLeague(viewer, league);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return leagueErrorResponse(err);
  }
}
