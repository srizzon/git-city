import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getLeagueBySlug, getMembership, getViewer } from "@/lib/leagues/service";
import { assertSameOrigin, readJson } from "@/lib/leagues/http";

export const dynamic = "force-dynamic";

// POST { reason }: a signed-in non-member reports the town's logo. One report
// per person per logo; reports queue up in /admin/league-reports.
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const bad = assertSameOrigin(req);
  if (bad) return bad;
  const [{ slug }, body, viewer] = await Promise.all([params, readJson(req), getViewer()]);
  if (!viewer) return NextResponse.json({ error: "Sign in to report." }, { status: 401 });
  const league = await getLeagueBySlug(slug);
  if (!league) return NextResponse.json({ error: "Town not found." }, { status: 404 });

  const member = await getMembership(league.id, viewer.id);
  if (member?.status === "active") return NextResponse.json({ error: "Members change the logo in settings." }, { status: 403 });

  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 280) : "";
  if (!reason) return NextResponse.json({ error: "Tell us what's wrong." }, { status: 400 });

  const sb = getSupabaseAdmin();
  const { data: city } = await sb.from("league_cities").select("logo_asset_id").eq("league_id", league.id).maybeSingle();
  if (!city?.logo_asset_id) return NextResponse.json({ error: "This town has no logo." }, { status: 404 });

  const { error } = await sb
    .from("league_reports")
    .insert({ league_id: league.id, asset_id: city.logo_asset_id, reporter_id: viewer.id, reason });
  if (error && error.code !== "23505") {
    console.error("[league-report]", error);
    return NextResponse.json({ error: "Couldn't send the report." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
