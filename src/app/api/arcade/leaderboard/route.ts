import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// GET /api/arcade/leaderboard?game=10s_classic&limit=10
export async function GET(req: NextRequest) {
  const game = req.nextUrl.searchParams.get("game") ?? "10s_classic";
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "10", 10), 50);

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("arcade_scores")
    .select("user_id, best_ms, attempts, updated_at")
    .eq("game", game)
    .order("best_ms", { ascending: true })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fetch logins for the user_ids
  const userIds = (data ?? []).map((r) => r.user_id);
  let loginMap: Record<string, string> = {};

  if (userIds.length > 0) {
    const { data: devs } = await sb
      .from("developers")
      .select("user_id, login")
      .in("user_id", userIds);

    if (devs) {
      loginMap = Object.fromEntries(devs.map((d) => [d.user_id, d.login]));
    }
  }

  const leaderboard = (data ?? []).map((row, i) => ({
    rank: i + 1,
    login: loginMap[row.user_id] ?? "anonymous",
    best_ms: row.best_ms,
    attempts: row.attempts,
  }));

  return NextResponse.json({ leaderboard }, {
    headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
  });
}
