import { getSupabaseAdmin } from "@/lib/supabase";

async function grantXpAndAchievement(developerId: number, source: string, amount: number, achievementId: string) {
  const sb = getSupabaseAdmin();

  // Grant XP
  await sb.rpc("grant_xp", {
    p_developer_id: developerId,
    p_source: source,
    p_amount: amount,
  });

  // Grant emblem (unified honors). Idempotent; same claim_key the 112 backfill
  // used, so a pre-launch holder dedups. xp_reward comes from the catalog.
  await sb.rpc("grant_emblem", {
    p_developer_id: developerId,
    p_emblem_id: achievementId,
    p_claim_key: `threshold:${achievementId}:${developerId}`,
    p_meta: {},
    p_source: "job",
  });
}

export async function awardCareerProfileXP(developerId: number) {
  // Check if already has career profile emblem (guards the one-time XP grant)
  const sb = getSupabaseAdmin();
  const { data } = await sb
    .from("emblem_grants")
    .select("emblem_id")
    .eq("developer_id", developerId)
    .eq("emblem_id", "career_ready")
    .maybeSingle();

  if (!data) {
    await grantXpAndAchievement(developerId, "career_profile", 500, "career_ready");
  }
}

export async function awardFirstApplicationXP(developerId: number) {
  const sb = getSupabaseAdmin();
  const { data } = await sb
    .from("emblem_grants")
    .select("emblem_id")
    .eq("developer_id", developerId)
    .eq("emblem_id", "job_hunter")
    .maybeSingle();

  if (!data) {
    await grantXpAndAchievement(developerId, "job_apply", 200, "job_hunter");
  }
}

export async function awardReferralXP(developerId: number) {
  const sb = getSupabaseAdmin();
  const { data } = await sb
    .from("emblem_grants")
    .select("emblem_id")
    .eq("developer_id", developerId)
    .eq("emblem_id", "city_recruiter")
    .maybeSingle();

  if (!data) {
    await grantXpAndAchievement(developerId, "referral", 1000, "city_recruiter");
  }
}
