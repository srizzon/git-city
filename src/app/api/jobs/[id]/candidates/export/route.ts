import { NextRequest, NextResponse } from "next/server";
import { getAdvertiserFromCookies } from "@/lib/advertiser-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { calculateQualityScore, calculateBadges } from "@/lib/jobs/quality-score";

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

  // Verify listing belongs to this advertiser
  const { data: listing } = await admin
    .from("job_listings")
    .select("id, title, company:job_company_profiles!inner(advertiser_id)")
    .eq("id", id)
    .single();

  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const comp = listing.company as unknown as { advertiser_id: string };
  if (comp.advertiser_id !== advertiser.id) {
    return NextResponse.json({ error: "Not your listing" }, { status: 403 });
  }

  // Get applications
  const { data: applications } = await admin
    .from("job_applications")
    .select("developer_id, has_profile, status, created_at")
    .eq("listing_id", id)
    .order("created_at", { ascending: false });

  if (!applications || applications.length === 0) {
    const csv = "github_username,contributions,stars,repos,streak,level,seniority,years_experience,skills,status,applied_at,quality_score,badges,profile_url\n";
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="candidates-${id.slice(0, 8)}.csv"`,
      },
    });
  }

  const devIds = applications.map((a) => a.developer_id);

  const [devsRes, profilesRes, projectsRes, experiencesRes] = await Promise.all([
    admin
      .from("developers")
      .select("id, github_login, contributions_total, total_stars, public_repos, current_streak, level")
      .in("id", devIds),
    admin
      .from("career_profiles")
      .select("id, seniority, years_experience, skills")
      .in("id", devIds),
    admin
      .from("portfolio_projects")
      .select("developer_id")
      .in("developer_id", devIds)
      .limit(1),
    admin
      .from("portfolio_experiences")
      .select("developer_id")
      .in("developer_id", devIds)
      .limit(1),
  ]);

  const devs = devsRes.data ?? [];
  const profiles = profilesRes.data ?? [];
  const projectDevIds = new Set((projectsRes.data ?? []).map((p) => p.developer_id));
  const experienceDevIds = new Set((experiencesRes.data ?? []).map((e) => e.developer_id));

  const escapeCSV = (val: string) => {
    if (val.includes(",") || val.includes('"') || val.includes("\n")) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };

  const header = "github_username,contributions,stars,repos,streak,level,seniority,years_experience,skills,status,applied_at,quality_score,badges,profile_url";

  const rows = devs.map((dev) => {
    const app = applications.find((a) => a.developer_id === dev.id);
    const profile = profiles.find((p) => p.id === dev.id);

    const scoreInput = {
      contributions: dev.contributions_total ?? 0,
      stars: dev.total_stars ?? 0,
      streak: dev.current_streak ?? 0,
      level: dev.level ?? 1,
      has_profile: !!profile,
      has_projects: projectDevIds.has(dev.id),
      has_experiences: experienceDevIds.has(dev.id),
    };

    const score = calculateQualityScore(scoreInput);
    const badges = calculateBadges(scoreInput);

    return [
      dev.github_login,
      dev.contributions_total ?? 0,
      dev.total_stars ?? 0,
      dev.public_repos ?? 0,
      dev.current_streak ?? 0,
      dev.level ?? 1,
      profile?.seniority ?? "",
      profile?.years_experience ?? "",
      escapeCSV((profile?.skills ?? []).join("; ")),
      app?.status ?? "applied",
      app?.created_at?.slice(0, 10) ?? "",
      score,
      escapeCSV(badges.join("; ")),
      `https://thegitcity.com/hire/${dev.github_login}`,
    ].join(",");
  });

  const csv = [header, ...rows].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="candidates-${id.slice(0, 8)}.csv"`,
    },
  });
}
