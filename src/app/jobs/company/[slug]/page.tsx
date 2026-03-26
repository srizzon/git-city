import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { SENIORITY_LABELS, WEB_TYPE_LABELS } from "@/lib/jobs/constants";

interface Props {
  params: Promise<{ slug: string }>;
}

const getCompany = cache(async (slug: string) => {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("job_company_profiles")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  return data;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const company = await getCompany(slug);
  return {
    title: company ? `${company.name} - Git City Jobs` : "Company Not Found",
  };
}

export default async function CompanyPage({ params }: Props) {
  const { slug } = await params;

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/api/auth/github?redirect=/jobs/company/${slug}`);

  const company = await getCompany(slug);
  if (!company) notFound();

  const admin = getSupabaseAdmin();
  const { data: listings } = await admin
    .from("job_listings")
    .select("*")
    .eq("company_id", company.id)
    .eq("status", "active")
    .order("published_at", { ascending: false });

  return (
    <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <Link href="/jobs" className="text-sm text-muted transition-colors hover:text-cream">
          &lt; Back to jobs
        </Link>

        {/* Company header */}
        <div className="mt-6 border-[3px] border-border bg-bg-raised p-6 sm:p-8 space-y-4">
          <h1 className="text-2xl text-cream sm:text-3xl">{company.name}</h1>
          {company.description && (
            <p className="text-sm text-cream-dark normal-case leading-relaxed">{company.description}</p>
          )}
          <div className="flex flex-wrap items-center gap-4">
            <a href={company.website} target="_blank" rel="noopener noreferrer" className="text-xs text-lime transition-colors hover:text-cream">
              Website
            </a>
            {company.github_org && (
              <a href={`https://github.com/${company.github_org}`} target="_blank" rel="noopener noreferrer" className="text-xs text-lime transition-colors hover:text-cream">
                GitHub
              </a>
            )}
            {company.hired_count > 0 && (
              <span className="border-[3px] border-lime/30 px-3 py-1 text-xs text-lime">
                {company.hired_count} hired via Git City
              </span>
            )}
          </div>
        </div>

        {/* Listings */}
        <div className="mt-8">
          <h2 className="text-sm text-muted">
            {(listings?.length ?? 0)} open position{(listings?.length ?? 0) !== 1 ? "s" : ""}
          </h2>

          <div className="mt-3 space-y-3">
            {listings && listings.length > 0 ? (
              listings.map((job) => (
                <Link
                  key={job.id}
                  href={`/jobs/${job.id}`}
                  aria-label={`${job.title} — ${job.salary_currency} ${job.salary_min.toLocaleString()}–${job.salary_max.toLocaleString()}`}
                  className="block border-[3px] border-border bg-bg-raised p-5 transition-colors hover:border-border-light"
                >
                  <h3 className="text-base text-cream">{job.title}</h3>
                  <p className="mt-1.5 text-xs text-muted">
                    {SENIORITY_LABELS[job.seniority]} · {WEB_TYPE_LABELS[job.web_type]}
                  </p>
                  <p className="mt-1.5 text-sm text-lime">
                    {job.salary_currency} {job.salary_min.toLocaleString()}–{job.salary_max.toLocaleString()}
                  </p>
                </Link>
              ))
            ) : (
              <p className="text-sm text-dim">No active listings.</p>
            )}
          </div>
        </div>

        <div className="h-12" />
      </div>
    </main>
  );
}
