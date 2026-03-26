import { NextRequest, NextResponse } from "next/server";
import { getAdvertiserFromCookies } from "@/lib/advertiser-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { FREE_EMAIL_DOMAINS } from "@/lib/jobs/constants";

export async function GET() {
  const advertiser = await getAdvertiserFromCookies();
  if (!advertiser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const { data: company } = await admin
    .from("job_company_profiles")
    .select("*")
    .eq("advertiser_id", advertiser.id)
    .maybeSingle();

  return NextResponse.json({ company });
}

export async function POST(req: NextRequest) {
  const advertiser = await getAdvertiserFromCookies();
  if (!advertiser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json();
  const { name, website, slug, description, github_org, logo_url } = body;

  if (!name || !website || !slug) {
    return NextResponse.json({ error: "Name, website, and slug are required" }, { status: 400 });
  }

  // Validate corporate email
  const emailDomain = advertiser.email.split("@")[1]?.toLowerCase();
  if (emailDomain && FREE_EMAIL_DOMAINS.includes(emailDomain)) {
    return NextResponse.json(
      { error: "Please use a corporate email to create a company profile. Free email providers (Gmail, etc.) are not allowed." },
      { status: 400 },
    );
  }

  if (!/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.json({ error: "Slug must be lowercase letters, numbers, and hyphens" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  // Check slug uniqueness
  const { data: slugTaken } = await admin
    .from("job_company_profiles")
    .select("id")
    .eq("slug", slug)
    .neq("advertiser_id", advertiser.id)
    .maybeSingle();

  if (slugTaken) {
    return NextResponse.json({ error: "Slug already taken" }, { status: 409 });
  }

  // Check if company profile already exists for this advertiser
  const { data: existing } = await admin
    .from("job_company_profiles")
    .select("id")
    .eq("advertiser_id", advertiser.id)
    .maybeSingle();

  if (existing) {
    // Update existing
    const { data: company, error } = await admin
      .from("job_company_profiles")
      .update({
        name,
        slug,
        website,
        description: description || null,
        github_org: github_org || null,
        logo_url: logo_url || null,
      })
      .eq("id", existing.id)
      .select()
      .single();

    if (error) {
      console.error("Failed to update company profile:", error);
      return NextResponse.json({ error: "Failed to save company profile" }, { status: 500 });
    }

    return NextResponse.json({ company });
  }

  // Create new
  const { data: company, error } = await admin
    .from("job_company_profiles")
    .insert({
      advertiser_id: advertiser.id,
      name,
      slug,
      website,
      description: description || null,
      github_org: github_org || null,
      logo_url: logo_url || null,
    })
    .select()
    .single();

  if (error) {
    console.error("Failed to create company profile:", error);
    return NextResponse.json({ error: "Failed to save company profile" }, { status: 500 });
  }

  return NextResponse.json({ company });
}
