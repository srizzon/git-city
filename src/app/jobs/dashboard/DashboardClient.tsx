"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { JobCompanyProfile, JobListing } from "@/lib/jobs/types";

const STATUS_COLORS: Record<string, string> = {
  draft: "#8c8c9c",
  pending_review: "#fbbf24",
  active: "#4ade80",
  paused: "#fbbf24",
  filled: "#c8e64a",
  expired: "#8c8c9c",
  rejected: "#ef4444",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending_review: "In Review",
  active: "Active",
  paused: "Paused",
  filled: "Filled",
  expired: "Expired",
  rejected: "Rejected",
};

export default function DashboardClient({ advertiserEmail }: { advertiserEmail: string }) {
  const [company, setCompany] = useState<JobCompanyProfile | null>(null);
  const [listings, setListings] = useState<JobListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [setupMode, setSetupMode] = useState(false);

  // Setup form
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [githubOrg, setGithubOrg] = useState("");
  const [savingSetup, setSavingSetup] = useState(false);
  const [setupError, setSetupError] = useState("");

  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    fetchDashboard();

    // Handle ?posted= param from successful Stripe checkout
    const params = new URLSearchParams(window.location.search);
    if (params.get("posted")) {
      setSuccessMessage("Payment received! Your listing is now under review.");
      // Clear the job posting draft from localStorage
      localStorage.removeItem("gc_post_job_draft");
      // Clean URL
      window.history.replaceState({}, "", "/jobs/dashboard");
    }
  }, []);

  async function fetchDashboard() {
    setLoading(true);
    setError(false);
    try {
      const compRes = await fetch("/api/jobs/company");
      if (!compRes.ok) throw new Error();
      const { company: comp } = await compRes.json();
      setCompany(comp);
      if (!comp) {
        setSetupMode(true);
      } else {
        const listRes = await fetch("/api/jobs/dashboard");
        if (!listRes.ok) throw new Error();
        const data = await listRes.json();
        setListings(data.listings ?? []);
      }
    } catch {
      setError(true);
    }
    setLoading(false);
  }

  async function handleSetup() {
    setSetupError("");
    setSavingSetup(true);

    const res = await fetch("/api/jobs/company", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, website, slug, description, github_org: githubOrg }),
    });

    if (res.ok) {
      const { company: comp } = await res.json();
      setCompany(comp);
      setSetupMode(false);
    } else {
      const d = await res.json();
      setSetupError(d.error ?? "Failed to create profile");
    }
    setSavingSetup(false);
  }

  const handleNameChange = (val: string) => {
    setName(val);
    const autoSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    if (!slug || slug === autoSlug) {
      setSlug(val.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""));
    }
  };

  async function handleListingAction(listingId: string, action: string) {
    if (action === "fill") {
      if (!confirm("Mark as filled? This will remove the listing from the job board.")) return;
    }
    if (action === "delete") {
      if (!confirm("Delete this listing? This cannot be undone.")) return;
      await fetch(`/api/jobs/${listingId}/manage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete" }),
      });
      setListings((prev) => prev.filter((l) => l.id !== listingId));
      return;
    }

    if (action === "checkout") {
      // Retry payment — use listing's saved tier
      const listing = listings.find((l) => l.id === listingId);
      const res = await fetch("/api/jobs/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listing_id: listingId, tier: listing?.tier ?? "standard" }),
      });
      if (res.ok) {
        const { url } = await res.json();
        window.location.href = url;
      }
      return;
    }

    // pause, resume, fill
    const res = await fetch(`/api/jobs/${listingId}/manage`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (res.ok) {
      fetchDashboard(); // reload
    }
  }

  const inputClass = "w-full border-[3px] border-border bg-bg px-4 py-3 text-sm text-cream normal-case outline-none placeholder:text-dim focus-visible:border-lime";

  // ── Loading ──
  if (loading) {
    return (
      <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
        <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
          <div className="h-8 w-48 animate-pulse bg-border" />
          <div className="mt-3 h-4 w-32 animate-pulse bg-border" />
          <div className="mt-8 space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="border-[3px] border-border bg-bg-raised p-6">
                <div className="h-5 w-2/3 animate-pulse bg-border" />
                <div className="mt-3 h-4 w-1/3 animate-pulse bg-border" />
              </div>
            ))}
          </div>
        </div>
      </main>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
        <div className="mx-auto max-w-3xl px-4 py-20 text-center space-y-4">
          <p className="text-sm text-red-400 normal-case">Failed to load dashboard</p>
          <button
            onClick={fetchDashboard}
            className="btn-press border-[3px] border-border px-5 py-2 text-xs text-cream"
          >
            Try Again
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl text-lime sm:text-3xl">
              {company ? company.name : "Company Dashboard"}
            </h1>
            <p className="mt-2 text-xs text-dim normal-case">{advertiserEmail}</p>
          </div>
          {company && (
            <Link
              href="/jobs/dashboard/new"
              className="btn-press bg-lime px-5 py-3 text-sm text-bg"
              style={{ boxShadow: "3px 3px 0 0 #5a7a00" }}
            >
              Post a Job
            </Link>
          )}
        </div>

        {/* Success message from Stripe */}
        {successMessage && (
          <div className="mt-6 border-[3px] border-lime/30 bg-lime/5 px-5 py-4 flex items-center justify-between">
            <p className="text-sm text-lime normal-case">{successMessage}</p>
            <button onClick={() => setSuccessMessage("")} className="text-xs text-dim hover:text-cream ml-4">
              Dismiss
            </button>
          </div>
        )}

        {/* ── Setup form ── */}
        {setupMode && (
          <div className="mt-8 border-[3px] border-border bg-bg-raised p-6 sm:p-8 space-y-6">
            <div>
              <h2 className="text-base text-cream">Set up your company profile</h2>
              <p className="mt-2 text-sm text-muted normal-case">
                This is shown to developers when they view your listings.
              </p>
            </div>

            <div>
              <label htmlFor="setup-name" className="text-xs text-cream">
                Company name <span className="text-lime">*</span>
              </label>
              <input
                id="setup-name"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Acme Corp"
                className={`${inputClass} mt-2`}
                style={{ fontFamily: "inherit" }}
              />
            </div>

            <div>
              <label htmlFor="setup-url" className="text-xs text-cream">
                Profile URL <span className="text-lime">*</span>
              </label>
              <div className="mt-2 flex items-center border-[3px] border-border bg-bg">
                <span className="shrink-0 px-3 text-xs text-dim normal-case">thegitcity.com/jobs/company/</span>
                <input
                  id="setup-url"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  placeholder="acme-corp"
                  className="w-full bg-transparent px-2 py-3 text-sm text-cream normal-case outline-none"
                  style={{ fontFamily: "inherit" }}
                />
              </div>
            </div>

            <div>
              <label htmlFor="setup-website" className="text-xs text-cream">
                Website <span className="text-lime">*</span>
              </label>
              <input
                id="setup-website"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://acme.com"
                className={`${inputClass} mt-2`}
                style={{ fontFamily: "inherit" }}
              />
            </div>

            <div>
              <label htmlFor="setup-desc" className="text-xs text-cream">Description</label>
              <textarea
                id="setup-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does your company do?"
                rows={3}
                className={`${inputClass} mt-2 resize-none`}
                style={{ fontFamily: "inherit" }}
              />
            </div>

            <div>
              <label htmlFor="setup-gh" className="text-xs text-muted">GitHub org</label>
              <p className="mt-1 text-xs text-dim normal-case">Optional — links to your org on GitHub</p>
              <input
                id="setup-gh"
                value={githubOrg}
                onChange={(e) => setGithubOrg(e.target.value)}
                placeholder="acme-corp"
                className={`${inputClass} mt-2`}
                style={{ fontFamily: "inherit" }}
              />
            </div>

            {setupError && (
              <div className="border-[3px] border-red-500/30 bg-red-500/5 px-4 py-3">
                <p className="text-sm text-red-400 normal-case">{setupError}</p>
              </div>
            )}

            <button
              onClick={handleSetup}
              disabled={savingSetup || !name || !website || !slug}
              className="btn-press w-full bg-lime py-4 text-sm text-bg disabled:opacity-50"
              style={{ boxShadow: "4px 4px 0 0 #5a7a00" }}
            >
              {savingSetup ? "Creating..." : "Create Company Profile"}
            </button>
          </div>
        )}

        {/* ── Listings ── */}
        {company && !setupMode && (
          <div className="mt-8" aria-live="polite">
            {listings.length === 0 ? (
              <div className="border-[3px] border-border bg-bg-raised p-10 text-center space-y-4">
                <p className="text-sm text-muted">No listings yet.</p>
                <Link
                  href="/jobs/dashboard/new"
                  className="btn-press inline-block bg-lime px-6 py-4 text-sm text-bg"
                  style={{ boxShadow: "4px 4px 0 0 #5a7a00" }}
                >
                  Post your first job
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {listings.map((listing) => {
                  const daysLeft = listing.expires_at
                    ? Math.max(0, Math.ceil((new Date(listing.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
                    : null;

                  return (
                    <div
                      key={listing.id}
                      className="border-[3px] border-border bg-bg-raised p-5 sm:p-6"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <h3 className="text-base text-cream truncate">{listing.title}</h3>
                          <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-muted">
                            <span>{listing.view_count} views</span>
                            <span>{listing.apply_count} applies</span>
                            <span>{listing.profile_count} profiles</span>
                          </div>
                        </div>
                        <div className="shrink-0 flex items-center gap-3">
                          {daysLeft !== null && listing.status === "active" && (
                            <span className="text-xs text-dim">{daysLeft}d left</span>
                          )}
                          <span
                            className="border-[3px] px-3 py-1 text-xs"
                            style={{
                              borderColor: (STATUS_COLORS[listing.status] ?? "#8c8c9c") + "66",
                              color: STATUS_COLORS[listing.status] ?? "#8c8c9c",
                            }}
                          >
                            {STATUS_LABELS[listing.status] ?? listing.status}
                          </span>
                        </div>
                      </div>

                      {/* Actions per status */}
                      <div className="mt-4 border-t border-border/50 pt-4 space-y-3">
                        {listing.status === "draft" && (
                          <>
                            <p className="text-xs text-muted normal-case">
                              This listing hasn&apos;t been submitted yet. Complete payment to send it for review.
                            </p>
                            <div className="flex flex-wrap gap-3">
                              <button onClick={() => handleListingAction(listing.id, "checkout")} className="text-xs text-lime transition-colors hover:text-cream cursor-pointer">
                                Continue to Payment
                              </button>
                              <button onClick={() => handleListingAction(listing.id, "delete")} className="text-xs text-dim transition-colors hover:text-red-400 cursor-pointer">
                                Delete Draft
                              </button>
                            </div>
                          </>
                        )}

                        {listing.status === "pending_review" && (
                          <>
                            <div className="text-xs text-muted normal-case space-y-1">
                              <p>Your listing is being reviewed by our team. This usually takes less than 24 hours.</p>
                              <p className="text-dim">Once approved, it goes live for 30 days. We&apos;ll email you when it&apos;s ready.</p>
                            </div>
                            <div className="flex flex-wrap gap-3">
                              <Link href={`/jobs/${listing.id}`} className="text-xs text-lime transition-colors hover:text-cream cursor-pointer">
                                Preview Listing
                              </Link>
                            </div>
                          </>
                        )}

                        {listing.status === "active" && (
                          <div className="flex flex-wrap gap-3">
                            <Link href={`/jobs/dashboard/${listing.id}/candidates`} className="text-xs text-lime transition-colors hover:text-cream cursor-pointer">
                              View Candidates
                            </Link>
                            <Link href={`/jobs/${listing.id}`} className="text-xs text-muted transition-colors hover:text-cream cursor-pointer">
                              View Listing
                            </Link>
                            <button onClick={() => handleListingAction(listing.id, "pause")} className="text-xs text-muted transition-colors hover:text-cream cursor-pointer">
                              Pause
                            </button>
                            <button onClick={() => handleListingAction(listing.id, "fill")} className="text-xs text-muted transition-colors hover:text-cream cursor-pointer">
                              Mark as Filled
                            </button>
                          </div>
                        )}

                        {listing.status === "paused" && (
                          <>
                            <p className="text-xs text-muted normal-case">
                              This listing is paused and hidden from the job board. The expiration date remains unchanged.
                            </p>
                            <div className="flex flex-wrap gap-3">
                              <button onClick={() => handleListingAction(listing.id, "resume")} className="text-xs text-lime transition-colors hover:text-cream cursor-pointer">
                                Resume Listing
                              </button>
                              <Link href={`/jobs/${listing.id}`} className="text-xs text-muted transition-colors hover:text-cream cursor-pointer">
                                Preview
                              </Link>
                              <button onClick={() => handleListingAction(listing.id, "fill")} className="text-xs text-muted transition-colors hover:text-cream cursor-pointer">
                                Mark as Filled
                              </button>
                            </div>
                          </>
                        )}

                        {listing.status === "rejected" && (
                          <>
                            {listing.rejection_reason && (
                              <p className="text-xs text-red-400 normal-case">
                                Reason: {listing.rejection_reason}
                              </p>
                            )}
                            <p className="text-xs text-muted normal-case">
                              You can edit and resubmit within 7 days, or delete and get a full refund.
                            </p>
                            <div className="flex flex-wrap gap-3">
                              <Link href={`/jobs/${listing.id}`} className="text-xs text-lime transition-colors hover:text-cream cursor-pointer">
                                Preview
                              </Link>
                              <button onClick={() => handleListingAction(listing.id, "delete")} className="text-xs text-dim transition-colors hover:text-red-400 cursor-pointer">
                                Delete &amp; Refund
                              </button>
                            </div>
                          </>
                        )}

                        {listing.status === "expired" && (
                          <>
                            <p className="text-xs text-muted normal-case">
                              This listing expired after 30 days. You can repost it with a new payment.
                            </p>
                            <div className="flex flex-wrap gap-3">
                              <button onClick={() => handleListingAction(listing.id, "checkout")} className="text-xs text-lime transition-colors hover:text-cream cursor-pointer">
                                Repost
                              </button>
                              <Link href={`/jobs/${listing.id}`} className="text-xs text-muted transition-colors hover:text-cream cursor-pointer">
                                View
                              </Link>
                            </div>
                          </>
                        )}

                        {listing.status === "filled" && (
                          <p className="text-xs text-muted normal-case">
                            This position has been filled. Thanks for hiring on Git City!
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="h-12" />
      </div>
    </main>
  );
}
