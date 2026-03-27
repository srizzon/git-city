import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { ENDORSEMENTS_PER_MONTH } from "@/lib/portfolio/constants";

const VALID_RELATIONSHIPS = ["worked_together", "managed_by", "mentored", "open_source", "other"];

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = getSupabaseAdmin();
  const { data: endorser } = await admin
    .from("developers")
    .select("id, xp_level")
    .eq("claimed_by", user.id)
    .single();
  if (!endorser) return NextResponse.json({ error: "No developer profile" }, { status: 404 });

  const body = await req.json();
  const targetUsername = (body.username ?? "").trim().toLowerCase();
  const skillName = (body.skill_name ?? "").trim().toLowerCase();
  const contextText = (body.context_text ?? "").trim();
  const relationship = body.relationship ?? "worked_together";

  if (!targetUsername) return NextResponse.json({ error: "username required" }, { status: 400 });
  if (!skillName || skillName.length > 50) return NextResponse.json({ error: "skill_name required (max 50 chars)" }, { status: 400 });
  if (!contextText || contextText.length < 10 || contextText.length > 280) {
    return NextResponse.json({ error: "context_text required (10-280 chars)" }, { status: 400 });
  }
  if (!VALID_RELATIONSHIPS.includes(relationship)) {
    return NextResponse.json({ error: "Invalid relationship" }, { status: 400 });
  }

  // Get target developer
  const { data: target } = await admin
    .from("developers")
    .select("id")
    .ilike("github_login", targetUsername)
    .single();
  if (!target) return NextResponse.json({ error: "Developer not found" }, { status: 404 });

  if (target.id === endorser.id) {
    return NextResponse.json({ error: "Cannot endorse yourself" }, { status: 400 });
  }

  // Check monthly limit
  const { data: monthCount } = await admin.rpc("get_endorsements_given_this_month", {
    p_endorser_id: endorser.id,
  });
  if ((monthCount ?? 0) >= ENDORSEMENTS_PER_MONTH) {
    return NextResponse.json(
      { error: `Limit of ${ENDORSEMENTS_PER_MONTH} endorsements per month reached` },
      { status: 429 }
    );
  }

  // Weight based on level
  const level = endorser.xp_level ?? 1;
  const weight = Math.min(3.0, 1.0 + (level - 1) * 0.1);

  const { data: endorsement, error } = await admin
    .from("portfolio_endorsements")
    .upsert(
      {
        developer_id: target.id,
        endorser_id: endorser.id,
        skill_name: skillName,
        context_text: contextText,
        relationship,
        weight,
        status: "approved",
      },
      { onConflict: "developer_id,endorser_id,skill_name" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Failed to create endorsement" }, { status: 500 });

  // Achievement for giving first endorsement
  const { count: totalGiven } = await admin
    .from("portfolio_endorsements")
    .select("*", { count: "exact", head: true })
    .eq("endorser_id", endorser.id);

  if (totalGiven === 1) {
    await admin
      .from("developer_achievements")
      .upsert({ developer_id: endorser.id, achievement_id: "endorser" }, { onConflict: "developer_id,achievement_id" });
  }

  // XP for endorser
  await admin.rpc("grant_xp", { p_developer_id: endorser.id, p_source: "kudos_given", p_amount: 50 });

  // Milestone achievements for receiver
  const { count: totalReceived } = await admin
    .from("portfolio_endorsements")
    .select("*", { count: "exact", head: true })
    .eq("developer_id", target.id)
    .eq("status", "approved");

  if (totalReceived === 10) {
    await admin
      .from("developer_achievements")
      .upsert({ developer_id: target.id, achievement_id: "endorsed_10" }, { onConflict: "developer_id,achievement_id" });
    await admin.rpc("grant_xp", { p_developer_id: target.id, p_source: "achievement", p_amount: 25 });
  } else if (totalReceived === 50) {
    await admin
      .from("developer_achievements")
      .upsert({ developer_id: target.id, achievement_id: "endorsed_50" }, { onConflict: "developer_id,achievement_id" });
    await admin.rpc("grant_xp", { p_developer_id: target.id, p_source: "achievement", p_amount: 50 });
  }

  return NextResponse.json({ endorsement });
}
