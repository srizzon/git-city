import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  SENIORITY_LABELS,
  ROLE_TYPE_LABELS,
  CONTRACT_LABELS,
  LOCATION_TYPE_LABELS,
  BENEFITS_LIST,
} from "@/lib/jobs/constants";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://thegitcity.com";

/**
 * GET /api/jobs/feed — Public job feed for aggregators.
 * Supports ?format=xml (default) or ?format=json
 *
 * XML follows the Indeed/LinkedIn job feed format.
 * JSON follows the standard JSON:API-like format.
 */
export async function GET(req: NextRequest) {
  const format = new URL(req.url).searchParams.get("format") ?? "xml";

  const admin = getSupabaseAdmin();
  const { data: listings } = await admin
    .from("job_listings")
    .select("id, title, description, seniority, role_type, contract_type, salary_min, salary_max, salary_currency, salary_period, location_type, location_restriction, location_city, location_countries, tech_stack, benefits, apply_url, published_at, expires_at, company:job_company_profiles(name, website, logo_url)")
    .eq("status", "active")
    .order("published_at", { ascending: false })
    .limit(500);

  if (!listings || listings.length === 0) {
    if (format === "json") {
      return NextResponse.json({ jobs: [] }, {
        headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
      });
    }
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><source><jobs></jobs></source>`,
      { headers: { "Content-Type": "application/xml", "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
    );
  }

  if (format === "json") {
    const jobs = listings.map((l) => formatJobJson(l));
    return NextResponse.json(
      { jobs, total: jobs.length, feed_url: `${BASE_URL}/api/jobs/feed?format=json` },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
    );
  }

  // XML feed (Indeed/LinkedIn compatible)
  const jobsXml = listings.map((l) => formatJobXml(l)).join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<source>
  <publisher>Git City</publisher>
  <publisherurl>${BASE_URL}</publisherurl>
  <lastBuildDate>${new Date().toISOString()}</lastBuildDate>
  <jobs>
${jobsXml}
  </jobs>
</source>`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

/** Escape content for safe CDATA embedding (prevent ]]> breakout) */
function safeCdata(str: string): string {
  return str.replace(/]]>/g, "]]]]><![CDATA[>");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatJobXml(l: any): string {
  const company = l.company as { name: string; website: string } | null;
  const companyName = escapeXml(company?.name ?? "Unknown");
  const description = escapeXml(stripHtml(l.description).slice(0, 5000));
  const techStack = ((l.tech_stack as string[]) ?? []).join(", ");
  const benefitIds = (l.benefits as string[]) ?? [];
  const benefitLabels = benefitIds
    .map((b) => BENEFITS_LIST.find((bl) => bl.id === b)?.label)
    .filter(Boolean)
    .join(", ");

  const contractMap: Record<string, string> = {
    fulltime: "full-time", parttime: "part-time", contract: "contract",
    freelance: "contract", internship: "internship", clt: "full-time", pj: "contract",
  };

  let locationStr = LOCATION_TYPE_LABELS[l.location_type] ?? "Remote";
  if (l.location_city) locationStr = `${l.location_city} (${locationStr})`;

  return `    <job>
      <title><![CDATA[${safeCdata(l.title)}]]></title>
      <date>${l.published_at}</date>
      <referencenumber>${l.id}</referencenumber>
      <url>${BASE_URL}/jobs/${l.id}</url>
      <company><![CDATA[${safeCdata(companyName)}]]></company>
      <city>${escapeXml(l.location_city ?? "")}</city>
      <country>${escapeXml(((l.location_countries as string[]) ?? [])[0] ?? "Remote")}</country>
      <jobtype>${contractMap[l.contract_type] ?? "full-time"}</jobtype>
      <salary>${l.salary_currency} ${l.salary_min}-${l.salary_max} ${l.salary_period ?? "monthly"}</salary>
      <category>${escapeXml(ROLE_TYPE_LABELS[l.role_type] ?? l.role_type)}</category>
      <experience>${escapeXml(SENIORITY_LABELS[l.seniority] ?? l.seniority)}</experience>
      <description><![CDATA[${safeCdata(description)}]]></description>
      <skills>${escapeXml(techStack)}</skills>
      <benefits>${escapeXml(benefitLabels)}</benefits>
      <remotetype>${l.location_type}</remotetype>
      <expirationdate>${l.expires_at ?? ""}</expirationdate>
    </job>`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatJobJson(l: any) {
  const company = l.company as { name: string; website: string; logo_url: string | null } | null;
  const benefitIds = (l.benefits as string[]) ?? [];
  const benefitLabels = benefitIds
    .map((b) => BENEFITS_LIST.find((bl) => bl.id === b)?.label)
    .filter(Boolean);

  return {
    id: l.id,
    url: `${BASE_URL}/jobs/${l.id}`,
    title: l.title,
    description: stripHtml(l.description).slice(0, 5000),
    company: {
      name: company?.name ?? "Unknown",
      website: company?.website ?? null,
      logo_url: company?.logo_url ?? null,
    },
    salary: {
      min: l.salary_min,
      max: l.salary_max,
      currency: l.salary_currency,
      period: l.salary_period ?? "monthly",
    },
    seniority: l.seniority,
    seniority_label: SENIORITY_LABELS[l.seniority] ?? l.seniority,
    role_type: l.role_type,
    role_type_label: ROLE_TYPE_LABELS[l.role_type] ?? l.role_type,
    contract_type: l.contract_type,
    contract_type_label: CONTRACT_LABELS[l.contract_type] ?? l.contract_type,
    location: {
      type: l.location_type,
      restriction: l.location_restriction,
      city: l.location_city,
      countries: l.location_countries,
    },
    tech_stack: l.tech_stack,
    benefits: benefitLabels,
    published_at: l.published_at,
    expires_at: l.expires_at,
  };
}
