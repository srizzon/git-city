import { NextResponse } from "next/server";
import { getLeagueBySlug, getViewer } from "@/lib/leagues/service";
import { assertSameOrigin } from "@/lib/leagues/http";
import { rateLimit } from "@/lib/rate-limit";
import { getBrasilLayout } from "@/lib/towns/brasil-server";
import { heistBustsOn, heistDay, heistResult, heistSideOf, pickHeistSide } from "@/lib/towns/heist-server";
import { SIDE_TOKEN_TTL_MS, signSideToken } from "@/lib/towns/heist-side-token";
import { isSide } from "@/lib/towns/heist";
import { captureServer } from "@/lib/posthog-server";

export const dynamic = "force-dynamic";

// GET: the city of the day (its ring, how much stands), the viewer's side
// (residents are cops; null signed out or not picked yet) and yesterday's
// result for the tower. POST {side}: picks the viewer's side for the day (the
// first pick holds) and returns a signed token the drive room takes.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const league = await getLeagueBySlug(slug);
  if (league?.map !== "brasil") return NextResponse.json({ error: "Town not found." }, { status: 404 });
  const [{ layout }, viewer] = await Promise.all([getBrasilLayout(league.id), getViewer()]);
  const day = await heistDay(league.id, Date.now(), layout);
  if (!day) return NextResponse.json({ day: null, me: null, result: null }, { headers: { "Cache-Control": "private, no-store" } });
  const [me, result, busts] = await Promise.all([
    viewer ? heistSideOf(viewer.id, day, layout) : null,
    heistResult(viewer?.id ?? null),
    viewer ? heistBustsOn(viewer.id, day.day) : 0,
  ]);
  return NextResponse.json({ day, me: me ? { ...me, busts } : null, result }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const bad = assertSameOrigin(req);
  if (bad) return bad;
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in to pick a side." }, { status: 401 });
  if (!rateLimit(`brasil-heist:${viewer.id}`, 10, 60_000).ok) return NextResponse.json({ error: "Too fast." }, { status: 429 });
  let side: unknown = null;
  try {
    side = ((await req.json()) as { side?: unknown }).side;
  } catch {
    // checked below
  }
  if (!isSide(side)) return NextResponse.json({ error: "Pick robber or cop." }, { status: 400 });
  const { slug } = await params;
  const league = await getLeagueBySlug(slug);
  if (league?.map !== "brasil") return NextResponse.json({ error: "Town not found." }, { status: 404 });
  const { layout } = await getBrasilLayout(league.id);
  const day = await heistDay(league.id, Date.now(), layout);
  if (!day) return NextResponse.json({ error: "No city of the day yet." }, { status: 409 });
  const me = await pickHeistSide(viewer.id, day, layout, side);
  const token = me.side ? signSideToken({ dln: viewer.github_login.toLowerCase(), day: day.day, side: me.side, exp: Date.now() + SIDE_TOKEN_TTL_MS }) : null;
  void captureServer(viewer.github_login.toLowerCase(), "brasil_heist_side_picked", { side: me.side, resident: me.resident, city: day.key });
  return NextResponse.json({ me, token }, { headers: { "Cache-Control": "private, no-store" } });
}
