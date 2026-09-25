import { NextResponse, after } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAuthedDeveloper } from "@/lib/auth-identity";
import { assertSameOrigin, readJson } from "@/lib/leagues/http";
import { getLeagueBySlug } from "@/lib/leagues/service";
import { invalidateLeague } from "@/lib/leagues/cache";
import { CityOpError } from "@/lib/league-city/service";
import { cleanOpsProps } from "@/lib/league-city/props-schema";
import type { CityOp, ItemType } from "@/lib/league-city/types";

export const dynamic = "force-dynamic";

const ROUTE_ERRORS: Record<string, [string, number]> = {
  league_not_found: ["Town not found.", 404],
  not_admin: ["Only the town admin can edit the city.", 403],
  rate_limit: ["Too many edits. Wait a few minutes.", 429],
  ring_not_empty: ["Clear the edge of the city before shrinking it.", 409],
  invalid_props: ["Those settings aren't valid.", 400],
  too_full: ["The city is too full to shrink.", 409],
  city_full: ["The city is full.", 409],
  payload_too_large: ["Too many edits in one save.", 413],
};

// POST { ops }: apply a batch of city edits (admin only). Returns { version, h }.
// Object props are validated here with the per-type zod schemas (only the
// service role can call the SQL function, which checks their size).
// The dev is the building the session's auth user claimed (never the
// user-editable metadata); apply_league_city_ops_admin_by_id resolves the
// league, checks admin and the rate limit, and applies the batch.
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const bad = assertSameOrigin(req);
  if (bad) return bad;

  const [{ slug }, body, authed] = await Promise.all([params, readJson(req), getAuthedDeveloper<{ id: number }>("id, github_login")]);
  if (!authed) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!Array.isArray(body.ops) || body.ops.length > 200) return NextResponse.json({ error: "Missing ops.", code: "invalid_op" }, { status: 400 });

  const ops = await validProps(slug, body.ops as CityOp[]);
  if (!ops.ok) return NextResponse.json({ error: ops.message, code: "invalid_props" }, { status: 400 });

  const { data, error } = await getSupabaseAdmin().rpc("apply_league_city_ops_admin_by_id", {
    p_slug: slug,
    p_dev_id: authed.dev.id,
    p_ops: ops.ops,
  });
  if (error) {
    const known = ROUTE_ERRORS[error.message];
    if (known) return NextResponse.json({ error: known[0], code: error.message }, { status: known[1] });
    const err = new CityOpError(error.message);
    if (err.code === "city_failed") console.error("[league-city:ops]", error);
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
  }
  const res = data as { version: number; h: number };
  // Expire the page's cached city after answering, so the save isn't slower.
  after(async () => {
    const league = await getLeagueBySlug(slug);
    if (league) invalidateLeague(league.id);
  });
  return NextResponse.json({ version: res.version, h: res.h });
}

/** Cleans every op's props; set_props on an existing object reads its type from the city. */
async function validProps(slug: string, ops: CityOp[]) {
  if (ops.some((o) => !o || typeof o !== "object")) return { ok: false as const, message: "That change isn't valid." };
  const ids = ops.flatMap((o) => (o.op === "set_props" && typeof o.id === "string" ? [o.id] : []));
  const types = new Map<string, ItemType>();
  if (ids.length > 0) {
    const league = await getLeagueBySlug(slug);
    if (league) {
      const { data } = await getSupabaseAdmin()
        .from("league_objects")
        .select("id, item_type")
        .eq("league_id", league.id)
        .in("id", ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id)))
        .returns<{ id: string; item_type: ItemType | null }[]>();
      for (const r of data ?? []) if (r.item_type) types.set(r.id, r.item_type);
    }
  }
  return cleanOpsProps(ops, (id) => types.get(id));
}
