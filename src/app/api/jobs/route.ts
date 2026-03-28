import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const countOnly = url.searchParams.get("count_only") === "true";

  const admin = getSupabaseAdmin();

  // count_only mode: no auth required — powers E.Arcade card + public teaser
  if (countOnly) {
    const { count } = await admin
      .from("job_listings")
      .select("*", { count: "exact", head: true })
      .eq("status", "active");

    return NextResponse.json({ total: count ?? 0 });
  }

  // preview mode: no auth required — powers homepage jobs dropdown
  const preview = url.searchParams.get("preview") === "true";
  if (preview) {
    const { data, count } = await admin
      .from("job_listings")
      .select("id, title, salary_min, salary_max, salary_currency, tier, seniority, role_type, company:job_company_profiles(name)", { count: "exact" })
      .eq("status", "active")
      .order("tier", { ascending: false })
      .order("published_at", { ascending: false })
      .limit(3);

    return NextResponse.json({ listings: data ?? [], total: count ?? 0 });
  }

  // Full listing mode: auth required (community-exclusive)
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Parse filters
  const q = url.searchParams.get("q") ?? "";
  const web = url.searchParams.get("web");
  const role = url.searchParams.get("role");
  const stack = url.searchParams.get("stack");
  const salaryMin = url.searchParams.get("salary_min");
  const seniority = url.searchParams.get("seniority");
  const contract = url.searchParams.get("contract");
  const location = url.searchParams.get("location");
  const sort = url.searchParams.get("sort") ?? "recent";
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1"));
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20")));
  const offset = (page - 1) * limit;

  let query = admin
    .from("job_listings")
    .select("*, company:job_company_profiles(*)", { count: "exact" })
    .eq("status", "active");

  if (q) {
    // Escape special PostgREST characters to prevent filter injection
    const safeQ = q.replace(/[\\%_(),.]/g, (c) => `\\${c}`);
    query = query.or(`title.ilike.%${safeQ}%,description.ilike.%${safeQ}%`);
  }
  if (web) {
    query = query.eq("web_type", web);
  }
  if (location) {
    const VALID_LOCATIONS = ["remote", "hybrid", "onsite"];
    if (VALID_LOCATIONS.includes(location)) {
      query = query.eq("location_type", location);
    }
  }
  if (role) {
    const VALID_ROLES = ["frontend", "backend", "fullstack", "devops", "mobile", "data", "design", "cloud", "security", "qa", "ai_ml", "blockchain", "embedded", "sre", "gamedev", "engineering_manager", "other"];
    const roles = role.split(",").filter((r) => VALID_ROLES.includes(r));
    if (roles.length === 1) {
      query = query.eq("role_type", roles[0]);
    } else if (roles.length > 1) {
      query = query.in("role_type", roles);
    }
  }
  if (stack) {
    const tags = stack.split(",").map((s) => s.trim().toLowerCase());
    query = query.overlaps("tech_stack", tags);
  }
  if (salaryMin) {
    query = query.gte("salary_max", parseInt(salaryMin));
  }
  if (seniority) {
    const VALID_SENIORITY = ["intern", "junior", "mid", "senior", "staff", "lead", "principal", "director"];
    const levels = seniority.split(",").filter((s) => VALID_SENIORITY.includes(s));
    if (levels.length === 1) {
      query = query.eq("seniority", levels[0]);
    } else if (levels.length > 1) {
      query = query.in("seniority", levels);
    }
  }
  if (contract) {
    const VALID_CONTRACT = ["clt", "pj", "contract", "fulltime", "parttime", "freelance", "internship"];
    const types = contract.split(",").filter((c) => VALID_CONTRACT.includes(c));
    if (types.length === 1) {
      query = query.eq("contract_type", types[0]);
    } else if (types.length > 1) {
      query = query.in("contract_type", types);
    }
  }

  // Featured/premium listings pinned to top, then sort by user preference
  query = query.order("tier", { ascending: false });

  if (sort === "salary") {
    query = query.order("salary_max", { ascending: false });
  } else {
    query = query.order("published_at", { ascending: false });
  }

  query = query.range(offset, offset + limit - 1);

  const { data: listings, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: "Failed to fetch listings" }, { status: 500 });
  }

  return NextResponse.json({
    listings: listings ?? [],
    total: count ?? 0,
    page,
  });
}
