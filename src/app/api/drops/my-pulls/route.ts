import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { CLAIMED_DEVELOPER_LIMIT, pickClaimedDeveloper } from "@/lib/auth-identity";

export async function GET() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ pulls: {} });
  }

  const admin = getSupabaseAdmin();

  const { data: devRows } = await admin
    .from("developers")
    .select("id, github_login")
    .eq("claimed_by", user.id)
    .order("claimed_at", { ascending: true })
    .limit(CLAIMED_DEVELOPER_LIMIT);
  const dev = pickClaimedDeveloper(devRows, user);

  if (!dev) {
    return NextResponse.json({ pulls: {} });
  }

  const { data: rows } = await admin
    .from("drop_pulls")
    .select("drop_id, points_earned, building_drops!inner(pull_count, max_pulls, expires_at)")
    .eq("developer_id", dev.id)
    .gt("building_drops.expires_at", new Date().toISOString());

  const pulls: Record<string, { points: number; pull_count: number; max_pulls: number }> = {};
  for (const row of rows ?? []) {
    const bd = row.building_drops as unknown as { pull_count: number; max_pulls: number };
    pulls[row.drop_id] = {
      points: row.points_earned,
      pull_count: bd.pull_count,
      max_pulls: bd.max_pulls,
    };
  }

  return NextResponse.json({ pulls }, {
    headers: { "Cache-Control": "no-store" },
  });
}
