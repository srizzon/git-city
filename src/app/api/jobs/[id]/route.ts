import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getGithubLoginFromUser, isAdminGithubLogin } from "@/lib/admin";
import { getAdvertiserFromCookies } from "@/lib/advertiser-auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();

  // First try active listing (normal case)
  let { data: listing } = await admin
    .from("job_listings")
    .select("*, company:job_company_profiles(*)")
    .eq("id", id)
    .eq("status", "active")
    .single();

  // If not active, allow preview for admins and listing owners
  if (!listing) {
    const { data: anyListing } = await admin
      .from("job_listings")
      .select("*, company:job_company_profiles(*)")
      .eq("id", id)
      .single();

    if (!anyListing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    // Check if admin
    const isAdmin = isAdminGithubLogin(getGithubLoginFromUser(user));

    // Check if listing owner (advertiser)
    let isOwner = false;
    const advertiser = await getAdvertiserFromCookies();
    if (advertiser) {
      const comp = anyListing.company as { advertiser_id?: string } | null;
      isOwner = comp?.advertiser_id === advertiser.id;
    }

    if (!isAdmin && !isOwner) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    listing = anyListing;
  }

  // Get developer ID for checking application status
  const { data: dev } = await admin
    .from("developers")
    .select("id")
    .eq("claimed_by", user.id)
    .maybeSingle();

  let hasApplied = false;
  let hasCareerProfile = false;

  if (dev) {
    const [appResult, profileResult] = await Promise.all([
      admin
        .from("job_applications")
        .select("id")
        .eq("listing_id", id)
        .eq("developer_id", dev.id)
        .maybeSingle(),
      admin
        .from("career_profiles")
        .select("id")
        .eq("id", dev.id)
        .maybeSingle(),
    ]);

    hasApplied = !!appResult.data;
    hasCareerProfile = !!profileResult.data;
  }

  // Only track views for active listings
  if (listing.status === "active") {
    await Promise.all([
      admin.from("job_listing_events").insert({
        listing_id: id,
        event_type: "view",
        developer_id: dev?.id ?? null,
      }),
      admin.rpc("increment_job_counter", {
        p_listing_id: id,
        p_column: "view_count",
      }),
    ]);
  }

  return NextResponse.json({
    listing,
    hasApplied,
    hasCareerProfile,
    isPreview: listing.status !== "active",
  });
}
