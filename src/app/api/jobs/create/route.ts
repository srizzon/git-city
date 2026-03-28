import { NextRequest, NextResponse } from "next/server";
import { getAdvertiserFromCookies } from "@/lib/advertiser-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { validateListingFields } from "@/lib/jobs/validation";

export async function POST(req: NextRequest) {
  const advertiser = await getAdvertiserFromCookies();
  if (!advertiser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();

  const { data: company } = await admin
    .from("job_company_profiles")
    .select("id")
    .eq("advertiser_id", advertiser.id)
    .maybeSingle();

  if (!company) {
    return NextResponse.json({ error: "Create a company profile first" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = validateListingFields(body);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const fields = result.data;

  // Check for existing draft (prevent duplicates on retry)
  const { data: existingDraft } = await admin
    .from("job_listings")
    .select("id")
    .eq("company_id", company.id)
    .eq("status", "draft")
    .eq("title", fields.title)
    .maybeSingle();

  if (existingDraft) {
    const { data: listing, error } = await admin
      .from("job_listings")
      .update(fields)
      .eq("id", existingDraft.id)
      .select()
      .single();

    if (error) {
      console.error("Failed to update draft:", error);
      return NextResponse.json({ error: "Failed to update listing" }, { status: 500 });
    }
    return NextResponse.json({ listing });
  }

  const { data: listing, error } = await admin
    .from("job_listings")
    .insert({
      company_id: company.id,
      ...fields,
      status: "draft",
      tier: "standard",
    })
    .select()
    .single();

  if (error) {
    console.error("Failed to create listing:", error);
    return NextResponse.json({ error: "Failed to create listing" }, { status: 500 });
  }

  return NextResponse.json({ listing });
}
