import type { Metadata } from "next";
import { cache } from "react";
import { getSupabaseAdmin } from "@/lib/supabase";
import JobDetailClient from "./JobDetailClient";
import {
  SENIORITY_LABELS,
  ROLE_TYPE_LABELS,
  LOCATION_TYPE_LABELS,
  SALARY_PERIOD_LABELS,
  BENEFITS_LIST,
} from "@/lib/jobs/constants";

interface Props {
  params: Promise<{ id: string }>;
}

// Shared query — React `cache` deduplicates within the same request
const getActiveListing = cache(async (id: string) => {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("job_listings")
    .select("title, description, seniority, role_type, contract_type, salary_min, salary_max, salary_currency, salary_period, location_type, location_restriction, tech_stack, benefits, published_at, expires_at, company:job_company_profiles(name)")
    .eq("id", id)
    .eq("status", "active")
    .single();
  return data;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const listing = await getActiveListing(id);

  if (!listing) {
    return { title: "Job - Git City" };
  }

  const company = (listing.company as unknown as { name: string })?.name ?? "Unknown";
  const title = `${listing.title} at ${company} - Git City Jobs`;

  const seniority = SENIORITY_LABELS[listing.seniority] ?? listing.seniority;
  const roleType = ROLE_TYPE_LABELS[listing.role_type] ?? listing.role_type;
  const locationType = LOCATION_TYPE_LABELS[listing.location_type] ?? listing.location_type;

  let salaryPart = "";
  if (listing.salary_min && listing.salary_max) {
    const currency = listing.salary_currency ?? "USD";
    const period = listing.salary_period ?? "monthly";
    salaryPart = ` ${currency} ${listing.salary_min.toLocaleString()}-${listing.salary_max.toLocaleString()}/${period}.`;
  }

  const description = `${seniority} ${roleType} at ${company}.${salaryPart} ${locationType}. Apply on Git City.`;
  const techStack = (listing.tech_stack as string[]) ?? [];

  return {
    title,
    description,
    keywords: [company, roleType, seniority, ...techStack.slice(0, 5)],
    openGraph: {
      title,
      description,
    },
  };
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function safeJsonLd(json: string): string {
  return json.replace(/<\//g, "<\\/");
}

function buildJobPostingSchema(listing: Record<string, unknown>) {
  const company = listing.company as { name: string } | null;
  const techStack = (listing.tech_stack as string[]) ?? [];
  const benefits = (listing.benefits as string[]) ?? [];
  const benefitLabels = benefits
    .map((b) => BENEFITS_LIST.find((bl) => bl.id === b)?.label)
    .filter(Boolean);

  const contractMap: Record<string, string> = {
    fulltime: "FULL_TIME",
    parttime: "PART_TIME",
    contract: "CONTRACTOR",
    freelance: "CONTRACTOR",
    internship: "INTERN",
    clt: "FULL_TIME",
    pj: "CONTRACTOR",
  };

  const schema: Record<string, unknown> = {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    title: listing.title,
    description: stripHtml((listing.description as string) ?? ""),
    datePosted: listing.published_at,
    validThrough: listing.expires_at,
    employmentType: contractMap[listing.contract_type as string] ?? "FULL_TIME",
    hiringOrganization: {
      "@type": "Organization",
      name: company?.name ?? "Unknown",
    },
    jobLocationType: listing.location_type === "remote" ? "TELECOMMUTE" : undefined,
    applicantLocationRequirements: listing.location_type === "remote"
      ? { "@type": "Country", name: "Worldwide" }
      : undefined,
    skills: techStack.join(", "),
    jobBenefits: benefitLabels.length > 0 ? benefitLabels.join(", ") : undefined,
  };

  if (listing.salary_min && listing.salary_max) {
    schema.baseSalary = {
      "@type": "MonetaryAmount",
      currency: listing.salary_currency ?? "USD",
      value: {
        "@type": "QuantitativeValue",
        minValue: listing.salary_min,
        maxValue: listing.salary_max,
        unitText: listing.salary_period === "annual" ? "YEAR" : "MONTH",
      },
    };
  }

  const json = JSON.stringify(
    Object.fromEntries(Object.entries(schema).filter(([, v]) => v !== undefined)),
  );
  return safeJsonLd(json);
}

export default async function JobDetailPage({ params }: Props) {
  const { id } = await params;

  // Reuses the cached query from generateMetadata (same request = 1 DB call)
  const listing = await getActiveListing(id);

  return (
    <>
      {listing && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: buildJobPostingSchema(listing) }}
        />
      )}
      <JobDetailClient listingId={id} />
    </>
  );
}
