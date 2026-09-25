import { NextResponse } from "next/server";
import { decideJoinRequest, getLeagueBySlug, getViewer } from "@/lib/leagues/service";
import { assertSameOrigin, leagueErrorResponse, readJson } from "@/lib/leagues/http";

export const dynamic = "force-dynamic";

// POST { approve: boolean }: the admin lets a requester in, or declines.
export async function POST(req: Request, { params }: { params: Promise<{ slug: string; login: string }> }) {
  const bad = assertSameOrigin(req);
  if (bad) return bad;
  const { slug, login } = await params;
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const league = await getLeagueBySlug(slug);
  if (!league) return NextResponse.json({ error: "Town not found." }, { status: 404 });

  const body = await readJson(req);
  if (typeof body.approve !== "boolean") return NextResponse.json({ error: "Missing approve." }, { status: 400 });
  try {
    await decideJoinRequest(viewer, league, decodeURIComponent(login), body.approve);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return leagueErrorResponse(err);
  }
}
