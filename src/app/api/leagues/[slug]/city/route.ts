import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getLeagueBySlug } from "@/lib/leagues/service";
import { getCachedCity, getCity } from "@/lib/league-city/service";

export const dynamic = "force-dynamic";

// GET: the league's city { version, size, objects }. Public, like the page,
// and the same for every viewer, so the CDN may cache it for 30s (drivers
// poll it). The editor resyncs with ?fresh=1, which skips the server cache
// for a signed-in session (checked locally from the JWT, no round trip).
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const league = await getLeagueBySlug(slug);
  if (!league) return NextResponse.json({ error: "Town not found." }, { status: 404 });

  // ?fresh=1 is never stored by the CDN, signed in or not, so an anonymous
  // hit can't park a stale copy where the editor reads.
  const wantsFresh = new URL(req.url).searchParams.get("fresh") === "1";
  let fresh = false;
  if (wantsFresh) {
    const { data } = await (await createServerSupabase()).auth.getClaims();
    fresh = !!data?.claims?.sub;
  }
  try {
    const city = fresh ? await getCity(league.id) : await getCachedCity(league.id);
    return NextResponse.json(city, {
      headers: {
        "Cache-Control": wantsFresh ? "private, no-store" : "public, s-maxage=30, stale-while-revalidate=60",
      },
    });
  } catch (err) {
    console.error("[league-city:read]", err);
    return NextResponse.json({ error: "Couldn't load the city." }, { status: 500 });
  }
}
