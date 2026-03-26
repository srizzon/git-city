import { NextRequest, NextResponse } from "next/server";
import { getAdvertiserFromCookies } from "@/lib/advertiser-auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const advertiser = await getAdvertiserFromCookies();
  if (!advertiser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();

  // Verify listing belongs to this advertiser
  const { data: listing } = await admin
    .from("job_listings")
    .select("id, tech_stack, company:job_company_profiles!inner(advertiser_id)")
    .eq("id", id)
    .single();

  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const comp = listing.company as unknown as { advertiser_id: string };
  if (comp.advertiser_id !== advertiser.id) {
    return NextResponse.json({ error: "Not your listing" }, { status: 403 });
  }

  // Get all applications for this listing
  const { data: applications } = await admin
    .from("job_applications")
    .select("developer_id, has_profile, created_at")
    .eq("listing_id", id)
    .order("created_at", { ascending: false });

  if (!applications || applications.length === 0) {
    return NextResponse.json({ candidates: [], withProfile: 0, withoutProfile: 0 });
  }

  const devIds = applications.map((a) => a.developer_id);
  const withProfileIds = applications.filter((a) => a.has_profile).map((a) => a.developer_id);
  const withoutProfile = applications.filter((a) => !a.has_profile).length;

  // Get developer data for those with profiles
  const { data: devs } = await admin
    .from("developers")
    .select("id, github_login, contributions_total, total_stars, public_repos, current_streak, level")
    .in("id", devIds);

  const { data: profiles } = await admin
    .from("career_profiles")
    .select("*")
    .in("id", withProfileIds);

  // Build candidates
  const candidates = (devs ?? []).map((dev) => {
    const profile = profiles?.find((p) => p.id === dev.id);
    const app = applications.find((a) => a.developer_id === dev.id);

    // Calculate skill match
    const techStack = listing.tech_stack ?? [];
    const devSkills = profile?.skills ?? [];
    const matchedSkills = techStack.filter((t: string) => devSkills.includes(t));

    return {
      developer_id: dev.id,
      github_login: dev.github_login,
      contributions: dev.contributions_total ?? 0,
      stars: dev.total_stars ?? 0,
      repos: dev.public_repos ?? 0,
      streak: dev.current_streak ?? 0,
      level: dev.level ?? 1,
      has_profile: !!profile,
      applied_at: app?.created_at,
      profile: profile ? {
        seniority: profile.seniority,
        years_experience: profile.years_experience,
        web_type: profile.web_type,
        skills: profile.skills,
        bio: profile.bio,
      } : null,
      skill_match: matchedSkills.length,
      skill_total: techStack.length,
    };
  });

  // Sort
  const url = new URL(req.url);
  const sort = url.searchParams.get("sort") ?? "recent";

  candidates.sort((a, b) => {
    switch (sort) {
      case "stars": return b.stars - a.stars;
      case "streak": return b.streak - a.streak;
      case "skill_match": return b.skill_match - a.skill_match;
      default: return new Date(b.applied_at ?? 0).getTime() - new Date(a.applied_at ?? 0).getTime();
    }
  });

  return NextResponse.json({
    candidates,
    withProfile: withProfileIds.length,
    withoutProfile,
  });
}
