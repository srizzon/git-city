"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { JobListing } from "@/lib/jobs/types";
import DOMPurify from "isomorphic-dompurify";
import {
  SENIORITY_LABELS,
  ROLE_TYPE_LABELS,
  CONTRACT_LABELS,
  WEB_TYPE_LABELS,
  LOCATION_TYPE_LABELS,
  LOCATION_RESTRICTION_LABELS,
  SALARY_PERIOD_LABELS,
  BENEFITS_LIST,
} from "@/lib/jobs/constants";

const SAFE_HTML = {
  ALLOWED_TAGS: ["p", "br", "strong", "em", "u", "s", "a", "ul", "ol", "li", "h1", "h2", "h3", "blockquote", "code", "pre"],
  ALLOWED_ATTR: ["href", "target", "rel"],
};

interface JobDetailData {
  listing: JobListing;
  hasApplied: boolean;
  hasCareerProfile: boolean;
  isAuthenticated: boolean;
  isPreview?: boolean;
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function companyGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const h1 = Math.abs(hash % 360);
  const h2 = (h1 + 40 + Math.abs((hash >> 8) % 60)) % 360;
  return `linear-gradient(135deg, hsl(${h1}, 60%, 45%), hsl(${h2}, 50%, 35%))`;
}

export default function JobDetailClient({ listingId }: { listingId: string }) {
  const [data, setData] = useState<JobDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState(false);
  const [applied, setApplied] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reported, setReported] = useState(false);

  useEffect(() => {
    fetch(`/api/jobs/${listingId}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => { setData(d); setApplied(d.hasApplied); })
      .catch(() => setFetchError(true))
      .finally(() => setLoading(false));
  }, [listingId]);

  const handleApply = async () => {
    if (applying) return;
    setApplying(true);
    setApplyError(false);
    try {
      const res = await fetch(`/api/jobs/${listingId}/apply`, { method: "POST" });
      if (!res.ok) throw new Error();
      const { apply_url } = await res.json();
      setApplied(true);
      window.open(apply_url, "_blank");
    } catch { setApplyError(true); }
    setApplying(false);
  };


  const handleReport = async () => {
    if (!reportReason) return;
    try {
      const res = await fetch(`/api/jobs/${listingId}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reportReason }),
      });
      if (!res.ok) return;
    } catch { return; }
    setReported(true);
    setShowReport(false);
  };

  /* ── Loading ── */
  if (loading) {
    return (
      <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
        <div className="mx-auto max-w-[1400px] px-4 py-8 sm:py-12">
          <div className="h-3 w-20 animate-pulse bg-border" />
          <div className="mt-6 lg:flex lg:gap-6">
            <div className="lg:w-[420px] lg:shrink-0 space-y-3">
              <div className="border-[3px] border-border bg-bg-raised p-6 space-y-4">
                <div className="h-12 w-12 animate-pulse bg-border" />
                <div className="h-6 w-3/4 animate-pulse bg-border" />
                <div className="h-3 w-1/2 animate-pulse bg-border" />
                <div className="h-10 w-full animate-pulse bg-border mt-4" />
              </div>
            </div>
            <div className="flex-1 mt-6 lg:mt-0 space-y-3">
              <div className="border-[3px] border-border bg-bg-raised p-6 space-y-3">
                <div className="h-3 w-full animate-pulse bg-border" />
                <div className="h-3 w-5/6 animate-pulse bg-border" />
                <div className="h-3 w-4/6 animate-pulse bg-border" />
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  /* ── Error ── */
  if (fetchError || !data?.listing) {
    return (
      <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
        <div className="mx-auto max-w-2xl px-4 py-20 text-center space-y-4">
          <p className="text-sm text-muted">{fetchError ? "Failed to load listing" : "Listing not found"}</p>
          {fetchError && (
            <button onClick={() => window.location.reload()} className="btn-press border-[3px] border-border px-5 py-2 text-xs text-cream">
              Try Again
            </button>
          )}
          <div>
            <Link href="/jobs" className="text-sm text-lime transition-colors hover:text-cream">&larr; Back to jobs</Link>
          </div>
        </div>
      </main>
    );
  }

  const job = data.listing;
  const companyName = job.company?.name ?? "Company";
  const isPremium = job.tier === "premium";
  const isFeatured = job.tier === "featured";
  const accent = isPremium ? "#fbbf24" : "#c8e64a";
  const shadow = isPremium ? "#b8860b" : "#5a7a00";

  const daysLeft = job.expires_at
    ? Math.max(0, Math.ceil((new Date(job.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  return (
    <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
      <div className="mx-auto max-w-[1400px] px-4 py-8 sm:py-12">

        <Link href="/jobs" className="text-[10px] text-dim transition-colors hover:text-muted">
          &larr; Back to Jobs
        </Link>

        {/* Preview banner */}
        {data.isPreview && (
          <div className="mt-4 border-[3px] border-yellow-500/40 bg-yellow-500/5 px-5 py-3">
            <p className="text-xs text-yellow-500 normal-case">
              Preview mode - this listing is not live yet ({job.status.replace("_", " ")})
            </p>
          </div>
        )}

        <div className="mt-6 lg:flex lg:gap-6 lg:items-start">

          {/* ─── Left: Sticky sidebar ─── */}
          <div className="lg:w-[420px] lg:shrink-0 lg:sticky lg:top-6 space-y-3">

            {/* Job card */}
            <div
              className="border-[3px] p-6"
              style={{
                borderColor: isPremium ? "rgba(251,191,36,0.3)" : isFeatured ? "rgba(200,230,74,0.2)" : "var(--color-border)",
                background: isPremium
                  ? "linear-gradient(180deg, rgba(251,191,36,0.06) 0%, var(--color-bg-raised) 100%)"
                  : isFeatured
                    ? "rgba(200,230,74,0.02)"
                    : "var(--color-bg-raised)",
              }}
            >
              {/* Company */}
              <div className="flex items-center gap-3">
                <CompanyAvatar name={companyName} logoUrl={job.company?.logo_url} website={job.company?.website} />
                <div className="min-w-0">
                  <p className="text-xs text-cream truncate">{companyName}</p>
                  {job.published_at && <p className="text-[10px] text-dim">{timeAgo(job.published_at)}</p>}
                </div>
              </div>

              {/* Badge + Title */}
              <div className="mt-4">
                {(isPremium || isFeatured) && (
                  <span className="inline-block border-[2px] px-2 py-0.5 text-[8px] mb-2" style={{ borderColor: `${accent}50`, color: accent }}>
                    {isPremium ? "Premium" : "Featured"}
                  </span>
                )}
                <h1 className="text-xl text-cream sm:text-2xl leading-snug">{job.title}</h1>
              </div>

              {/* Salary */}
              <p className="mt-5 text-xl" style={{ color: accent }}>
                {job.salary_currency} {job.salary_min.toLocaleString()}-{job.salary_max.toLocaleString()}
                <span className="text-xs text-dim ml-1">{SALARY_PERIOD_LABELS[job.salary_period] ?? "/mo"}</span>
              </p>

              {/* Location */}
              <p className="mt-2 text-xs text-cream">
                {LOCATION_TYPE_LABELS[job.location_type] ?? "Remote"}
                {job.location_type !== "remote" && job.location_city && <> · {job.location_city}</>}
                {job.location_type === "remote" && <> · {LOCATION_RESTRICTION_LABELS[job.location_restriction] ?? "Worldwide"}</>}
              </p>

              {/* Details line */}
              <p className="mt-1 text-xs text-muted">
                {CONTRACT_LABELS[job.contract_type]}
                {job.location_timezone && <> · {job.location_timezone}</>}
                {daysLeft !== null && <> · {daysLeft}d left</>}
              </p>

              {/* Badges */}
              {(job.badge_response_guaranteed || job.badge_no_ai_screening) && (
                <div className="mt-2 flex gap-2">
                  {job.badge_response_guaranteed && <span className="text-xs" style={{ color: `${accent}aa` }}>Response OK</span>}
                  {job.badge_no_ai_screening && <span className="text-xs" style={{ color: `${accent}aa` }}>No AI Screening</span>}
                </div>
              )}

              {/* Tech stack */}
              {job.tech_stack.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {job.tech_stack.map((tag) => (
                    <span key={tag} className="border-[2px] px-2 py-0.5 text-[10px]" style={{ borderColor: `${accent}25`, color: `${accent}cc` }}>
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Apply actions */}
              {!data.isPreview && (
                <div className="mt-5 space-y-2">
                  {!data.isAuthenticated ? (
                    <>
                      <a
                        href={`/api/auth/github?redirect=/jobs/${job.id}`}
                        className="btn-press block w-full py-3.5 text-xs text-bg text-center"
                        style={{ backgroundColor: accent, boxShadow: `3px 3px 0 0 ${shadow}` }}
                      >
                        Sign in to Apply
                      </a>
                      <p className="text-[10px] text-dim normal-case text-center">Sign in with GitHub to apply and track your applications</p>
                    </>
                  ) : applied ? (
                    <>
                      <div className="w-full border-[3px] py-3.5 text-xs text-center" style={{ borderColor: `${accent}40`, color: accent }}>
                        You applied to this job
                      </div>
                      <button
                        onClick={handleApply}
                        className="btn-press w-full cursor-pointer border-[3px] border-border py-2.5 text-xs text-muted transition-colors hover:border-border-light hover:text-cream"
                      >
                        Open application page again
                      </button>
                      <a
                        href="/jobs/my-applications"
                        className="block w-full py-2 text-center text-xs text-muted/40 transition-colors hover:text-muted normal-case"
                      >
                        View all my applications
                      </a>
                    </>
                  ) : (
                    <button
                      onClick={handleApply}
                      disabled={applying}
                      className="btn-press w-full py-3.5 text-xs text-bg disabled:opacity-50"
                      style={{ backgroundColor: accent, boxShadow: `3px 3px 0 0 ${shadow}` }}
                    >
                      {applying ? "Applying..." : "Apply Now"}
                    </button>
                  )}
                  {data.isAuthenticated && !applied && !data.hasCareerProfile && (
                    <Link
                      href={`/hire/edit?returnTo=/jobs/${job.id}`}
                      className="block w-full border-[3px] border-border py-2.5 text-xs text-center text-muted transition-colors hover:border-border-light hover:text-cream normal-case"
                    >
                      Complete your career profile to stand out
                    </Link>
                  )}
                </div>
              )}

              {applyError && (
                <p className="mt-2 text-xs text-red-400 normal-case">Failed to apply. Please try again.</p>
              )}
            </div>

            {/* Company card */}
            {job.company && (
              <div className="border-[3px] border-border bg-bg-raised p-5">
                {/* Big logo */}
                <div className="flex justify-center">
                  <CompanyAvatarLg name={job.company.name} logoUrl={job.company.logo_url} website={job.company.website} />
                </div>
                <p className="mt-3 text-sm text-cream text-center">{job.company.name}</p>
                {job.company.description && (
                  <p className="mt-1.5 text-[10px] text-cream-dark normal-case leading-relaxed text-center line-clamp-3">{job.company.description}</p>
                )}
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <a
                    href={job.company.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block border-[3px] border-lime/20 px-3 py-2.5 text-[10px] text-center text-lime transition-colors hover:border-lime/40 hover:bg-lime/5"
                  >
                    Website &#8599;
                  </a>
                  {job.company.github_org && (
                    <a
                      href={`https://github.com/${job.company.github_org}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block border-[3px] border-lime/20 px-3 py-2.5 text-[10px] text-center text-lime transition-colors hover:border-lime/40 hover:bg-lime/5"
                    >
                      GitHub &#8599;
                    </a>
                  )}
                  <Link
                    href={`/jobs/company/${job.company.slug}`}
                    className={`block border-[3px] border-border px-3 py-2.5 text-[10px] text-center text-muted transition-colors hover:border-border-light hover:text-cream ${!job.company.github_org ? "" : "col-span-2"}`}
                  >
                    All Listings
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* ─── Right: Scrollable content ─── */}
          <div className="flex-1 min-w-0 mt-6 lg:mt-0 space-y-4">

            {/* Description */}
            <div className="border-[3px] border-border bg-bg-raised p-6 sm:p-8">
              <h2 className="text-xs text-muted/50 tracking-[0.15em] mb-5">About this role</h2>
              <div className="tiptap text-sm text-cream-dark normal-case leading-relaxed" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(job.description, SAFE_HTML) }} />
            </div>

            {/* Benefits */}
            {job.benefits && job.benefits.length > 0 && (
              <div className="border-[3px] border-border bg-bg-raised p-6 sm:p-8">
                <h2 className="text-xs text-muted/50 tracking-[0.15em] mb-5">Benefits</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {job.benefits.map((b) => {
                    const benefit = BENEFITS_LIST.find((bl) => bl.id === b);
                    return (
                      <p key={b} className="text-xs text-cream normal-case flex items-center gap-2">
                        <span className="text-lime">&#10003;</span>
                        {benefit?.label ?? b}
                      </p>
                    );
                  })}
                </div>
              </div>
            )}

            {/* How to apply */}
            {job.how_to_apply && (
              <div className="border-[3px] border-border bg-bg-raised p-6 sm:p-8">
                <h2 className="text-xs text-muted/50 tracking-[0.15em] mb-5">How to apply</h2>
                <div className="tiptap text-sm text-cream-dark normal-case leading-relaxed" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(job.how_to_apply, SAFE_HTML) }} />
              </div>
            )}

            {/* PT-BR description */}
            {job.language_pt_br && (
              <div className="border-[3px] border-border bg-bg-raised p-6 sm:p-8">
                <h2 className="text-xs text-muted/50 tracking-[0.15em] mb-5">Description (PT-BR)</h2>
                <div className="text-sm text-cream-dark normal-case leading-relaxed whitespace-pre-wrap">
                  {job.language_pt_br}
                </div>
              </div>
            )}

            {/* Report */}
            <div className="pt-4 text-center">
              {!reported ? (
                !showReport ? (
                  <button onClick={() => setShowReport(true)} className="text-[10px] text-dim transition-colors hover:text-muted cursor-pointer">
                    Report this listing
                  </button>
                ) : (
                  <div className="border-[3px] border-border bg-bg-raised p-5 text-left space-y-3">
                    <p className="text-[10px] text-muted">Why are you reporting this?</p>
                    <div className="flex flex-wrap gap-1.5">
                      {["Spam", "Misleading salary", "Fake company", "Already filled", "Other"].map((r) => (
                        <button
                          key={r}
                          onClick={() => setReportReason(r)}
                          aria-pressed={reportReason === r}
                          className="cursor-pointer border-[2px] px-2.5 py-1 text-[10px] transition-colors"
                          style={{
                            borderColor: reportReason === r ? "#c8e64a" : "var(--color-border)",
                            color: reportReason === r ? "#c8e64a" : "var(--color-muted)",
                            backgroundColor: reportReason === r ? "rgba(200,230,74,0.08)" : "transparent",
                          }}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={handleReport} disabled={!reportReason} className="btn-press border-[3px] border-red-500/40 px-4 py-1.5 text-[10px] text-red-400 disabled:opacity-30 cursor-pointer">
                        Submit
                      </button>
                      <button onClick={() => { setShowReport(false); setReportReason(""); }} className="px-4 py-1.5 text-[10px] text-dim hover:text-muted cursor-pointer">
                        Cancel
                      </button>
                    </div>
                  </div>
                )
              ) : (
                <p className="text-[10px] text-muted">Report submitted. Thanks.</p>
              )}
            </div>

            <div className="h-8" />
          </div>
        </div>
      </div>
    </main>
  );
}

/* ─── Shared ─── */

function getLogoSrc(logoUrl: string | null | undefined, website: string | null | undefined): string | null {
  if (logoUrl) return logoUrl;
  if (!website) return null;
  try {
    const domain = new URL(website).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
  } catch { return null; }
}

function CompanyAvatar({ name, logoUrl, website }: { name: string; logoUrl?: string | null; website?: string | null }) {
  const src = getLogoSrc(logoUrl, website);
  if (src) {
    return <img src={src} alt={`${name} logo`} className="h-11 w-11 shrink-0 border-[2px] border-border/40 object-cover bg-white/5" />;
  }
  return (
    <div className="h-11 w-11 shrink-0 flex items-center justify-center text-sm font-bold border-[2px] border-border/40 text-white/80" style={{ background: companyGradient(name) }}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function CompanyAvatarLg({ name, logoUrl, website }: { name: string; logoUrl?: string | null; website?: string | null }) {
  const src = getLogoSrc(logoUrl, website);
  if (src) {
    return <img src={src} alt={`${name} logo`} className="h-16 w-16 shrink-0 border-[3px] border-border object-cover bg-white/5" />;
  }
  return (
    <div className="h-16 w-16 shrink-0 flex items-center justify-center text-xl font-bold border-[3px] border-border text-white/80" style={{ background: companyGradient(name) }}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function Badge({ accent, children }: { accent: string; children: React.ReactNode }) {
  return (
    <span className="border-[2px] px-2 py-0.5 text-[9px]" style={{ borderColor: `${accent}25`, color: `${accent}90` }}>
      {children}
    </span>
  );
}
