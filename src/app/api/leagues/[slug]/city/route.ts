import { NextResponse } from "next/server";
import { getLeagueBySlug } from "@/lib/leagues/service";
import { getCity } from "@/lib/league-city/service";

export const dynamic = "force-dynamic";

// GET: the league's city { version, size, objects }. Public, like the page.
// The editor calls it to resync when the server moved without its ops.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const league = await getLeagueBySlug(slug);
  if (!league) return NextResponse.json({ error: "League not found." }, { status: 404 });
  try {
    const city = await getCity(league.id);
    return NextResponse.json(city, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[league-city:read]", err);
    return NextResponse.json({ error: "Couldn't load the city." }, { status: 500 });
  }
}
