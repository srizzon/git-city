import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";

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

  const { data: dev } = await admin
    .from("developers")
    .select("id, github_login")
    .eq("claimed_by", user.id)
    .maybeSingle();

  if (!dev) {
    return NextResponse.json({ error: "No developer profile" }, { status: 400 });
  }

  // Get the listing with company info for notification
  const { data: listing } = await admin
    .from("job_listings")
    .select("id, apply_url, title, company_id, company:job_company_profiles!inner(advertiser_id)")
    .eq("id", id)
    .eq("status", "active")
    .single();

  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  // Check if dev has career profile
  const { data: profile } = await admin
    .from("career_profiles")
    .select("id")
    .eq("id", dev.id)
    .maybeSingle();

  // Upsert application (returns data so we can check if it was an insert)
  const { data: appResult } = await admin
    .from("job_applications")
    .upsert(
      {
        listing_id: id,
        developer_id: dev.id,
        has_profile: !!profile,
      },
      { onConflict: "listing_id,developer_id" },
    )
    .select("created_at")
    .single();

  // Track event + atomic counter increment
  await Promise.all([
    admin.from("job_listing_events").insert({
      listing_id: id,
      event_type: "apply_click",
      developer_id: dev.id,
    }),
    admin.rpc("increment_job_counter", {
      p_listing_id: id,
      p_column: "apply_count",
    }),
  ]);

  // Queue email notification for company (batched by cron every 15 min)
  const isNewApplication = appResult?.created_at &&
    Date.now() - new Date(appResult.created_at).getTime() < 5000;

  if (isNewApplication) {
    admin
      .from("job_application_email_queue")
      .insert({
        listing_id: id,
        developer_login: dev.github_login,
        has_profile: !!profile,
      })
      .then(({ error: qErr }) => {
        if (qErr) console.error("[job-notify] Failed to queue application email:", qErr);
      });
  }

  // Check if first-ever application for XP + achievement
  if (isNewApplication) {
    const { count } = await admin
      .from("job_applications")
      .select("*", { count: "exact", head: true })
      .eq("developer_id", dev.id);

    if (count === 1) {
      // First application — award XP + achievement
      await Promise.all([
        admin.rpc("grant_xp", {
          p_developer_id: dev.id,
          p_source: "job_apply",
          p_amount: 200,
        }),
        admin
          .from("developer_achievements")
          .upsert(
            {
              developer_id: dev.id,
              achievement_id: "job_hunter",
              name: "Job Hunter",
              tier: "bronze",
            },
            { onConflict: "developer_id,achievement_id" },
          ),
      ]);
    }
  }

  // Build apply URL with UTMs — preserve existing params, don't overwrite
  let applyUrlStr = listing.apply_url;
  try {
    const applyUrl = new URL(listing.apply_url);
    if (!applyUrl.searchParams.has("utm_source")) applyUrl.searchParams.set("utm_source", "gitcity");
    if (!applyUrl.searchParams.has("utm_medium")) applyUrl.searchParams.set("utm_medium", "jobs");
    if (!applyUrl.searchParams.has("ref")) applyUrl.searchParams.set("ref", "gitcity");
    applyUrlStr = applyUrl.toString();
  } catch {
    // If URL parsing fails, use the raw URL
  }

  return NextResponse.json({ apply_url: applyUrlStr });
}
