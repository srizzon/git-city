import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

const MAX_PROMOTED = 30;
const SLOTS = 3;

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

    return NextResponse.json(
      { total: count ?? 0 },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } },
    );
  }

  // preview mode: no auth required — powers homepage jobs dropdown
  const preview = url.searchParams.get("preview") === "true";
  if (preview) {
    const { data, count } = await admin
      .from("job_listings")
      .select("id, title, salary_min, salary_max, salary_currency, tier, seniority, role_type, company:job_company_profiles(name)", { count: "exact" })
      .eq("status", "active")
      .order("published_at", { ascending: false })
      .limit(10);

    const TIER_P: Record<string, number> = { premium: 3, featured: 2, standard: 1, free: 0 };
    const sorted = (data ?? []).sort((a, b) => (TIER_P[b.tier] ?? 0) - (TIER_P[a.tier] ?? 0)).slice(0, 3);

    return NextResponse.json(
      { listings: sorted, total: count ?? 0 },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } },
    );
  }

  // ─── Full listing mode ───
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function applyFilters(qb: any) {
    let f = qb.eq("status", "active");
    if (q) {
      const safeQ = q.replace(/[\\%_(),.]/g, (c) => `\\${c}`);
      f = f.or(`title.ilike.%${safeQ}%,description.ilike.%${safeQ}%`);
    }
    if (web) f = f.eq("web_type", web);
    if (location) {
      const V = ["remote", "hybrid", "onsite"];
      if (V.includes(location)) f = f.eq("location_type", location);
    }
    if (role) {
      const V = ["frontend", "backend", "fullstack", "devops", "mobile", "data", "design", "cloud", "security", "qa", "ai_ml", "blockchain", "embedded", "sre", "gamedev", "engineering_manager", "other"];
      const rs = role.split(",").filter((r) => V.includes(r));
      if (rs.length === 1) f = f.eq("role_type", rs[0]);
      else if (rs.length > 1) f = f.in("role_type", rs);
    }
    if (stack) f = f.overlaps("tech_stack", stack.split(",").map((s) => s.trim().toLowerCase()));
    if (salaryMin) f = f.gte("salary_max", parseInt(salaryMin));
    if (seniority) {
      const V = ["intern", "junior", "mid", "senior", "staff", "lead", "principal", "director"];
      const ls = seniority.split(",").filter((s) => V.includes(s));
      if (ls.length === 1) f = f.eq("seniority", ls[0]);
      else if (ls.length > 1) f = f.in("seniority", ls);
    }
    if (contract) {
      const V = ["clt", "pj", "contract", "fulltime", "parttime", "freelance", "internship"];
      const ts = contract.split(",").filter((c) => V.includes(c));
      if (ts.length === 1) f = f.eq("contract_type", ts[0]);
      else if (ts.length > 1) f = f.in("contract_type", ts);
    }
    return f;
  }

  // ─── Salary sort: no slots, everything by salary ───
  // When user explicitly sorts by salary, positional promotion would break
  // the expectation. Promoted still get visual badges but not position override.
  if (sort === "salary") {
    const query = applyFilters(
      admin.from("job_listings").select("*, company:job_company_profiles(*)", { count: "exact" }),
    ).order("salary_max", { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, count, error } = await query;
    if (error) return NextResponse.json({ error: "Failed to fetch listings" }, { status: 500 });

    return NextResponse.json({ listings: data ?? [], total: count ?? 0, page });
  }

  // ─── Default sort (recent): promoted slots on page 1 + organic feed ───

  // Query 1: promoted (capped, for slot rotation) — only needed on page 1
  // Query 2: organic (paginated independently — promoted are "ad insertion", not part of pagination)
  const organicQuery = applyFilters(
    admin.from("job_listings").select("*, company:job_company_profiles(*)", { count: "exact" }),
  ).in("tier", ["standard", "free"])
    .order("published_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (page > 1) {
    // Page 2+: only organic, no promoted overhead
    const { data, count, error } = await organicQuery;
    if (error) return NextResponse.json({ error: "Failed to fetch listings" }, { status: 500 });
    return NextResponse.json({ listings: data ?? [], total: count ?? 0, page });
  }

  // Page 1: fetch promoted + organic in parallel
  const promotedQuery = applyFilters(
    admin.from("job_listings").select("*, company:job_company_profiles(*)"),
  ).in("tier", ["premium", "featured"])
    .order("published_at", { ascending: false })
    .limit(MAX_PROMOTED);

  const [promotedResult, organicResult] = await Promise.all([promotedQuery, organicQuery]);

  if (promotedResult.error || organicResult.error) {
    return NextResponse.json({ error: "Failed to fetch listings" }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allPromoted: any[] = promotedResult.data ?? [];
  const organicListings = organicResult.data ?? [];
  const organicCount = organicResult.count ?? 0;

  // ─── Build slots: Premium first, Featured second, max 1 per company ───
  const premiums = allPromoted.filter((l: { tier: string }) => l.tier === "premium");
  const featureds = allPromoted.filter((l: { tier: string }) => l.tier === "featured");

  const hourSeed = Math.floor(Date.now() / 3_600_000);
  function seededShuffle<T>(arr: T[], extraSeed: number): T[] {
    const copy = [...arr];
    let s = hourSeed ^ extraSeed;
    for (let i = copy.length - 1; i > 0; i--) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const j = s % (i + 1);
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  // Shuffle within each tier, then pick slots with company dedup
  const candidates = [...seededShuffle(premiums, 1), ...seededShuffle(featureds, 2)];
  const slotted: typeof candidates = [];
  const seenCompanies = new Set<string>();

  for (const listing of candidates) {
    if (slotted.length >= SLOTS) break;
    const companyId = listing.company_id as string;
    if (seenCompanies.has(companyId)) continue;
    seenCompanies.add(companyId);
    slotted.push(listing);
  }

  // Promoted are "ad insertion" on page 1 — not counted in pagination.
  // total = organicCount only. This keeps page 2+ offset deterministic.
  return NextResponse.json({
    listings: [...slotted, ...organicListings],
    total: organicCount,
    page,
  });
}
