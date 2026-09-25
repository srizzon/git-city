import { NextResponse } from "next/server";
import { cancelJoinRequest, getLeagueBySlug, getViewer, listJoinRequests, requestJoin } from "@/lib/leagues/service";
import { assertSameOrigin, leagueErrorResponse } from "@/lib/leagues/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  const [viewer, league] = await Promise.all([getViewer(), getLeagueBySlug(slug)]);
  if (!viewer) return { error: NextResponse.json({ error: "Sign in first." }, { status: 401 }) };
  if (!league) return { error: NextResponse.json({ error: "Town not found." }, { status: 404 }) };
  return { viewer, league };
}

// GET: the admin's list of open requests.
export async function GET(_req: Request, { params }: Ctx) {
  const r = await load((await params).slug);
  if ("error" in r) return r.error;
  try {
    return NextResponse.json({ requests: await listJoinRequests(r.viewer, r.league) });
  } catch (err) {
    return leagueErrorResponse(err);
  }
}

// POST: ask to join a town in request mode.
export async function POST(req: Request, { params }: Ctx) {
  const bad = assertSameOrigin(req);
  if (bad) return bad;
  const r = await load((await params).slug);
  if ("error" in r) return r.error;
  try {
    return NextResponse.json({ status: await requestJoin(r.viewer, r.league) });
  } catch (err) {
    return leagueErrorResponse(err);
  }
}

// DELETE: take your request back.
export async function DELETE(req: Request, { params }: Ctx) {
  const bad = assertSameOrigin(req);
  if (bad) return bad;
  const r = await load((await params).slug);
  if ("error" in r) return r.error;
  try {
    await cancelJoinRequest(r.viewer, r.league);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return leagueErrorResponse(err);
  }
}
