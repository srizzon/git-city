import { NextResponse, after } from "next/server";
import { getLeagueBySlug } from "@/lib/leagues/service";
import { loadPaint, paintWeek, savePaint, verifyPaintSave } from "@/lib/towns/brasil-paint-server";
import { PAINT_ROOM } from "@/lib/towns/brasil-paint";
import { pointsWeek } from "@/lib/towns/brasil-points";
import { getBrasilLayout } from "@/lib/towns/brasil-server";
import { notifyInvaded } from "@/lib/notification-senders/brasil-invaded";

export const dynamic = "force-dynamic";

const WEEK_MS = 7 * 86_400_000;

// GET: what the drive room loads for the State War (the buildings, the map's
// scale, today's painting points, the week so far). ?war=1 instead: the
// states' average shares this week and last week's. Public: it's what anyone
// sees on the map. Only the Brasil town paints.
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const league = slug === PAINT_ROOM ? await getLeagueBySlug(slug) : null;
  if (!league) return NextResponse.json({ error: "No war here." }, { status: 404 });
  try {
    if (new URL(req.url).searchParams.get("war") === "1") {
      const now = Date.now();
      const [week, last] = await Promise.all([paintWeek(pointsWeek(new Date(now)), now), paintWeek(pointsWeek(new Date(now - WEEK_MS)), now)]);
      return NextResponse.json({ week, last }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } });
    }
    return NextResponse.json(await loadPaint(league.id), { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    console.error("[paint:read]", err);
    return NextResponse.json({ error: "Couldn't load the war." }, { status: 500 });
  }
}

// POST: the drive room's save, signed (x-paint-signature). Answers once it's
// all written: a failure makes the room resend it whole. The invasion emails
// go out after.
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = await req.text();
  const save = slug === PAINT_ROOM ? verifyPaintSave(slug, body, req.headers.get("x-paint-signature")) : null;
  if (!save) return NextResponse.json({ error: "Bad signature." }, { status: 401 });
  const league = await getLeagueBySlug(slug);
  if (!league) return NextResponse.json({ error: "No war here." }, { status: 404 });
  try {
    await savePaint(save);
    if (save.invasions.length) {
      after(async () => {
        const { layout } = await getBrasilLayout(league.id);
        for (const v of save.invasions) await notifyInvaded(layout, v).catch((err) => console.error("[paint:invaded]", err));
      });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[paint:save]", err);
    return NextResponse.json({ error: "Couldn't save." }, { status: 500 });
  }
}
