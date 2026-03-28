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

export async function GET() {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = getSupabaseAdmin();

  // Fetch companies with advertiser email
  const { data: companies, error } = await admin
    .from("job_company_profiles")
    .select("*, advertiser:advertiser_accounts(email)")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch companies:", error);
    return NextResponse.json({ error: "Failed to fetch companies" }, { status: 500 });
  }

  // Fetch listing counts per company
  const { data: listings } = await admin
    .from("job_listings")
    .select("company_id, status");

  const countMap: Record<string, { total: number; active: number }> = {};
  for (const l of listings ?? []) {
    if (!countMap[l.company_id]) countMap[l.company_id] = { total: 0, active: 0 };
    countMap[l.company_id].total++;
    if (l.status === "active") countMap[l.company_id].active++;
  }

  const result = (companies ?? []).map((c) => ({
    ...c,
    advertiser_email: c.advertiser?.email ?? null,
    advertiser: undefined,
    listings_count: countMap[c.id]?.total ?? 0,
    active_count: countMap[c.id]?.active ?? 0,
  }));

  return NextResponse.json({ companies: result });
}

export async function POST(req: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name, slug, website, description, logo_url, github_org } = body as Record<string, string>;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (!slug || typeof slug !== "string" || !/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.json({ error: "Slug must be lowercase letters, numbers, and hyphens only" }, { status: 400 });
  }
  if (!website || typeof website !== "string" || !isValidUrl(website)) {
    return NextResponse.json({ error: "Website must be a valid URL" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const login = getGithubLoginFromUser(user);

  // Check slug uniqueness
  const { data: existing } = await admin
    .from("job_company_profiles")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: "Slug already taken" }, { status: 409 });
  }

  const { data: company, error } = await admin
    .from("job_company_profiles")
    .insert({
      name: name.trim(),
      slug,
      website,
      description: description || null,
      logo_url: logo_url || null,
      github_org: github_org || null,
      advertiser_id: null,
      created_by: `admin:${login}`,
    })
    .select()
    .single();

  if (error) {
    console.error("Failed to create company:", error);
    return NextResponse.json({ error: "Failed to create company" }, { status: 500 });
  }

  return NextResponse.json({ company });
}
