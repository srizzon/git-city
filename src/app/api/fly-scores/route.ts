import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { rateLimit } from "@/lib/rate-limit";
import { trackDailyMission } from "@/lib/dailies";

function getTodaySeed() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  const dayOfYear = Math.floor(diff / 86400000);
  return `${now.getFullYear()}-${dayOfYear}`;
}

// Max possible score for a given number of collected items, based on game mechanics:
// - 2 epics (25pts), 8 rares (5pts), 30 commons (1pt) — all at max combo (3x)
// - Time bonus: up to 50% of collection score
function maxScoreForCollected(collected: number): number {
  if (collected <= 0) return 0;
  const epics = Math.min(collected, 2);
  const rares = Math.min(Math.max(collected - 2, 0), 8);
  const commons = Math.max(collected - 10, 0);
  const bestComboScore = epics * 75 + rares * 15 + commons * 3;
  // +50% time bonus, +10% buffer for floating-point edge cases
  return Math.ceil(bestComboScore * 1.5 * 1.1);
}

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { ok } = rateLimit(`fly-score:${user.id}`, 1, 15_000);
  if (!ok) {
    return NextResponse.json({ error: "Too fast" }, { status: 429 });
  }

  const body = await request.json();
  const { score, collected, max_combo, flight_ms } = body;

  // Anti-cheat validations
  if (typeof score !== "number" || score < 0 || score > 430) {
    return NextResponse.json({ error: "Invalid score" }, { status: 400 });
  }
  if (typeof collected !== "number" || collected < 0 || collected > 40) {
    return NextResponse.json({ error: "Invalid collected" }, { status: 400 });
  }
  if (typeof max_combo !== "number" || max_combo < 1 || max_combo > 3) {
    return NextResponse.json({ error: "Invalid combo" }, { status: 400 });
  }
  if (typeof flight_ms !== "number" || flight_ms < 10_000) {
    return NextResponse.json({ error: "Invalid flight time" }, { status: 400 });
  }

  // Cross-validation: score must be achievable with the claimed collected count
  const ceiling = maxScoreForCollected(collected);
  if (score > ceiling) {
    return NextResponse.json({ error: "Invalid score" }, { status: 400 });
  }

  // Cross-validation: collecting items takes time — at least 500ms per item
  if (collected > 0 && flight_ms < collected * 500) {
    return NextResponse.json({ error: "Invalid flight time" }, { status: 400 });
  }

  // No score without collecting anything
  if (collected === 0 && score > 0) {
    return NextResponse.json({ error: "Invalid score" }, { status: 400 });
  }

  const githubLogin = (
    user.user_metadata.user_name ??
    user.user_metadata.preferred_username ??
    ""
  ).toLowerCase();

  const admin = getSupabaseAdmin();

  const { data: dev } = await admin
    .from("developers")
    .select("id")
    .eq("github_login", githubLogin)
    .single();

  if (!dev) {
    return NextResponse.json({ error: "Developer not found" }, { status: 404 });
  }

  const seed = getTodaySeed();

  const { data: row, error: insertError } = await admin
    .from("fly_scores")
    .insert({
      developer_id: dev.id,
      score,
      collected,
      max_combo,
      flight_ms,
      seed,
    })
    .select("id")
    .single();

  if (insertError) {
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }

  // Track daily missions for fly scores
  trackDailyMission(dev.id, "fly_score_50", { score });
  trackDailyMission(dev.id, "fly_score_150", { score });

  // Compute rank: count distinct developers who beat this score
  // "Beat" = higher score, OR same score with faster time
  const { data: higherDevs } = await admin
    .from("fly_scores")
    .select("developer_id")
    .eq("seed", seed)
    .gt("score", score);

  const { data: tiedFasterDevs } = await admin
    .from("fly_scores")
    .select("developer_id")
    .eq("seed", seed)
    .eq("score", score)
    .lt("flight_ms", flight_ms);

  const uniqueHigher = new Set([
    ...(higherDevs ?? []).map((r: any) => r.developer_id),
    ...(tiedFasterDevs ?? []).map((r: any) => r.developer_id),
  ]);
  uniqueHigher.delete(dev.id); // don't count own previous scores
  const rank_today = uniqueHigher.size + 1;

  // Total unique pilots for this seed (for post-flight results)
  const { data: allDevs } = await admin.from("fly_scores").select("developer_id").eq("seed", seed);
  const total = new Set((allDevs ?? []).map((r: any) => r.developer_id)).size;

  return NextResponse.json({ id: row.id, score, rank_today, total });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const seed = searchParams.get("seed") || getTodaySeed();

  const admin = getSupabaseAdmin();

  // Fetch top 200 rows + all developer_ids for unique pilot count (in parallel)
  const [{ data, error }, { data: devIds }] = await Promise.all([
    admin
      .from("fly_scores")
      .select("score, collected, max_combo, flight_ms, created_at, developer_id, developers!inner(github_login, avatar_url)")
      .eq("seed", seed)
      .order("score", { ascending: false })
      .order("flight_ms", { ascending: true })
      .limit(200),
    admin
      .from("fly_scores")
      .select("developer_id")
      .eq("seed", seed),
  ]);

  if (error) {
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }

  // Keep only best score per developer (data is sorted by score desc,
  // so first occurrence of each developer_id is their best)
  const seen = new Set<number>();
  const unique = (data ?? []).filter((row: any) => {
    if (seen.has(row.developer_id)) return false;
    seen.add(row.developer_id);
    return true;
  });

  const leaderboard = unique.slice(0, 20).map((row: any) => ({
    score: row.score,
    collected: row.collected,
    max_combo: row.max_combo,
    flight_ms: row.flight_ms,
    created_at: row.created_at,
    github_login: row.developers?.github_login,
    avatar_url: row.developers?.avatar_url,
  }));

  // Total = unique pilots for this seed (for percentile calculation)
  const total = new Set((devIds ?? []).map((r: any) => r.developer_id)).size;

  return NextResponse.json(
    { seed, leaderboard, total },
    { headers: { "Cache-Control": "public, s-maxage=60" } },
  );
}
