import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getGithubLoginFromUser, isAdminGithubLogin } from "@/lib/admin";
import { isValidUrl } from "@/lib/jobs/validation";

async function requireAdmin() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminGithubLogin(getGithubLoginFromUser(user))) {
    return null;
  }
  return user;
}

export async function PATCH(
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

  const admin = getSupabaseAdmin();
  const updates: Record<string, unknown> = {};

  if (body.name !== undefined) {
    if (typeof body.name !== "string" || body.name.trim().length === 0) {
      return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    }
    updates.name = (body.name as string).trim();
  }

  if (body.slug !== undefined) {
    if (typeof body.slug !== "string" || !/^[a-z0-9-]+$/.test(body.slug)) {
      return NextResponse.json({ error: "Slug must be lowercase letters, numbers, and hyphens only" }, { status: 400 });
    }
    // Check uniqueness (exclude current company)
    const { data: existing } = await admin
      .from("job_company_profiles")
      .select("id")
      .eq("slug", body.slug)
      .neq("id", id)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ error: "Slug already taken" }, { status: 409 });
    }
    updates.slug = body.slug;
  }

  if (body.website !== undefined) {
    if (typeof body.website !== "string" || !isValidUrl(body.website)) {
      return NextResponse.json({ error: "Website must be a valid URL" }, { status: 400 });
    }
    updates.website = body.website;
  }

  if (body.description !== undefined) updates.description = body.description || null;
  if (body.logo_url !== undefined) updates.logo_url = body.logo_url || null;
  if (body.github_org !== undefined) updates.github_org = body.github_org || null;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data: company, error } = await admin
    .from("job_company_profiles")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("Failed to update company:", error);
    return NextResponse.json({ error: "Failed to update company" }, { status: 500 });
  }

  return NextResponse.json({ company });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const admin = getSupabaseAdmin();

  // Check for active/pending/paused listings
  const { data: activeListings } = await admin
    .from("job_listings")
    .select("id")
    .eq("company_id", id)
    .in("status", ["active", "pending_review", "paused"]);

  if (activeListings && activeListings.length > 0) {
    return NextResponse.json(
      { error: `Company has ${activeListings.length} active listing(s). Pause or delete them first.` },
      { status: 400 },
    );
  }

  const { error } = await admin
    .from("job_company_profiles")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Failed to delete company:", error);
    return NextResponse.json({ error: "Failed to delete company" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
