import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getLeagueBySlug, getViewer } from "@/lib/leagues/service";
import { assertSameOrigin, readJson } from "@/lib/leagues/http";
import { CityOpError, applyOps } from "@/lib/league-city/service";
import type { CityOp } from "@/lib/league-city/types";

export const dynamic = "force-dynamic";

const MAX_BATCHES = 120;
const WINDOW_MS = 10 * 60_000;

// POST { ops }: apply a batch of city edits (admin only). Returns { version, size }.
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const bad = assertSameOrigin(req);
  if (bad) return bad;
  const { slug } = await params;
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const league = await getLeagueBySlug(slug);
  if (!league) return NextResponse.json({ error: "League not found." }, { status: 404 });
  if (league.admin_id !== viewer.id) {
    return NextResponse.json({ error: "Only the league admin can edit the city.", code: "not_admin" }, { status: 403 });
  }

  const { count } = await getSupabaseAdmin()
    .from("league_city_ops")
    .select("id", { count: "exact", head: true })
    .eq("actor_id", viewer.id)
    .gte("at", new Date(Date.now() - WINDOW_MS).toISOString());
  if ((count ?? 0) >= MAX_BATCHES) {
    return NextResponse.json({ error: "Too many edits. Wait a few minutes.", code: "rate_limit" }, { status: 429 });
  }

  const body = await readJson(req);
  if (!Array.isArray(body.ops)) return NextResponse.json({ error: "Missing ops.", code: "invalid_op" }, { status: 400 });
  try {
    const res = await applyOps(league.id, viewer.id, body.ops as CityOp[]);
    return NextResponse.json({ version: res.version, size: res.size });
  } catch (err) {
    if (err instanceof CityOpError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    console.error("[league-city:ops]", err);
    return NextResponse.json({ error: "Couldn't save the city." }, { status: 500 });
  }
}
