import { NextResponse } from "next/server";
import { getLeagueBySlug, getViewer } from "@/lib/leagues/service";
import { assertSameOrigin, readJson } from "@/lib/leagues/http";
import { rateLimit } from "@/lib/rate-limit";
import { getLapBoard, recordLap } from "@/lib/league-city/race/board";
import { verifyLapReceipt } from "@/lib/league-city/race/receipt";
import { minLapMs } from "@/lib/league-city/race/laps";
import { TRACK_ID, theTrack } from "@/lib/league-city/race/track";

export const dynamic = "force-dynamic";

// POST {token}: a lap receipt from the race server. Saved only when it's
// signed, fresh, for this town and track, and names the signed-in viewer, so
// neither a made-up time nor someone else's receipt gets on the board.
// Returns the viewer's best, whether this lap set it, their rank, and the board.
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const bad = assertSameOrigin(req);
  if (bad) return bad;
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in to save laps." }, { status: 401 });
  if (!rateLimit(`town-lap:${viewer.id}`, 20, 60_000).ok) return NextResponse.json({ error: "Too fast." }, { status: 429 });

  const body = await readJson(req);
  const v = verifyLapReceipt(body.token);
  if (!v.ok) {
    if (v.reason === "config") console.error("[race] FORCE_PUSH_HMAC_SECRET missing: laps can't be saved");
    return NextResponse.json({ error: "Invalid lap." }, { status: v.reason === "config" ? 503 : 400 });
  }
  const r = v.receipt;
  const { slug } = await params;
  if (r.dln !== viewer.github_login.toLowerCase() || r.track !== TRACK_ID || r.room !== slug.toLowerCase()) {
    return NextResponse.json({ error: "Invalid lap." }, { status: 403 });
  }
  if (r.ms < minLapMs(theTrack()) || r.ms >= 3_600_000) return NextResponse.json({ error: "Invalid lap." }, { status: 400 });

  const league = await getLeagueBySlug(slug);
  if (!league) return NextResponse.json({ error: "Town not found." }, { status: 404 });
  const saved = await recordLap(league.id, TRACK_ID, viewer.id, r.ms);
  if (!saved) return NextResponse.json({ error: "Couldn't save the lap." }, { status: 500 });
  const board = await getLapBoard(league.id, TRACK_ID);
  return NextResponse.json({ ...saved, board });
}
