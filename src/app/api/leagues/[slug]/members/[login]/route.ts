import { NextResponse } from "next/server";
import { getLeagueBySlug, getViewer, removeMember } from "@/lib/leagues/service";
import { assertSameOrigin, leagueErrorResponse } from "@/lib/leagues/http";

export const dynamic = "force-dynamic";

// DELETE: admin removes a member (former + building leaves the city).
export async function DELETE(req: Request, { params }: { params: Promise<{ slug: string; login: string }> }) {
  const bad = assertSameOrigin(req);
  if (bad) return bad;
  const { slug, login } = await params;
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const league = await getLeagueBySlug(slug);
  if (!league) return NextResponse.json({ error: "Town not found." }, { status: 404 });

  try {
    // Next already decoded the segment; decoding again throws on a stray "%".
    await removeMember(viewer, league, login);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return leagueErrorResponse(err);
  }
}
