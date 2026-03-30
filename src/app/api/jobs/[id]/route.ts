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

  const admin = getSupabaseAdmin();

  // Auth is optional — unauthenticated users can view active listings
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  // Get developer ID if authenticated
  let dev: { id: number } | null = null;
  if (user) {
    const { data } = await admin
      .from("developers")
      .select("id")
      .eq("claimed_by", user.id)
      .maybeSingle();
    dev = data;
  }

  // First try active listing (normal case)
  let { data: listing } = await admin
    .from("job_listings")
    .select("*, company:job_company_profiles(*)")
    .eq("id", id)
    .eq("status", "active")
    .single();

  let closedReason: "filled" | "expired" | "paused" | null = null;

  // If not active, check if the user has other access (must be authenticated)
  if (!listing) {
    const { data: anyListing } = await admin
      .from("job_listings")
      .select("*, company:job_company_profiles(*)")
      .eq("id", id)
      .single();

    if (!anyListing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    // Non-active listings require authentication + special access
    if (!user) {
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

    // Check if developer applied to this listing (filled/expired/paused only)
    let isApplicant = false;
    const closedStatuses = ["filled", "expired", "paused"];
    if (dev && closedStatuses.includes(anyListing.status)) {
      const { data: application } = await admin
        .from("job_applications")
        .select("id")
        .eq("listing_id", id)
        .eq("developer_id", dev.id)
        .maybeSingle();
      isApplicant = !!application;
    }

    if (!isAdmin && !isOwner && !isApplicant) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    if (isApplicant && closedStatuses.includes(anyListing.status)) {
      closedReason = anyListing.status as "filled" | "expired" | "paused";
    }

    listing = anyListing;
  }

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

  // Only track views for active listings from authenticated users
  if (listing.status === "active" && dev) {
    await Promise.all([
      admin.from("job_listing_events").insert({
        listing_id: id,
        event_type: "view",
        developer_id: dev.id,
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
    isAuthenticated: !!user,
    isPreview: listing.status !== "active",
    ...(closedReason && { closedReason }),
  });
}
