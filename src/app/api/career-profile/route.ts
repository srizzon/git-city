import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { JobSeniority, JobWeb, JobContract } from "@/lib/jobs/types";

const VALID_SENIORITIES: JobSeniority[] = ["junior", "mid", "senior", "staff", "lead"];
const VALID_WEB_TYPES: JobWeb[] = ["web2", "web3", "both"];
const VALID_CONTRACTS: JobContract[] = ["clt", "pj", "contract"];

async function getAuthenticatedDeveloper() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = getSupabaseAdmin();
  const { data: dev } = await admin
    .from("developers")
    .select("id")
    .eq("claimed_by", user.id)
    .maybeSingle();

  if (!dev) return null;
  return { userId: user.id, developerId: dev.id as number };
}

export async function GET() {
  const auth = await getAuthenticatedDeveloper();
  if (!auth) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const { data: profile } = await admin
    .from("career_profiles")
    .select("*")
    .eq("id", auth.developerId)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json({ profile: null });
  }

  return NextResponse.json({ profile });
}

export async function POST(req: NextRequest) {
  const auth = await getAuthenticatedDeveloper();
  if (!auth) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json();

  // Validate required fields
  const { skills, seniority, bio } = body;

  if (!Array.isArray(skills) || skills.length === 0) {
    return NextResponse.json({ error: "At least 1 skill required" }, { status: 400 });
  }
  if (skills.length > 20) {
    return NextResponse.json({ error: "Maximum 20 skills" }, { status: 400 });
  }
  if (!VALID_SENIORITIES.includes(seniority)) {
    return NextResponse.json({ error: "Invalid seniority" }, { status: 400 });
  }
  if (!bio || typeof bio !== "string" || bio.trim().length === 0) {
    return NextResponse.json({ error: "Bio is required" }, { status: 400 });
  }
  if (bio.length > 500) {
    return NextResponse.json({ error: "Bio max 500 characters" }, { status: 400 });
  }

  // Validate optional fields
  const web_type = body.web_type ?? "both";
  if (!VALID_WEB_TYPES.includes(web_type)) {
    return NextResponse.json({ error: "Invalid web_type" }, { status: 400 });
  }

  const contract_type = body.contract_type ?? [];
  if (!Array.isArray(contract_type) || contract_type.some((c: string) => !VALID_CONTRACTS.includes(c as JobContract))) {
    return NextResponse.json({ error: "Invalid contract_type" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  const profileData = {
    id: auth.developerId,
    skills: skills.map((s: string) => s.toLowerCase().trim()),
    seniority,
    bio: bio.trim(),
    web_type,
    contract_type,
    years_experience: body.years_experience ?? null,
    salary_min: body.salary_min ?? null,
    salary_max: body.salary_max ?? null,
    salary_currency: body.salary_currency ?? "USD",
    salary_visible: body.salary_visible ?? false,
    languages: body.languages ?? [],
    timezone: body.timezone ?? null,
    link_portfolio: body.link_portfolio ?? null,
    link_linkedin: body.link_linkedin ?? null,
    link_website: body.link_website ?? null,
    open_to_work: body.open_to_work ?? false,
  };

  // Check if this is a new profile (for XP)
  const { data: existingProfile } = await admin
    .from("career_profiles")
    .select("id")
    .eq("id", auth.developerId)
    .maybeSingle();

  const isFirstCreation = !existingProfile;

  const { data: profile, error } = await admin
    .from("career_profiles")
    .upsert(profileData, { onConflict: "id" })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to save profile" }, { status: 500 });
  }

  // Award XP + achievement on first creation
  if (isFirstCreation) {
    await Promise.all([
      admin.rpc("grant_xp", {
        p_developer_id: auth.developerId,
        p_source: "career_profile",
        p_amount: 500,
      }),
      admin
        .from("developer_achievements")
        .upsert(
          {
            developer_id: auth.developerId,
            achievement_id: "career_ready",
            name: "Career Ready",
            tier: "bronze",
          },
          { onConflict: "developer_id,achievement_id" },
        ),
    ]);
  }

  return NextResponse.json({ profile, isFirstCreation });
}

export async function DELETE() {
  const auth = await getAuthenticatedDeveloper();
  if (!auth) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  await admin
    .from("career_profiles")
    .delete()
    .eq("id", auth.developerId);

  return NextResponse.json({ deleted: true });
}
