import { NextRequest, NextResponse } from "next/server";
import { getAdvertiserFromCookies } from "@/lib/advertiser-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import DOMPurify from "isomorphic-dompurify";

const VALID_ROLE_TYPES = ["frontend", "backend", "fullstack", "devops", "mobile", "data", "design", "cloud", "security", "qa", "ai_ml", "blockchain", "embedded", "sre", "gamedev", "engineering_manager", "other"];
const VALID_SENIORITIES = ["intern", "junior", "mid", "senior", "staff", "lead", "principal", "director"];
const VALID_CONTRACTS = ["clt", "pj", "contract", "fulltime", "parttime", "freelance", "internship"];
const VALID_WEB = ["web2", "web3", "both"];
const VALID_LOCATION_TYPES = ["remote", "hybrid", "onsite"];
const VALID_LOCATION_RESTRICTIONS = ["worldwide", "americas", "europe", "asia", "africa", "oceania", "latam", "specific"];
const VALID_SALARY_PERIODS = ["monthly", "annual"];
const MAX_BENEFITS = 15;
const MAX_HOW_TO_APPLY = 3000;
const MAX_TITLE_LENGTH = 100;
const MAX_TECH_TAGS = 15;
const MAX_DESCRIPTION_LENGTH = 10000;

function isValidUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const advertiser = await getAdvertiserFromCookies();
  if (!advertiser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();

  const { data: company } = await admin
    .from("job_company_profiles")
    .select("id")
    .eq("advertiser_id", advertiser.id)
    .maybeSingle();

  if (!company) {
    return NextResponse.json({ error: "Create a company profile first" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { title, description, salary_min, salary_max, role_type, tech_stack, seniority, contract_type, web_type, apply_url, location_type, location_restriction, location_countries, location_city, location_timezone, benefits, how_to_apply, salary_period } = body as Record<string, string | number | string[] | boolean>;

  // ── Validation ──
  if (!title || typeof title !== "string" || title.length < 5) {
    return NextResponse.json({ error: "Title must be at least 5 characters" }, { status: 400 });
  }
  if (typeof title === "string" && title.length > MAX_TITLE_LENGTH) {
    return NextResponse.json({ error: `Title max ${MAX_TITLE_LENGTH} characters` }, { status: 400 });
  }
  if (!description || typeof description !== "string" || description.length < 50) {
    return NextResponse.json({ error: "Description must be at least 50 characters" }, { status: 400 });
  }
  if (typeof description === "string" && description.length > MAX_DESCRIPTION_LENGTH) {
    return NextResponse.json({ error: "Description is too long" }, { status: 400 });
  }

  // Sanitize HTML to prevent XSS
  const cleanDescription = DOMPurify.sanitize(description as string, {
    ALLOWED_TAGS: ["p", "br", "strong", "em", "u", "s", "a", "ul", "ol", "li", "h1", "h2", "h3", "blockquote", "code", "pre"],
    ALLOWED_ATTR: ["href", "target", "rel"],
  });

  const minSalary = Number(salary_min);
  const maxSalary = Number(salary_max);
  if (!minSalary || minSalary <= 0) return NextResponse.json({ error: "Invalid minimum salary" }, { status: 400 });
  if (!maxSalary || maxSalary < minSalary) return NextResponse.json({ error: "Max salary must be >= min salary" }, { status: 400 });

  if (!VALID_ROLE_TYPES.includes(role_type as string)) return NextResponse.json({ error: "Invalid role type" }, { status: 400 });
  if (!VALID_SENIORITIES.includes(seniority as string)) return NextResponse.json({ error: "Invalid seniority" }, { status: 400 });
  if (!VALID_CONTRACTS.includes(contract_type as string)) return NextResponse.json({ error: "Invalid contract type" }, { status: 400 });
  if (!VALID_WEB.includes(web_type as string)) return NextResponse.json({ error: "Invalid web type" }, { status: 400 });

  if (!Array.isArray(tech_stack) || tech_stack.length === 0) {
    return NextResponse.json({ error: "At least 1 tech tag required" }, { status: 400 });
  }
  if (tech_stack.length > MAX_TECH_TAGS) {
    return NextResponse.json({ error: `Maximum ${MAX_TECH_TAGS} tech tags` }, { status: 400 });
  }

  if (!apply_url || typeof apply_url !== "string" || !isValidUrl(apply_url)) {
    return NextResponse.json({ error: "Apply URL must be a valid http/https URL" }, { status: 400 });
  }

  // Location
  const locType = (location_type as string) || "remote";
  if (!VALID_LOCATION_TYPES.includes(locType)) return NextResponse.json({ error: "Invalid location type" }, { status: 400 });
  const locRestriction = (location_restriction as string) || "worldwide";
  if (!VALID_LOCATION_RESTRICTIONS.includes(locRestriction)) return NextResponse.json({ error: "Invalid location restriction" }, { status: 400 });
  const locCountries = Array.isArray(location_countries) ? location_countries.slice(0, 20) : [];
  const locCity = typeof location_city === "string" ? location_city.slice(0, 100) : null;
  const locTimezone = typeof location_timezone === "string" ? location_timezone.slice(0, 50) : null;

  // Benefits
  const jobBenefits = Array.isArray(benefits) ? benefits.slice(0, MAX_BENEFITS) : [];

  // How to apply
  let cleanHowToApply: string | null = null;
  if (how_to_apply && typeof how_to_apply === "string" && how_to_apply.trim().length > 0) {
    if (how_to_apply.length > MAX_HOW_TO_APPLY) return NextResponse.json({ error: "How to apply is too long" }, { status: 400 });
    cleanHowToApply = DOMPurify.sanitize(how_to_apply, {
      ALLOWED_TAGS: ["p", "br", "strong", "em", "u", "a", "ul", "ol", "li"],
      ALLOWED_ATTR: ["href", "target", "rel"],
    });
  }

  // Salary period
  const salaryPeriod = VALID_SALARY_PERIODS.includes(salary_period as string) ? salary_period : "monthly";

  // ── Check for existing draft (prevent duplicates on retry) ──
  const { data: existingDraft } = await admin
    .from("job_listings")
    .select("id")
    .eq("company_id", company.id)
    .eq("status", "draft")
    .eq("title", title)
    .maybeSingle();

  if (existingDraft) {
    // Update existing draft instead of creating duplicate
    const { data: listing, error } = await admin
      .from("job_listings")
      .update({
        description: cleanDescription,
        salary_min: minSalary,
        salary_max: maxSalary,
        salary_currency: (body.salary_currency as string) ?? "USD",
        salary_period: salaryPeriod,
        role_type,
        tech_stack: (tech_stack as string[]).map((t) => t.toLowerCase().trim()),
        seniority,
        contract_type,
        web_type,
        apply_url,
        location_type: locType,
        location_restriction: locRestriction,
        location_countries: locCountries,
        location_city: locCity,
        location_timezone: locTimezone,
        benefits: jobBenefits,
        how_to_apply: cleanHowToApply,
        language: (body.language as string) ?? "en",
        language_pt_br: (body.language_pt_br as string) ?? null,
        badge_response_guaranteed: (body.badge_response_guaranteed as boolean) ?? false,
        badge_no_ai_screening: (body.badge_no_ai_screening as boolean) ?? false,
      })
      .eq("id", existingDraft.id)
      .select()
      .single();

    if (error) {
      console.error("Failed to update draft:", error);
      return NextResponse.json({ error: "Failed to update listing" }, { status: 500 });
    }
    return NextResponse.json({ listing });
  }

  // ── Create new draft ──
  const { data: listing, error } = await admin
    .from("job_listings")
    .insert({
      company_id: company.id,
      title,
      description: cleanDescription,
      salary_min: minSalary,
      salary_max: maxSalary,
      salary_currency: (body.salary_currency as string) ?? "USD",
      salary_period: salaryPeriod,
      role_type,
      tech_stack: (tech_stack as string[]).map((t) => t.toLowerCase().trim()),
      seniority,
      contract_type,
      web_type,
      apply_url,
      location_type: locType,
      location_restriction: locRestriction,
      location_countries: locCountries,
      location_city: locCity,
      location_timezone: locTimezone,
      benefits: jobBenefits,
      how_to_apply: cleanHowToApply,
      language: (body.language as string) ?? "en",
      language_pt_br: (body.language_pt_br as string) ?? null,
      badge_response_guaranteed: (body.badge_response_guaranteed as boolean) ?? false,
      badge_no_ai_screening: (body.badge_no_ai_screening as boolean) ?? false,
      status: "draft",
      tier: "standard",
    })
    .select()
    .single();

  if (error) {
    console.error("Failed to create listing:", error);
    return NextResponse.json({ error: "Failed to create listing" }, { status: 500 });
  }

  return NextResponse.json({ listing });
}
