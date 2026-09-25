import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getLeagueBySlug, getMembership, getViewer } from "@/lib/leagues/service";
import { assertSameOrigin, readJson } from "@/lib/leagues/http";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Visit XP, same amount as a building visit; grant_xp applies the daily cap.
const VISIT_XP = 2;

// POST {drove?}: a qualified visit (the client waits 30 s, or posts on the
// first drive). One row per dev per town per UTC day; members don't count.
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const bad = assertSameOrigin(req);
  if (bad) return bad;
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!rateLimit(`town-visit:${viewer.id}`, 5, 60_000).ok) {
    return NextResponse.json({ error: "Too fast." }, { status: 429 });
  }
  const { slug } = await params;
  const league = await getLeagueBySlug(slug);
  if (!league) return NextResponse.json({ error: "Town not found." }, { status: 404 });

  const member = await getMembership(league.id, viewer.id);
  if (member?.status === "active" || member?.status === "invited") return NextResponse.json({ ok: true, counted: false });

  const body = await readJson(req);
  const sb = getSupabaseAdmin();
  const { data: isNew, error } = await sb.rpc("record_town_visit", {
    p_league_id: league.id,
    p_developer_id: viewer.id,
    p_drove: body.drove === true,
  });
  if (error) {
    console.error("[towns] record_town_visit failed:", error);
    return NextResponse.json({ error: "Couldn't record the visit." }, { status: 500 });
  }

  if (isNew === true) {
    await Promise.all([
      sb.rpc("grant_xp", { p_developer_id: viewer.id, p_source: "visit", p_amount: VISIT_XP }),
      sb.rpc("grant_emblem", {
        p_developer_id: viewer.id,
        p_emblem_id: "tourist",
        p_claim_key: `tourist:${viewer.id}:${league.id}`,
        p_meta: { league_id: league.id },
        p_source: "town",
      }),
    ]);
  }
  return NextResponse.json({ ok: true, counted: isNew === true });
}
