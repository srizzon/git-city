import { getSupabaseAdmin } from "@/lib/supabase";

async function grantXpAndAchievement(developerId: number, source: string, amount: number, achievementId: string) {
  const sb = getSupabaseAdmin();

  // Grant XP
  await sb.rpc("grant_xp", {
    p_developer_id: developerId,
    p_source: source,
    p_amount: amount,
  });

  // Grant achievement (ignore if already exists)
  await sb
    .from("developer_achievements")
    .upsert(
      { developer_id: developerId, achievement_id: achievementId },
      { onConflict: "developer_id,achievement_id" },
    );
}

export async function awardCareerProfileXP(developerId: number) {
  // Check if already has career profile achievement
  const sb = getSupabaseAdmin();
  const { data } = await sb
    .from("developer_achievements")
    .select("achievement_id")
    .eq("developer_id", developerId)
    .eq("achievement_id", "career_ready")
    .maybeSingle();

  if (!data) {
    await grantXpAndAchievement(developerId, "career_profile", 500, "career_ready");
  }
}

export async function awardFirstApplicationXP(developerId: number) {
  const sb = getSupabaseAdmin();
  const { data } = await sb
    .from("developer_achievements")
    .select("achievement_id")
    .eq("developer_id", developerId)
    .eq("achievement_id", "job_hunter")
    .maybeSingle();

  if (!data) {
    await grantXpAndAchievement(developerId, "job_apply", 200, "job_hunter");
  }
}

export async function awardReferralXP(developerId: number) {
  const sb = getSupabaseAdmin();
  const { data } = await sb
    .from("developer_achievements")
    .select("achievement_id")
    .eq("developer_id", developerId)
    .eq("achievement_id", "city_recruiter")
    .maybeSingle();

  if (!data) {
    await grantXpAndAchievement(developerId, "referral", 1000, "city_recruiter");
  }
}
