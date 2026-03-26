"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { JobListing } from "@/lib/jobs/types";
import {
  SENIORITY_LABELS,
  ROLE_TYPE_LABELS,
  CONTRACT_LABELS,
  WEB_TYPE_LABELS,
} from "@/lib/jobs/constants";

interface JobDetailData {
  listing: JobListing;
  hasApplied: boolean;
  hasCareerProfile: boolean;
  isPreview?: boolean;
}

export default function JobDetailClient({ listingId }: { listingId: string }) {
  const [data, setData] = useState<JobDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState(false);
  const [applied, setApplied] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reported, setReported] = useState(false);

  useEffect(() => {
    fetch(`/api/jobs/${listingId}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d) => {
        setData(d);
        setApplied(d.hasApplied);
      })
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
    } catch {
      setApplyError(true);
    }
    setApplying(false);
  };

  const handleCopyProfile = async () => {
    if (!data?.hasCareerProfile) {
      window.location.href = `/jobs/career-profile?returnTo=/jobs/${listingId}`;
      return;
    }
    try {
      const res = await fetch("/api/me");
      if (!res.ok) throw new Error("Failed to fetch profile");
      const me = await res.json();
      if (!me.github_login) throw new Error("No username");
      const url = `${window.location.origin}/dev/${me.github_login}/career`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);

      // Track profile_copy event + increment counter
      fetch(`/api/jobs/${listingId}/track-profile`, { method: "POST" }).catch(() => {});
    } catch {
      setCopyError(true);
      setTimeout(() => setCopyError(false), 3000);
    }
  };

  const handleReport = async () => {
    if (!reportReason) return;
    await fetch(`/api/jobs/${listingId}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reportReason }),
    });
    setReported(true);
    setShowReport(false);
  };

  // ── Loading ──
  if (loading) {
    return (
      <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
        <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
          <div className="h-4 w-24 animate-pulse bg-border" />
          <div className="mt-6 h-8 w-2/3 animate-pulse bg-border" />
          <div className="mt-3 h-4 w-1/3 animate-pulse bg-border" />
          <div className="mt-6 border-[3px] border-border bg-bg-raised p-6">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i}>
                  <div className="h-3 w-12 animate-pulse bg-border" />
                  <div className="mt-2 h-5 w-20 animate-pulse bg-border" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    );
  }

  // ── Error / Not found ──
  if (fetchError || !data?.listing) {
    return (
      <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
        <div className="mx-auto max-w-2xl px-4 py-20 text-center space-y-4">
          <p className="text-sm text-muted">{fetchError ? "Failed to load listing" : "Listing not found"}</p>
          {fetchError && (
            <button
              onClick={() => { setFetchError(false); setLoading(true); window.location.reload(); }}
              className="btn-press border-[3px] border-border px-5 py-2 text-xs text-cream"
            >
              Try Again
            </button>
          )}
          <div>
            <Link href="/jobs" className="text-sm text-lime transition-colors hover:text-cream">
              &lt; Back to jobs
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const job = data.listing;
  const daysLeft = job.expires_at
    ? Math.max(0, Math.ceil((new Date(job.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  return (
    <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        {/* Back */}
        <Link href="/jobs" className="text-sm text-muted transition-colors hover:text-cream">
          &lt; Back to jobs
        </Link>

        {/* Preview banner */}
        {data.isPreview && (
          <div className="mt-4 border-[3px] border-yellow-500/40 bg-yellow-500/5 px-5 py-3">
            <p className="text-xs text-yellow-500 normal-case">
              Preview mode — this listing is not live yet ({job.status.replace("_", " ")})
            </p>
          </div>
        )}

        {/* Title + Company */}
        <div className="mt-6">
          {(job.tier === "featured" || job.tier === "premium") && (
            <span
              className="mb-2 inline-block border-[3px] px-2.5 py-1 text-xs"
              style={{
                borderColor: job.tier === "premium" ? "#fbbf24" : "#c8e64a",
                color: job.tier === "premium" ? "#fbbf24" : "#c8e64a",
              }}
            >
              {job.tier === "premium" ? "Premium" : "Featured"}
            </span>
          )}
          <h1 className="text-2xl text-cream sm:text-3xl">{job.title}</h1>
          <p className="mt-2 text-sm text-muted">
            {job.company?.name ?? "Company"} · {SENIORITY_LABELS[job.seniority]} · {ROLE_TYPE_LABELS[job.role_type]}
          </p>
        </div>

        {/* Quick stats */}
        <div className="mt-6 border-[3px] border-border bg-bg-raised p-5 sm:p-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <span className="text-xs text-muted">Salary</span>
              <p className="mt-1 text-base text-lime">
                {job.salary_currency} {job.salary_min.toLocaleString()}–{job.salary_max.toLocaleString()}
                <span className="text-xs text-dim ml-1">/mo</span>
              </p>
            </div>
            <div>
              <span className="text-xs text-muted">Web</span>
              <p className="mt-1 text-sm text-cream">{WEB_TYPE_LABELS[job.web_type]}</p>
            </div>
            <div>
              <span className="text-xs text-muted">Contract</span>
              <p className="mt-1 text-sm text-cream">{CONTRACT_LABELS[job.contract_type]}</p>
            </div>
            {daysLeft !== null && (
              <div>
                <span className="text-xs text-muted">Expires</span>
                <p className="mt-1 text-sm text-cream">{daysLeft}d left</p>
              </div>
            )}
          </div>

          {/* Trust badges — always show Verified + Salary Visible */}
          <div className="mt-4 flex flex-wrap gap-2 border-t border-border/50 pt-4">
            <span className="border-[3px] border-lime/30 px-3 py-1 text-xs text-lime">
              Verified
            </span>
            <span className="border-[3px] border-lime/30 px-3 py-1 text-xs text-lime">
              Salary Visible
            </span>
            {job.badge_response_guaranteed && (
              <span className="border-[3px] border-lime/30 px-3 py-1 text-xs text-lime">
                Response Guaranteed
              </span>
            )}
            {job.badge_no_ai_screening && (
              <span className="border-[3px] border-lime/30 px-3 py-1 text-xs text-lime">
                No AI Screening
              </span>
            )}
          </div>
        </div>

        {/* Tech stack */}
        {job.tech_stack.length > 0 && (
          <div className="mt-3 border-[3px] border-border bg-bg-raised p-5 sm:p-6">
            <span className="text-xs text-muted">Tech Stack</span>
            <div className="mt-3 flex flex-wrap gap-2">
              {job.tech_stack.map((tag) => (
                <span
                  key={tag}
                  className="border-[3px] px-3 py-1 text-xs"
                  style={{ borderColor: "rgba(200,230,74,0.3)", color: "#c8e64a" }}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Description */}
        <div className="mt-3 border-[3px] border-border bg-bg-raised p-5 sm:p-6">
          <span className="text-xs text-muted">Description</span>
          <div className="tiptap mt-3 text-sm text-cream-dark normal-case leading-relaxed" dangerouslySetInnerHTML={{ __html: job.description }} />
          {job.language_pt_br && (
            <div className="mt-5 border-t border-border/50 pt-5">
              <span className="text-xs text-muted">Descri&ccedil;&atilde;o (PT-BR)</span>
              <div className="mt-3 text-sm text-cream-dark normal-case leading-relaxed whitespace-pre-wrap">
                {job.language_pt_br}
              </div>
            </div>
          )}
        </div>

        {/* Company info */}
        {job.company && (
          <div className="mt-3 border-[3px] border-border bg-bg-raised p-5 sm:p-6">
            <span className="text-xs text-muted">Company</span>
            <div className="mt-3 space-y-2">
              <p className="text-base text-cream">{job.company.name}</p>
              {job.company.description && (
                <p className="text-xs text-cream-dark normal-case leading-relaxed">{job.company.description}</p>
              )}
              <div className="flex gap-4 pt-1">
                <a
                  href={job.company.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-lime transition-colors hover:text-cream"
                >
                  Website
                </a>
                {job.company.github_org && (
                  <a
                    href={`https://github.com/${job.company.github_org}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-lime transition-colors hover:text-cream"
                  >
                    GitHub
                  </a>
                )}
                <Link
                  href={`/jobs/company/${job.company.slug}`}
                  className="text-xs text-lime transition-colors hover:text-cream"
                >
                  All Listings
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Action buttons — hidden in preview mode */}
        {!data.isPreview && (
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button
              onClick={handleApply}
              disabled={applying}
              className="btn-press flex-1 bg-lime py-4 text-sm text-bg disabled:opacity-50"
              style={{ boxShadow: "4px 4px 0 0 #5a7a00" }}
            >
              {applied ? "Applied — open again" : applying ? "Applying..." : "Apply"}
            </button>
            <button
              onClick={handleCopyProfile}
              className="btn-press flex-1 border-[3px] border-border py-4 text-sm text-cream transition-colors hover:border-border-light"
            >
              {copyError
                ? "Failed to copy — try again"
                : copied
                  ? "Copied!"
                  : data.hasCareerProfile
                    ? "Copy my career profile link"
                    : "Create Career Profile first"}
            </button>
          </div>
        )}

        {/* Apply error */}
        {applyError && (
          <div className="mt-3 border-[3px] border-red-500/30 bg-red-500/5 px-4 py-3">
            <p className="text-xs text-red-400 normal-case">Failed to apply. Please try again.</p>
          </div>
        )}

        {/* Report */}
        <div className="mt-8 text-center">
          {!reported ? (
            !showReport ? (
              <button
                onClick={() => setShowReport(true)}
                className="text-xs text-dim transition-colors hover:text-muted"
              >
                Report this listing
              </button>
            ) : (
              <div className="border-[3px] border-border bg-bg-raised p-5 text-left space-y-3">
                <p className="text-xs text-muted">Why are you reporting this?</p>
                <div className="flex flex-wrap gap-2">
                  {["Spam", "Misleading salary", "Fake company", "Already filled", "Other"].map((r) => (
                    <button
                      key={r}
                      onClick={() => setReportReason(r)}
                      aria-pressed={reportReason === r}
                      className="border-[3px] px-3 py-1.5 text-xs transition-colors"
                      style={{
                        borderColor: reportReason === r ? "#c8e64a" : "var(--color-border)",
                        color: reportReason === r ? "#c8e64a" : "var(--color-muted)",
                      }}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleReport}
                    disabled={!reportReason}
                    className="btn-press border-[3px] border-red-500/40 px-5 py-2 text-xs text-red-400 disabled:opacity-30"
                  >
                    Submit Report
                  </button>
                  <button
                    onClick={() => { setShowReport(false); setReportReason(""); }}
                    className="px-5 py-2 text-xs text-dim transition-colors hover:text-muted"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )
          ) : (
            <span className="text-xs text-muted">Report submitted. Thanks.</span>
          )}
        </div>

        <div className="h-12" />
      </div>
    </main>
  );
}
