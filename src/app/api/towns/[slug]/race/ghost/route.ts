import { NextResponse } from "next/server";
import { getLeagueBySlug } from "@/lib/leagues/service";
import { rateLimit } from "@/lib/rate-limit";
import { getBestGhost } from "@/lib/league-city/race/board";
import { TRACK_ID } from "@/lib/league-city/race/track";

export const dynamic = "force-dynamic";

// GET ?login=x: that driver's best-lap ghost on this town's track, to race.
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const login = new URL(req.url).searchParams.get("login") ?? "";
  if (!/^[A-Za-z0-9-]{1,39}$/.test(login)) return NextResponse.json({ error: "Bad login." }, { status: 400 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anon";
  if (!rateLimit(`race-ghost:${ip}`, 60, 60_000).ok) return NextResponse.json({ error: "Too fast." }, { status: 429 });
  const { slug } = await params;
  const league = await getLeagueBySlug(slug);
  if (!league) return NextResponse.json({ error: "Town not found." }, { status: 404 });
  const ghost = await getBestGhost(league.id, TRACK_ID, login);
  if (!ghost) return NextResponse.json({ error: "No ghost." }, { status: 404 });
  return NextResponse.json(ghost, { headers: { "Cache-Control": "private, max-age=30" } });
}
