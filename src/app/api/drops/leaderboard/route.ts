import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period") ?? "weekly";

  const sb = getSupabaseAdmin();

  // Build date filter for weekly
  let sinceDate: string | null = null;
  if (period === "weekly") {
    const now = new Date();
    const day = now.getUTCDay();
    const monday = new Date(now);
    monday.setUTCDate(now.getUTCDate() - (day === 0 ? 6 : day - 1));
    monday.setUTCHours(0, 0, 0, 0);
    sinceDate = monday.toISOString();
  }

  // Get all pulls (filtered by period)
  let query = sb
    .from("drop_pulls")
    .select("developer_id, points_earned");

  if (sinceDate) {
    query = query.gte("pulled_at", sinceDate);
  }

  const { data: pulls, error } = await query;

  if (error) {
    return NextResponse.json({ error: "Failed to fetch leaderboard" }, { status: 500 });
  }

  // Aggregate by developer
  const scores: Record<number, number> = {};
  for (const pull of pulls ?? []) {
    scores[pull.developer_id] = (scores[pull.developer_id] ?? 0) + pull.points_earned;
  }

  // Sort and take top 20
  const sorted = Object.entries(scores)
    .map(([id, points]) => ({ developer_id: Number(id), points }))
    .sort((a, b) => b.points - a.points);

  const top20 = sorted.slice(0, 20);

  // Fetch developer info for top 20
  const topDevIds = top20.map((e) => e.developer_id);
  const { data: devs } = topDevIds.length > 0
    ? await sb.from("developers").select("id, github_login, avatar_url, name").in("id", topDevIds)
    : { data: [] };

  const devMap: Record<number, { login: string; avatar_url: string | null; name: string | null }> = {};
  for (const d of devs ?? []) {
    devMap[d.id] = { login: d.github_login, avatar_url: d.avatar_url, name: d.name };
  }

  const leaderboard = top20.map((e, i) => ({
    rank: i + 1,
    developer_id: e.developer_id,
    login: devMap[e.developer_id]?.login ?? "unknown",
    avatar_url: devMap[e.developer_id]?.avatar_url ?? null,
    name: devMap[e.developer_id]?.name ?? null,
    points: e.points,
  }));

  // Check for logged-in user's rank
  let my_rank: { rank: number; points: number } | null = null;
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const githubLogin = (
        user.user_metadata.user_name ??
        user.user_metadata.preferred_username ??
        ""
      ).toLowerCase();
      if (githubLogin) {
        const { data: myDev } = await sb
          .from("developers")
          .select("id")
          .eq("github_login", githubLogin)
          .single();
        if (myDev && scores[myDev.id]) {
          const myPoints = scores[myDev.id];
          const myRank = sorted.findIndex((e) => e.developer_id === myDev.id) + 1;
          my_rank = { rank: myRank, points: myPoints };
        }
      }
    }
  } catch {
    // Not logged in, skip
  }

  // Active drops summary (count + districts, no building IDs)
  const { data: activeDrops } = await sb
    .from("building_drops")
    .select("building_id, developers!inner(district)")
    .gt("expires_at", new Date().toISOString());

  const activeCount = (activeDrops ?? []).filter((d: Record<string, unknown>) => true).length;
  const activeDistricts = [...new Set(
    (activeDrops ?? []).map((d: Record<string, unknown>) => {
      const dev = d.developers as Record<string, unknown> | null;
      return dev?.district as string | undefined;
    }).filter(Boolean)
  )];

  return NextResponse.json(
    { leaderboard, period, my_rank, active: { count: activeCount, districts: activeDistricts } },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } },
  );
}
