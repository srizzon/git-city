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
  const [profileRes, projectsRes, experiencesRes, endorsementsRes, achievementsRes] =
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
        .from("portfolio_endorsements")
        .select(
          "skill_name, context_text, relationship, weight, created_at, endorser:developers!portfolio_endorsements_endorser_id_fkey(github_login, avatar_url, xp_level)"
        )
        .eq("developer_id", dev.id)
        .eq("status", "approved")
        .order("created_at", { ascending: false }),
      admin
        .from("developer_achievements")
        .select(
          "achievement_id, name:achievements(name), tier:achievements(tier)"
        )
        .eq("developer_id", dev.id),
    ]);

  // 3. Aggregate endorsements by skill
  const skillMap = new Map<
    string,
    {
      count: number;
      top: Array<{
        github_login: string;
        avatar_url: string | null;
        context_text: string;
        relationship: string;
        xp_level: number;
      }>;
    }
  >();

  for (const e of endorsementsRes.data ?? []) {
    const existing = skillMap.get(e.skill_name) ?? { count: 0, top: [] };
    existing.count++;
    const endorser = Array.isArray(e.endorser) ? e.endorser[0] : e.endorser;
    if (endorser && existing.top.length < 3) {
      existing.top.push({
        github_login: (endorser as { github_login: string }).github_login,
        avatar_url: (endorser as { avatar_url: string | null }).avatar_url,
        context_text: e.context_text,
        relationship: e.relationship,
        xp_level: (endorser as { xp_level: number }).xp_level,
      });
    }
    skillMap.set(e.skill_name, existing);
  }

  const endorsements = Array.from(skillMap.entries())
    .map(([skill, data]) => ({ skill, ...data }))
    .sort((a, b) => b.count - a.count);

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
    endorsements,
    endorsement_count: endorsementsRes.data?.length ?? 0,
    achievements,
  });
}
