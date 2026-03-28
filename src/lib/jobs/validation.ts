import DOMPurify from "isomorphic-dompurify";

// ── Constants ──

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

const DESCRIPTION_SANITIZE_OPTIONS = {
  ALLOWED_TAGS: ["p", "br", "strong", "em", "u", "s", "a", "ul", "ol", "li", "h1", "h2", "h3", "blockquote", "code", "pre"],
  ALLOWED_ATTR: ["href", "target", "rel"],
};

const HOW_TO_APPLY_SANITIZE_OPTIONS = {
  ALLOWED_TAGS: ["p", "br", "strong", "em", "u", "a", "ul", "ol", "li"],
  ALLOWED_ATTR: ["href", "target", "rel"],
};

// ── Types ──

export interface ValidatedListingFields {
  title: string;
  description: string;
  salary_min: number;
  salary_max: number;
  salary_currency: string;
  salary_period: string;
  role_type: string;
  tech_stack: string[];
  seniority: string;
  contract_type: string;
  web_type: string;
  apply_url: string;
  location_type: string;
  location_restriction: string;
  location_countries: string[];
  location_city: string | null;
  location_timezone: string | null;
  benefits: string[];
  how_to_apply: string | null;
  language: string;
  language_pt_br: string | null;
  badge_response_guaranteed: boolean;
  badge_no_ai_screening: boolean;
}

// ── Functions ──

export function isValidUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function sanitizeDescription(html: string): string {
  return DOMPurify.sanitize(html, DESCRIPTION_SANITIZE_OPTIONS);
}

export function sanitizeHowToApply(html: string): string | null {
  if (!html || html.trim().length === 0) return null;
  return DOMPurify.sanitize(html, HOW_TO_APPLY_SANITIZE_OPTIONS);
}

export function validateListingFields(
  body: Record<string, unknown>,
): { error: string } | { data: ValidatedListingFields } {
  const { title, description, salary_min, salary_max, role_type, tech_stack, seniority, contract_type, web_type, apply_url, location_type, location_restriction, location_countries, location_city, location_timezone, benefits, how_to_apply, salary_period } = body;

  // Title
  if (!title || typeof title !== "string" || title.length < 5) {
    return { error: "Title must be at least 5 characters" };
  }
  if (title.length > MAX_TITLE_LENGTH) {
    return { error: `Title max ${MAX_TITLE_LENGTH} characters` };
  }

  // Description
  if (!description || typeof description !== "string" || description.length < 50) {
    return { error: "Description must be at least 50 characters" };
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return { error: "Description is too long" };
  }
  const cleanDescription = sanitizeDescription(description);

  // Salary
  const minSalary = Number(salary_min);
  const maxSalary = Number(salary_max);
  if (!minSalary || minSalary <= 0) return { error: "Invalid minimum salary" };
  if (!maxSalary || maxSalary < minSalary) return { error: "Max salary must be >= min salary" };

  // Enums
  if (!VALID_ROLE_TYPES.includes(role_type as string)) return { error: "Invalid role type" };
  if (!VALID_SENIORITIES.includes(seniority as string)) return { error: "Invalid seniority" };
  if (!VALID_CONTRACTS.includes(contract_type as string)) return { error: "Invalid contract type" };
  if (!VALID_WEB.includes(web_type as string)) return { error: "Invalid web type" };

  // Tech stack
  if (!Array.isArray(tech_stack) || tech_stack.length === 0) {
    return { error: "At least 1 tech tag required" };
  }
  if (tech_stack.length > MAX_TECH_TAGS) {
    return { error: `Maximum ${MAX_TECH_TAGS} tech tags` };
  }

  // Apply URL
  if (!apply_url || typeof apply_url !== "string" || !isValidUrl(apply_url)) {
    return { error: "Apply URL must be a valid http/https URL" };
  }

  // Location
  const locType = (location_type as string) || "remote";
  if (!VALID_LOCATION_TYPES.includes(locType)) return { error: "Invalid location type" };
  const locRestriction = (location_restriction as string) || "worldwide";
  if (!VALID_LOCATION_RESTRICTIONS.includes(locRestriction)) return { error: "Invalid location restriction" };
  const locCountries = Array.isArray(location_countries) ? (location_countries as string[]).slice(0, 20) : [];
  const locCity = typeof location_city === "string" ? location_city.slice(0, 100) : null;
  const locTimezone = typeof location_timezone === "string" ? location_timezone.slice(0, 50) : null;

  // Benefits
  const jobBenefits = Array.isArray(benefits) ? (benefits as string[]).slice(0, MAX_BENEFITS) : [];

  // How to apply
  let cleanHowToApply: string | null = null;
  if (how_to_apply && typeof how_to_apply === "string" && how_to_apply.trim().length > 0) {
    if (how_to_apply.length > MAX_HOW_TO_APPLY) return { error: "How to apply is too long" };
    cleanHowToApply = sanitizeHowToApply(how_to_apply);
  }

  // Salary period
  const salaryPeriod = VALID_SALARY_PERIODS.includes(salary_period as string) ? (salary_period as string) : "monthly";

  return {
    data: {
      title: title as string,
      description: cleanDescription,
      salary_min: minSalary,
      salary_max: maxSalary,
      salary_currency: (body.salary_currency as string) ?? "USD",
      salary_period: salaryPeriod,
      role_type: role_type as string,
      tech_stack: (tech_stack as string[]).map((t) => t.toLowerCase().trim()),
      seniority: seniority as string,
      contract_type: contract_type as string,
      web_type: web_type as string,
      apply_url: apply_url as string,
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
    },
  };
}
