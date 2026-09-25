import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getLeagueBySlug, getViewer } from "@/lib/leagues/service";
import { assertSameOrigin, readJson } from "@/lib/leagues/http";
import { invalidateLeague } from "@/lib/leagues/cache";
import { ensureCity } from "@/lib/league-city/service";
import { SIGN_SIDES, SKY_LABELS } from "@/lib/league-city/identity";
import type { SignSide } from "@/lib/league-city/types";

export const dynamic = "force-dynamic";

// PATCH { sky?, sign_side? }: the town's sky theme and hill sign side (admin).
// sign_side null takes the hill sign down. A trigger bumps identity_version.
export async function PATCH(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const bad = assertSameOrigin(req);
  if (bad) return bad;
  const [{ slug }, body, viewer] = await Promise.all([params, readJson(req), getViewer()]);
  if (!viewer) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const league = await getLeagueBySlug(slug);
  if (!league) return NextResponse.json({ error: "Town not found." }, { status: 404 });
  if (league.admin_id !== viewer.id) return NextResponse.json({ error: "Only the town admin can change this." }, { status: 403 });

  const update: { sky?: number; sign_side?: SignSide | null } = {};
  if ("sky" in body) {
    if (typeof body.sky !== "number" || !Number.isInteger(body.sky) || body.sky < 0 || body.sky >= SKY_LABELS.length) {
      return NextResponse.json({ error: "Pick one of the skies." }, { status: 400 });
    }
    update.sky = body.sky;
  }
  if ("sign_side" in body) {
    if (body.sign_side !== null && !SIGN_SIDES.includes(body.sign_side as SignSide)) {
      return NextResponse.json({ error: "Pick north, east or west." }, { status: 400 });
    }
    update.sign_side = body.sign_side as SignSide | null;
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });

  await ensureCity(league.id);
  const { error } = await getSupabaseAdmin().from("league_cities").update(update).eq("league_id", league.id);
  if (error) {
    console.error("[league-identity]", error);
    return NextResponse.json({ error: "Couldn't save." }, { status: 500 });
  }
  invalidateLeague(league.id);
  return NextResponse.json({ ok: true });
}
