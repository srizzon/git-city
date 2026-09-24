import { NextResponse } from "next/server";
import { getLeagueBySlug, getViewer, setScoringMode, transferAdmin } from "@/lib/leagues/service";
import { getLeaguePageData } from "@/lib/leagues/queries";
import { leagueErrorResponse, readJson } from "@/lib/leagues/http";
import type { ScoringMode } from "@/lib/leagues/scoring";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

// GET: league page data (members, standings, hall of fame, viewer state).
export async function GET(_req: Request, { params }: Ctx) {
  const { slug } = await params;
  const league = await getLeagueBySlug(slug);
  if (!league) return NextResponse.json({ error: "League not found." }, { status: 404 });
  try {
    const viewer = await getViewer();
    return NextResponse.json(await getLeaguePageData(league, viewer));
  } catch (err) {
    return leagueErrorResponse(err);
  }
}

// PATCH: admin settings { scoring_mode?, admin_login? }.
export async function PATCH(req: Request, { params }: Ctx) {
  const { slug } = await params;
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const league = await getLeagueBySlug(slug);
  if (!league) return NextResponse.json({ error: "League not found." }, { status: 404 });

  const body = await readJson(req);
  try {
    if (typeof body.scoring_mode === "string") await setScoringMode(viewer, league, body.scoring_mode as ScoringMode);
    if (typeof body.admin_login === "string") await transferAdmin(viewer, league, body.admin_login);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return leagueErrorResponse(err);
  }
}
