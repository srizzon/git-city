import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { CLAIMED_DEVELOPER_LIMIT, pickClaimedDeveloper } from "@/lib/auth-identity";

/**
 * Records an external click (user visiting the external job site).
 * Does NOT create a job_application, send emails, or grant XP.
 */
export async function POST(
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

  const { data: devRows } = await admin
    .from("developers")
    .select("id, github_login")
    .eq("claimed_by", user.id)
    .order("claimed_at", { ascending: true })
    .limit(CLAIMED_DEVELOPER_LIMIT);
  const dev = pickClaimedDeveloper(devRows, user);

  if (!dev) {
    return NextResponse.json({ error: "No developer profile" }, { status: 400 });
  }

  const { data: listing } = await admin
    .from("job_listings")
    .select("id, apply_url")
    .eq("id", id)
    .eq("status", "active")
    .single();

  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  if (!listing.apply_url) {
    return NextResponse.json({ error: "This listing accepts native applications" }, { status: 400 });
  }

  // Track event + increment counter
  await Promise.all([
    admin.from("job_listing_events").insert({
      listing_id: id,
      event_type: "external_click",
      developer_id: dev.id,
    }),
    admin.rpc("increment_job_counter", {
      p_listing_id: id,
      p_column: "click_count",
    }),
  ]);

  // Build URL with UTMs
  let clickUrl = listing.apply_url;
  try {
    const url = new URL(listing.apply_url);
    if (!url.searchParams.has("utm_source")) url.searchParams.set("utm_source", "gitcity");
    if (!url.searchParams.has("utm_medium")) url.searchParams.set("utm_medium", "jobs");
    if (!url.searchParams.has("ref")) url.searchParams.set("ref", "gitcity");
    clickUrl = url.toString();
  } catch {
    // Use raw URL if parsing fails
  }

  return NextResponse.json({ click_url: clickUrl });
}
