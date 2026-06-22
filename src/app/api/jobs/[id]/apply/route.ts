import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendJobApplicationConfirmedNotification } from "@/lib/notification-senders/job-application-confirmed";
import { sendJobProfileNudgeNotification } from "@/lib/notification-senders/job-profile-nudge";

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

  // Get the listing with company info
  const { data: listing } = await admin
    .from("job_listings")
    .select("id, apply_url, title, company_id, company:job_company_profiles!inner(name, advertiser_id)")
    .eq("id", id)
    .eq("status", "active")
    .single();

  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  // Native apply only — listings with external URL must use /click
  if (listing.apply_url) {
    return NextResponse.json({ error: "This listing uses external applications. Use /click instead." }, { status: 400 });
  }

  // Check career profile with required fields for native apply
  const { data: profile } = await admin
    .from("career_profiles")
    .select("id, first_name, last_name, email")
    .eq("id", dev.id)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json({ error: "Career profile required to apply" }, { status: 400 });
  }

  if (!profile.first_name || !profile.last_name || !profile.email) {
    return NextResponse.json({
      error: "Complete your career profile to apply (name and email required)",
      missing_fields: [
        ...(!profile.first_name ? ["first_name"] : []),
        ...(!profile.last_name ? ["last_name"] : []),
        ...(!profile.email ? ["email"] : []),
      ],
    }, { status: 400 });
  }

  // Upsert application
  const { data: appResult } = await admin
    .from("job_applications")
    .upsert(
      {
        listing_id: id,
        developer_id: dev.id,
        has_profile: true,
        type: "native",
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
    // Queue company notification
    admin
      .from("job_application_email_queue")
      .insert({
        listing_id: id,
        developer_login: dev.github_login,
        has_profile: true,
      })
      .then(({ error: qErr }) => {
        if (qErr) console.error("[job-notify] Failed to queue application email:", qErr);
      });

    // Confirm to the developer
    const compName = (listing.company as unknown as { name: string }).name;
    sendJobApplicationConfirmedNotification(
      dev.id,
      dev.github_login,
      listing.title,
      compName,
      id,
      true,
    );
  }

  // Check if first-ever application for XP + achievement
  if (isNewApplication) {
    const { count } = await admin
      .from("job_applications")
      .select("*", { count: "exact", head: true })
      .eq("developer_id", dev.id)
      .eq("type", "native");

    // Nudge to complete profile after 3rd application without full profile
    if (count === 3) {
      sendJobProfileNudgeNotification(dev.id, dev.github_login, count);
    }

    if (count === 1) {
      // First native application - award XP + achievement
      await Promise.all([
        admin.rpc("grant_xp", {
          p_developer_id: dev.id,
          p_source: "job_apply",
          p_amount: 200,
        }),
        // Unified emblem grant (idempotent; same claim_key as the 112 backfill).
        admin.rpc("grant_emblem", {
          p_developer_id: dev.id,
          p_emblem_id: "job_hunter",
          p_claim_key: `threshold:job_hunter:${dev.id}`,
          p_meta: {},
          p_source: "job",
        }),
      ]);
    }
  }

  return NextResponse.json({ applied: true });
}
