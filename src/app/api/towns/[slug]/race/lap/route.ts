import { after, NextResponse } from "next/server";
import { getLeagueBySlug, getViewer } from "@/lib/leagues/service";
import { assertSameOrigin } from "@/lib/leagues/http";
import { rateLimit } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getLapBoard, getWeekBoard, recordRaceLap, saveBestGhost } from "@/lib/league-city/race/board";
import { cleanGhost } from "@/lib/league-city/race/ghost";
import { verifyLapReceipt } from "@/lib/league-city/race/receipt";
import { minLapMs } from "@/lib/league-city/race/laps";
import { TRACK_ID, theTrack } from "@/lib/league-city/race/track";
import { townDisplayName } from "@/lib/towns/names";
import { sendRacePassedNotification } from "@/lib/notification-senders/race";

export const dynamic = "force-dynamic";

/** A ghost is ~20 KB; anything much bigger isn't one. */
const MAX_BODY = 200_000;

// POST {token, ghost?}: a lap receipt from the race server, and the path of
// that lap. Saved only when it's signed, fresh, for this town and track, and
// names the signed-in viewer, so neither a made-up time nor someone else's
// receipt gets on the board. The ghost is kept when the lap set their best.
// Drivers this lap passed hear about it (after the response).
// Returns the viewer's bests and ranks (all time and this week) and both boards.
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const bad = assertSameOrigin(req);
  if (bad) return bad;
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in to save laps." }, { status: 401 });
  if (!rateLimit(`town-lap:${viewer.id}`, 20, 60_000).ok) return NextResponse.json({ error: "Too fast." }, { status: 429 });

  const raw = await req.text();
  if (raw.length > MAX_BODY) return NextResponse.json({ error: "Too big." }, { status: 413 });
  let body: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
  } catch {
    // an empty body fails the receipt check below
  }
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
  const saved = await recordRaceLap(league.id, TRACK_ID, viewer.id, r.ms);
  if (!saved) return NextResponse.json({ error: "Couldn't save the lap." }, { status: 500 });

  const ghost = saved.improved ? cleanGhost(body.ghost, r.ms) : null;
  if (ghost) await saveBestGhost(league.id, TRACK_ID, viewer.id, ghost);

  if (saved.passed.length > 0) {
    const passed = saved.passed;
    after(async () => {
      const { data } = await getSupabaseAdmin()
        .from("town_race_laps")
        .select("developer_id, best_ms")
        .eq("league_id", league.id)
        .eq("track", TRACK_ID)
        .in("developer_id", passed);
      for (const row of (data ?? []) as { developer_id: number; best_ms: number }[]) {
        const { count } = await getSupabaseAdmin()
          .from("town_race_laps")
          .select("developer_id", { count: "exact", head: true })
          .eq("league_id", league.id)
          .eq("track", TRACK_ID)
          .lt("best_ms", row.best_ms);
        await sendRacePassedNotification({
          developerId: row.developer_id,
          leagueSlug: league.slug,
          leagueName: townDisplayName(league.name),
          passerLogin: viewer.github_login,
          theirMs: saved.best_ms,
          yourMs: row.best_ms,
          newRank: (count ?? 0) + 1,
        }).catch((err) => console.error("[race] passed notification failed:", err));
      }
    });
  }

  const [board, week] = await Promise.all([getLapBoard(league.id, TRACK_ID), getWeekBoard(league.id, TRACK_ID)]);
  const { passed: _passed, ...mine } = saved;
  void _passed;
  return NextResponse.json({ ...mine, ghost_saved: !!ghost, board, week });
}
