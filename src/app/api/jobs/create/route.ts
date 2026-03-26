import { NextRequest, NextResponse } from "next/server";
import { getAdvertiserFromCookies } from "@/lib/advertiser-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import DOMPurify from "isomorphic-dompurify";

const VALID_ROLE_TYPES = ["frontend", "backend", "fullstack", "devops", "mobile", "data", "design", "other"];
const VALID_SENIORITIES = ["junior", "mid", "senior", "staff", "lead"];
const VALID_CONTRACTS = ["clt", "pj", "contract"];
const VALID_WEB = ["web2", "web3", "both"];
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

  const { title, description, salary_min, salary_max, role_type, tech_stack, seniority, contract_type, web_type, apply_url } = body as Record<string, string | number | string[]>;

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
        role_type,
        tech_stack: (tech_stack as string[]).map((t) => t.toLowerCase().trim()),
        seniority,
        contract_type,
        web_type,
        apply_url,
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
      role_type,
      tech_stack: (tech_stack as string[]).map((t) => t.toLowerCase().trim()),
      seniority,
      contract_type,
      web_type,
      apply_url,
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
