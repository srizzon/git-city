import { after, NextResponse } from "next/server";
import { getLeagueBySlug, getViewer } from "@/lib/leagues/service";
import { assertSameOrigin } from "@/lib/leagues/http";
import { rateLimit } from "@/lib/rate-limit";
import { getBrasilLayout } from "@/lib/towns/brasil-server";
import { cityByKey, cleanRaceGhost, minRaceMs, parseRouteKey, raceRoute } from "@/lib/towns/brasil-race";
import { verifyRallyReceipt } from "@/lib/towns/brasil-race-receipt";
import { getRaceWeek, getRouteBoard, getRouteGhost, getRouteRecords, racePointsOf, saveRaceResult } from "@/lib/towns/brasil-race-server";
import { sendRouteRecordNotification } from "@/lib/notification-senders/brasil-race";
import { captureServer } from "@/lib/posthog-server";

export const dynamic = "force-dynamic";

/** A record's ghost: a few minutes of frames. */
const MAX_BODY = 400_000;

// POST {token, ghost?}: a race receipt from the drive room. Saved only when
// it's signed, fresh, for this town, names the signed-in viewer, and its
// route is the one the map builds between those two cities today (so a
// made-up short route never reaches a board). A new record keeps its ghost
// and tells the old holder. Returns the viewer's best and place on the
// route, its board and what the race paid them.
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const bad = assertSameOrigin(req);
  if (bad) return bad;
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in to save your time." }, { status: 401 });
  if (!rateLimit(`brasil-race:${viewer.id}`, 20, 60_000).ok) return NextResponse.json({ error: "Too fast." }, { status: 429 });

  const raw = await req.text();
  if (raw.length > MAX_BODY) return NextResponse.json({ error: "Too big." }, { status: 413 });
  let body: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
  } catch {
    // an empty body fails the receipt check below
  }
  const v = verifyRallyReceipt(body.token);
  if (!v.ok) {
    if (v.reason === "config") console.error("[brasil race] FORCE_PUSH_HMAC_SECRET missing: times can't be saved");
    return NextResponse.json({ error: "Invalid race." }, { status: v.reason === "config" ? 503 : 400 });
  }
  const r = v.receipt;
  const { slug } = await params;
  if (r.dln !== viewer.github_login.toLowerCase() || r.room !== slug.toLowerCase()) return NextResponse.json({ error: "Invalid race." }, { status: 403 });

  const league = await getLeagueBySlug(slug);
  if (league?.map !== "brasil") return NextResponse.json({ error: "Town not found." }, { status: 404 });
  const { layout } = await getBrasilLayout(league.id);
  const route = raceRoute(layout, r.from, r.to);
  if (!route || route.key !== r.key) return NextResponse.json({ error: "This route changed on the map: your time can't go on its board." }, { status: 409 });
  if (r.ms < minRaceMs(route.length) || r.ms >= 3_600_000) return NextResponse.json({ error: "Invalid race." }, { status: 400 });

  const saved = await saveRaceResult(viewer.id, viewer.github_login, r, cleanRaceGhost(body.ghost, r.ms));
  if (!saved) return NextResponse.json({ error: "Couldn't save your time." }, { status: 500 });
  const points = await racePointsOf(viewer.id, r.race, r.key);
  await captureServer(viewer.github_login.toLowerCase(), "brasil_race_saved", { place: r.place, racers: r.n, ms: r.ms, record: saved.newRecord, points });

  const lost = saved.dethroned;
  if (lost) {
    const name = `${cityByKey(layout, r.from)?.name ?? "?"} → ${cityByKey(layout, r.to)?.name ?? "?"}`;
    after(() =>
      sendRouteRecordNotification({
        developerId: lost.id,
        leagueSlug: league.slug,
        routeName: name,
        routeKey: r.key,
        takerLogin: viewer.github_login,
        theirMs: r.ms,
        yourMs: lost.ms,
      }).then(() => undefined),
    );
  }
  return NextResponse.json({ ...saved, points });
}

// GET ?key=…: a route's board and record (&ghost=1: the record's ghost too).
// GET ?view=week: this week's racers and every route's record.
// GET ?race=…&key=…: what a race paid you so far (its points settle as the others save).
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const league = await getLeagueBySlug((await params).slug);
  if (league?.map !== "brasil") return NextResponse.json({ error: "Not found." }, { status: 404 });
  const q = new URL(req.url).searchParams;
  const key = q.get("key");
  const race = q.get("race");
  if (race && key) {
    const viewer = await getViewer();
    if (!viewer || !/^[A-Za-z0-9_-]{1,24}$/.test(race) || !parseRouteKey(key)) return NextResponse.json({ points: 0 });
    return NextResponse.json({ points: await racePointsOf(viewer.id, race, key) }, { headers: { "Cache-Control": "no-store" } });
  }
  if (key) {
    if (!parseRouteKey(key)) return NextResponse.json({ error: "Bad route." }, { status: 400 });
    const [board, ghost] = await Promise.all([getRouteBoard(key), q.get("ghost") === "1" ? getRouteGhost(key) : null]);
    return NextResponse.json({ board, ghost }, { headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30" } });
  }
  if (q.get("view") === "week") {
    const [racers, records] = await Promise.all([getRaceWeek(), getRouteRecords()]);
    return NextResponse.json({ racers, records }, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } });
  }
  return NextResponse.json({ error: "Not found." }, { status: 404 });
}
