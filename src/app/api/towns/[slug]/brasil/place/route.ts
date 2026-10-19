import { NextResponse } from "next/server";
import { getLeagueBySlug, getViewer } from "@/lib/leagues/service";
import { assertSameOrigin, readJson } from "@/lib/leagues/http";
import { captureServer } from "@/lib/posthog-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { cityKeyOf, parseUF } from "@/lib/towns/brasil-map";
import { cityOf } from "@/lib/towns/br-cities";
import { cityForState, placeBrasilResident } from "@/lib/towns/brasil-server";

export const dynamic = "force-dynamic";

/** A resident can move to another city once a week (their first pick of a city is free). */
const MOVE_EVERY_MS = 7 * 24 * 60 * 60 * 1000;

// POST { city: 3509502 | null } (an IBGE code; null: the island), or the old
// { uf: "SP" } (that state's capital): put the signed-in dev on the Brasil
// map there, founding the city if nobody lives there yet, or move them
// there. Their lot is kept inside the city (lib/towns/brasil-server).
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const bad = assertSameOrigin(req);
  if (bad) return bad;
  const { slug } = await params;
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const league = await getLeagueBySlug(slug);
  if (!league || league.map !== "brasil") return NextResponse.json({ error: "Town not found." }, { status: 404 });

  const body = await readJson(req);
  let city: number | null | undefined;
  if (body.city === null) city = null;
  else if (typeof body.city === "number" && cityOf(body.city)) city = body.city;
  else if ("uf" in body) {
    const uf = body.uf === null ? null : typeof body.uf === "string" ? parseUF(body.uf) : undefined;
    city = uf === undefined ? undefined : cityForState(uf);
  }
  if (city === undefined) return NextResponse.json({ error: "Pick a city." }, { status: 400 });

  const { data: current } = await getSupabaseAdmin()
    .from("brasil_residents")
    .select("ibge, placed_at, city_picked")
    .eq("league_id", league.id)
    .eq("developer_id", viewer.id)
    .maybeSingle<{ ibge: number | null; placed_at: string; city_picked: boolean }>();
  if (current && current.city_picked && cityKeyOf(current.ibge) !== cityKeyOf(city) && Date.now() - Date.parse(current.placed_at) < MOVE_EVERY_MS) {
    const next = new Date(Date.parse(current.placed_at) + MOVE_EVERY_MS);
    return NextResponse.json({ error: `You can move again on ${next.toUTCString().slice(0, 16)}.` }, { status: 429 });
  }

  try {
    const out = await placeBrasilResident(league, { id: viewer.id, login: viewer.github_login }, city, "site", true);
    if (out.status !== "already") {
      const info = city === null ? null : cityOf(city);
      await captureServer(viewer.github_login.toLowerCase(), out.status === "added" ? "brasil_resident_added" : "brasil_resident_moved", { uf: info?.uf ?? null, city, founded: out.founded, source: "site" });
    }
    return NextResponse.json(out);
  } catch (err) {
    console.error("[brasil] place", err);
    return NextResponse.json({ error: "Couldn't put you on the map. Try again." }, { status: 500 });
  }
}
