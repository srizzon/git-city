import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getGithubLoginFromUser, isAdminGithubLogin } from "@/lib/admin";
import { validateListingFields } from "@/lib/jobs/validation";
import { LISTING_DURATION_DAYS, JOB_TIERS } from "@/lib/jobs/constants";

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || !isAdminGithubLogin(getGithubLoginFromUser(user))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  const { data: listings } = await admin
    .from("job_listings")
    .select("*, company:job_company_profiles(*)")
    .order("created_at", { ascending: false });

  return NextResponse.json({ listings: listings ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || !isAdminGithubLogin(getGithubLoginFromUser(user))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { company_id, status: targetStatus, tier } = body;

  if (!company_id || typeof company_id !== "string") {
    return NextResponse.json({ error: "company_id is required" }, { status: 400 });
  }

  // Validate tier
  const validTier = tier && typeof tier === "string" && tier in JOB_TIERS ? tier : "free";

  // Validate listing fields
  const result = validateListingFields(body);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const fields = result.data;
  const admin = getSupabaseAdmin();

  // Verify company exists
  const { data: company } = await admin
    .from("job_company_profiles")
    .select("id")
    .eq("id", company_id)
    .maybeSingle();

  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  // Build insert data
  const publishDirectly = targetStatus === "active";
  const now = new Date().toISOString();
  const expiresAt = publishDirectly
    ? new Date(Date.now() + LISTING_DURATION_DAYS * 86400000).toISOString()
    : null;

  const { data: listing, error } = await admin
    .from("job_listings")
    .insert({
      company_id: company.id,
      ...fields,
      status: publishDirectly ? "active" : "draft",
      tier: validTier,
      published_at: publishDirectly ? now : null,
      expires_at: expiresAt,
    })
    .select()
    .single();

  if (error) {
    console.error("Failed to create listing:", error);
    return NextResponse.json({ error: "Failed to create listing" }, { status: 500 });
  }

  return NextResponse.json({ listing });
}
