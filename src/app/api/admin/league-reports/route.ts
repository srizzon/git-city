import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isAdminUser } from "@/lib/auth-identity";
import { invalidateLeague } from "@/lib/leagues/cache";
import { leagueAssetUrl } from "@/lib/league-city/identity";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user && isAdminUser(user) ? user : null;
}

interface ReportRow {
  asset_id: string;
  reason: string;
  at: string;
  league: { id: string; slug: string; name: string } | null;
  asset: { path: string; status: string } | null;
}

// GET: open logo reports, grouped by logo.
export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { data, error } = await getSupabaseAdmin()
    .from("league_reports")
    .select("asset_id, reason, at, league:leagues(id, slug, name), asset:league_assets(path, status)")
    .is("resolved_at", null)
    .order("at", { ascending: false })
    .limit(500)
    .returns<ReportRow[]>();
  if (error) return NextResponse.json({ error: "Failed to load reports" }, { status: 500 });

  const byAsset = new Map<string, { asset_id: string; league: ReportRow["league"]; url: string | null; status: string; reasons: string[]; last: string }>();
  for (const r of data ?? []) {
    const g = byAsset.get(r.asset_id) ?? {
      asset_id: r.asset_id,
      league: r.league,
      url: r.asset ? leagueAssetUrl(r.asset.path) : null,
      status: r.asset?.status ?? "removed",
      reasons: [],
      last: r.at,
    };
    g.reasons.push(r.reason);
    byAsset.set(r.asset_id, g);
  }
  return NextResponse.json({ reports: [...byAsset.values()] });
}

// POST { asset_id, action: "takedown" | "dismiss" }: a takedown marks the
// logo removed (objects stay and show name plates); both resolve its reports.
export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { asset_id?: string; action?: string };
  if (!body.asset_id || (body.action !== "takedown" && body.action !== "dismiss")) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const sb = getSupabaseAdmin();
  if (body.action === "takedown") {
    const { data: asset } = await sb
      .from("league_assets")
      .update({ status: "removed" })
      .eq("id", body.asset_id)
      .select("league_id")
      .maybeSingle();
    if (asset) invalidateLeague(asset.league_id as string);
  }
  await sb.from("league_reports").update({ resolved_at: new Date().toISOString() }).eq("asset_id", body.asset_id).is("resolved_at", null);
  return NextResponse.json({ ok: true });
}
