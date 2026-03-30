import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import JobDetailClient from "./JobDetailClient";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const admin = getSupabaseAdmin();

  const { data: listing } = await admin
    .from("job_listings")
    .select("title, seniority, role_type, salary_min, salary_max, salary_currency, salary_period, location_type, company:job_company_profiles(name)")
    .eq("id", id)
    .eq("status", "active")
    .single();

  if (!listing) {
    return { title: "Job - Git City" };
  }

  const company = (listing.company as unknown as { name: string })?.name ?? "Unknown";
  const title = `${listing.title} at ${company} - Git City Jobs`;

  const seniority = listing.seniority.charAt(0).toUpperCase() + listing.seniority.slice(1);
  const roleType = listing.role_type.charAt(0).toUpperCase() + listing.role_type.slice(1);
  const locationType = listing.location_type.charAt(0).toUpperCase() + listing.location_type.slice(1);

  let salaryPart = "";
  if (listing.salary_min && listing.salary_max) {
    const currency = listing.salary_currency ?? "USD";
    const period = listing.salary_period ?? "monthly";
    salaryPart = ` ${currency} ${listing.salary_min.toLocaleString()}-${listing.salary_max.toLocaleString()}/${period}.`;
  }

  const description = `${seniority} ${roleType} at ${company}.${salaryPart} ${locationType}.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
    },
  };
}

export default async function JobDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/api/auth/github?redirect=/jobs/${id}`);
  }

  return <JobDetailClient listingId={id} />;
}
