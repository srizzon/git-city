import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getGithubLoginFromUser, isAdminGithubLogin } from "@/lib/admin";

async function requireAdmin() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminGithubLogin(getGithubLoginFromUser(user))) {
    return null;
  }
  return user;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { email } = body as { email: string };
  if (!email || typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const normalizedEmail = email.toLowerCase().trim();

  // Check if email is already linked to another company
  const { data: existingAdvertiser } = await admin
    .from("advertiser_accounts")
    .select("id")
    .eq("email", normalizedEmail)
    .maybeSingle();

  let advertiserId: string;

  if (existingAdvertiser) {
    advertiserId = existingAdvertiser.id;

    const { data: linkedCompany } = await admin
      .from("job_company_profiles")
      .select("id")
      .eq("advertiser_id", advertiserId)
      .neq("id", id)
      .maybeSingle();

    if (linkedCompany) {
      return NextResponse.json(
        { error: "Email already linked to another company" },
        { status: 409 },
      );
    }
  } else {
    // Create advertiser account
    const { data: newAdvertiser, error } = await admin
      .from("advertiser_accounts")
      .insert({ email: normalizedEmail })
      .select()
      .single();

    if (error) {
      console.error("Failed to create advertiser:", error);
      return NextResponse.json({ error: "Failed to create advertiser account" }, { status: 500 });
    }
    advertiserId = newAdvertiser.id;
  }

  // Link company to advertiser
  const { data: company, error } = await admin
    .from("job_company_profiles")
    .update({ advertiser_id: advertiserId })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("Failed to link company:", error);
    return NextResponse.json({ error: "Failed to link company" }, { status: 500 });
  }

  return NextResponse.json({ company, advertiser_email: normalizedEmail });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const admin = getSupabaseAdmin();

  const { data: company, error } = await admin
    .from("job_company_profiles")
    .update({ advertiser_id: null })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("Failed to unlink company:", error);
    return NextResponse.json({ error: "Failed to unlink company" }, { status: 500 });
  }

  return NextResponse.json({ company });
}
