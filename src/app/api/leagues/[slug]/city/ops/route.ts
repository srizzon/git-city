import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createServerSupabase } from "@/lib/supabase-server";
import { getGithubLoginFromUser } from "@/lib/admin";
import { assertSameOrigin, readJson } from "@/lib/leagues/http";
import { CityOpError } from "@/lib/league-city/service";

export const dynamic = "force-dynamic";

const ROUTE_ERRORS: Record<string, [string, number]> = {
  league_not_found: ["League not found.", 404],
  not_admin: ["Only the league admin can edit the city.", 403],
  rate_limit: ["Too many edits. Wait a few minutes.", 429],
  ring_not_empty: ["Clear the edge of the city before shrinking it.", 409],
  too_full: ["The city is too full to shrink.", 409],
};

// POST { ops }: apply a batch of city edits (admin only). Returns { version, size }.
// One database round trip: the session is verified locally from the JWT
// (getClaims), and apply_league_city_ops_admin resolves the league, checks
// admin and the rate limit, and applies the batch.
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const bad = assertSameOrigin(req);
  if (bad) return bad;

  const [{ slug }, body, supabase] = await Promise.all([params, readJson(req), createServerSupabase()]);
  const { data: claims } = await supabase.auth.getClaims();
  const login = getGithubLoginFromUser(claims?.claims ? { user_metadata: claims.claims.user_metadata } : null);
  if (!login) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!Array.isArray(body.ops)) return NextResponse.json({ error: "Missing ops.", code: "invalid_op" }, { status: 400 });

  const { data, error } = await getSupabaseAdmin().rpc("apply_league_city_ops_admin", {
    p_slug: slug,
    p_login: login,
    p_ops: body.ops,
  });
  if (error) {
    const known = ROUTE_ERRORS[error.message];
    if (known) return NextResponse.json({ error: known[0], code: error.message }, { status: known[1] });
    const err = new CityOpError(error.message);
    if (err.code === "city_failed") console.error("[league-city:ops]", error);
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
  }
  const res = data as { version: number; size: number };
  return NextResponse.json({ version: res.version, size: res.size });
}
