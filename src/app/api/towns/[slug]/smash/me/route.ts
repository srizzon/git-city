import { NextResponse } from "next/server";
import { getLeagueBySlug } from "@/lib/leagues/service";
import { smashViewer } from "@/lib/league-city/smash-server";
import { getBrasilLayout } from "@/lib/towns/brasil-server";
import { heistDay, heistSideOf } from "@/lib/towns/heist-server";

export const dynamic = "force-dynamic";

// GET with `Authorization: Bearer <supabase access token>`: who that is and
// whether they may smash here. The drive room asks when a driver says hello;
// it never trusts the client's own word on who they are. On the Brasil map,
// also their side in the city of the day (`heist`: robber, cop or null).
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const league = await getLeagueBySlug(slug);
  if (!league) return NextResponse.json({ error: "Town not found." }, { status: 404 });
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!token || token.length > 4096) return NextResponse.json({ error: "No token." }, { status: 401 });
  const viewer = await smashViewer(token, slug).catch(() => null);
  if (!viewer) return NextResponse.json({ error: "Unknown viewer." }, { status: 401 });
  let heist: string | null = null;
  if (league.map === "brasil") {
    const { layout } = await getBrasilLayout(league.id);
    const day = await heistDay(league.id, Date.now(), layout).catch(() => null);
    if (day) heist = (await heistSideOf(viewer.devId, day, layout)).side;
  }
  return NextResponse.json({ ...viewer, heist }, { headers: { "Cache-Control": "private, no-store" } });
}
