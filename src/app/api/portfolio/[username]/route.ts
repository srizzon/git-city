import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;
  const admin = getSupabaseAdmin();

  // 1. Get developer
  const { data: dev } = await admin
    .from("developers")
    .select(
      "id, github_login, name, avatar_url, bio, contributions, contributions_total, public_repos, total_stars, current_streak, longest_streak, active_days_last_year, primary_language, followers, xp_level, xp_total, top_repos, created_at"
    )
    .ilike("github_login", username)
    .single();

  if (!dev) {
    return NextResponse.json({ error: "Developer not found" }, { status: 404 });
  }

  // 2. Parallel fetches
  const [profileRes, projectsRes, experiencesRes, achievementsRes] =
    await Promise.all([
      admin.from("career_profiles").select("*").eq("id", dev.id).maybeSingle(),
      admin
        .from("portfolio_projects")
        .select("*")
        .eq("developer_id", dev.id)
        .order("sort_order")
        .limit(6),
      admin
        .from("portfolio_experiences")
        .select("*")
        .eq("developer_id", dev.id)
        .order("sort_order")
        .limit(5),
      admin
        .from("developer_achievements")
        .select(
          "achievement_id, name:achievements(name), tier:achievements(tier)"
        )
        .eq("developer_id", dev.id),
    ]);

  // 4. Flatten achievements
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const achievements = (achievementsRes.data ?? []).map((a: any) => ({
    achievement_id: a.achievement_id as string,
    name: (Array.isArray(a.name) ? a.name[0]?.name : a.name?.name) ?? a.achievement_id,
    tier: (Array.isArray(a.tier) ? a.tier[0]?.tier : a.tier?.tier) ?? "bronze",
  }));

  const contribs =
    dev.contributions_total && dev.contributions_total > 0
      ? dev.contributions_total
      : (dev.contributions ?? 0);

  return NextResponse.json({
    developer: {
      ...dev,
      contributions: contribs,
      top_repos: Array.isArray(dev.top_repos) ? dev.top_repos : [],
    },
    profile: profileRes.data,
    projects: projectsRes.data ?? [],
    experiences: experiencesRes.data ?? [],
    achievements,
  });
}
