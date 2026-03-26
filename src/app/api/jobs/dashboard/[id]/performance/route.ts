import { NextRequest, NextResponse } from "next/server";
import { getAdvertiserFromCookies } from "@/lib/advertiser-auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const advertiser = await getAdvertiserFromCookies();
  if (!advertiser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();

  // Verify ownership
  const { data: listing } = await admin
    .from("job_listings")
    .select("id, view_count, apply_count, profile_count, company:job_company_profiles!inner(advertiser_id)")
    .eq("id", id)
    .single();

  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const comp = listing.company as unknown as { advertiser_id: string };
  if (comp.advertiser_id !== advertiser.id) {
    return NextResponse.json({ error: "Not your listing" }, { status: 403 });
  }

  // Funnel
  const funnel = {
    views: listing.view_count ?? 0,
    applies: listing.apply_count ?? 0,
    profiles: listing.profile_count ?? 0,
  };

  // Daily events for sparklines (last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: events } = await admin
    .from("job_listing_events")
    .select("event_type, created_at")
    .eq("listing_id", id)
    .gte("created_at", thirtyDaysAgo)
    .order("created_at");

  // Bucket by day
  const dailyCounts: Record<string, { views: number; applies: number }> = {};
  for (const e of events ?? []) {
    const day = e.created_at.slice(0, 10);
    if (!dailyCounts[day]) dailyCounts[day] = { views: 0, applies: 0 };
    if (e.event_type === "view") dailyCounts[day].views++;
    if (e.event_type === "apply_click") dailyCounts[day].applies++;
  }

  const daily = Object.entries(dailyCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => ({ date, ...counts }));

  // Applicant breakdown
  const { data: applications } = await admin
    .from("job_applications")
    .select("developer_id, has_profile")
    .eq("listing_id", id);

  const profileIds = (applications ?? []).filter((a) => a.has_profile).map((a) => a.developer_id);

  let skillBreakdown: Record<string, number> = {};
  let seniorityBreakdown: Record<string, number> = {};

  if (profileIds.length > 0) {
    const { data: profiles } = await admin
      .from("career_profiles")
      .select("skills, seniority, web_type")
      .in("id", profileIds);

    for (const p of profiles ?? []) {
      for (const skill of p.skills ?? []) {
        skillBreakdown[skill] = (skillBreakdown[skill] ?? 0) + 1;
      }
      seniorityBreakdown[p.seniority] = (seniorityBreakdown[p.seniority] ?? 0) + 1;
    }
  }

  // Sort skills by count desc, top 10
  const topSkills = Object.entries(skillBreakdown)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([skill, count]) => ({ skill, count }));

  return NextResponse.json({
    funnel,
    daily,
    topSkills,
    seniorityBreakdown,
  });
}
