import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  SENIORITY_LABELS,
  ROLE_TYPE_LABELS,
  CONTRACT_LABELS,
  LOCATION_TYPE_LABELS,
  LOCATION_RESTRICTION_LABELS,
  SALARY_PERIOD_LABELS,
} from "@/lib/jobs/constants";

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
  if (!company) return { title: "Company Not Found - Git City" };
  return {
    title: `${company.name} - Jobs on Git City`,
    description: company.description ?? `See open positions at ${company.name} on Git City.`,
  };
}

function getLogoSrc(website: string | null): string | null {
  if (!website) return null;
  try { return `https://www.google.com/s2/favicons?domain=${new URL(website).hostname}&sz=128`; }
  catch { return null; }
}

function fmtSalary(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return String(n);
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days < 1) return "Today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
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

  const logoSrc = company.logo_url || getLogoSrc(company.website);
  const jobCount = listings?.length ?? 0;

  return (
    <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <Link href="/jobs" className="text-xs text-dim transition-colors hover:text-muted">&larr; Back to Jobs</Link>

        {/* ─── Company header ─── */}
        <div className="mt-6 border-[3px] border-border bg-bg-raised p-6 sm:p-8">
          <div className="flex items-start gap-4">
            {/* Logo */}
            {logoSrc ? (
              <img src={logoSrc} alt={`${company.name} logo`} className="h-16 w-16 shrink-0 border-[3px] border-border object-cover bg-white/5" />
            ) : (
              <div className="h-16 w-16 shrink-0 flex items-center justify-center text-xl font-bold border-[3px] border-border text-white/80 bg-bg">
                {company.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl text-cream sm:text-3xl">{company.name}</h1>
              {company.description && (
                <p className="mt-2 text-xs text-cream-dark normal-case leading-relaxed">{company.description}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <a href={company.website} target="_blank" rel="noopener noreferrer" className="border-[2px] border-lime/20 px-3 py-1.5 text-xs text-lime transition-colors hover:border-lime/40">
                  Website &#8599;
                </a>
                {company.github_org && (
                  <a href={`https://github.com/${company.github_org}`} target="_blank" rel="noopener noreferrer" className="border-[2px] border-lime/20 px-3 py-1.5 text-xs text-lime transition-colors hover:border-lime/40">
                    GitHub &#8599;
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ─── Open positions ─── */}
        <div className="mt-8">
          <h2 className="text-xs text-muted/50 tracking-[0.15em]">
            {jobCount} open position{jobCount !== 1 ? "s" : ""}
          </h2>

          <div className="mt-4 space-y-3">
            {jobCount > 0 ? (
              listings!.map((job) => (
                <Link
                  key={job.id}
                  href={`/jobs/${job.id}`}
                  className="block border-[3px] border-border bg-bg-raised p-5 transition-colors hover:border-border-light"
                >
                  <h3 className="text-sm text-cream">{job.title}</h3>
                  <p className="mt-1 text-xs text-muted">
                    {SENIORITY_LABELS[job.seniority]} · {ROLE_TYPE_LABELS[job.role_type]}
                    {job.location_type && <> · {LOCATION_TYPE_LABELS[job.location_type]}</>}
                    {job.contract_type && <> · {CONTRACT_LABELS[job.contract_type]}</>}
                    {job.published_at && <> · {timeAgo(job.published_at)}</>}
                  </p>
                  <p className="mt-2 text-sm text-lime">
                    {job.salary_currency} {fmtSalary(job.salary_min)}-{fmtSalary(job.salary_max)}
                    <span className="text-xs text-dim ml-1">{SALARY_PERIOD_LABELS[job.salary_period] ?? "/mo"}</span>
                  </p>
                  {job.tech_stack?.length > 0 && (
                    <p className="mt-1.5 text-xs text-dim normal-case truncate">
                      {job.tech_stack.slice(0, 5).join(" · ")}
                      {job.tech_stack.length > 5 && ` +${job.tech_stack.length - 5}`}
                    </p>
                  )}
                </Link>
              ))
            ) : (
              <div className="border-[3px] border-border bg-bg-raised p-10 text-center">
                <p className="text-xs text-muted">No active listings right now.</p>
              </div>
            )}
          </div>
        </div>

        <div className="h-12" />
      </div>
    </main>
  );
}
