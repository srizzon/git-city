"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { JobCompanyProfile, JobListing } from "@/lib/jobs/types";
import { SENIORITY_LABELS, ROLE_TYPE_LABELS, LOCATION_TYPE_LABELS, SALARY_PERIOD_LABELS } from "@/lib/jobs/constants";

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

const STATUS_FILTERS = ["all", "active", "pending_review", "paused", "draft", "filled", "expired", "rejected"] as const;

export default function DashboardClient({ advertiserEmail }: { advertiserEmail: string }) {
  const [company, setCompany] = useState<JobCompanyProfile | null>(null);
  const [listings, setListings] = useState<JobListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [setupMode, setSetupMode] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [showSettings, setShowSettings] = useState(false);

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
    const params = new URLSearchParams(window.location.search);
    if (params.get("posted") || params.get("published")) {
      setSuccessMessage(params.get("published") === "free"
        ? "Your listing has been submitted for review. We'll email you when it's live."
        : "Payment received! Your listing is now under review.");
      localStorage.removeItem("gc_post_job_draft");
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
    } catch { setError(true); }
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

  async function handleAction(listingId: string, action: string) {
    if (action === "fill" && !confirm("Mark as filled? This removes the listing from the job board.")) return;
    if (action === "delete" && !confirm("Delete this listing? This cannot be undone.")) return;

    if (action === "delete") {
      await fetch(`/api/jobs/${listingId}/manage`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete" }) });
      setListings((prev) => prev.filter((l) => l.id !== listingId));
      return;
    }

    if (action === "checkout") {
      const listing = listings.find((l) => l.id === listingId);
      const res = await fetch("/api/jobs/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listing_id: listingId, tier: listing?.tier ?? "standard" }) });
      if (res.ok) { const { url } = await res.json(); window.location.href = url; }
      return;
    }

    const res = await fetch(`/api/jobs/${listingId}/manage`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    if (res.ok) fetchDashboard();
  }

  // Stats
  const totalActive = listings.filter((l) => l.status === "active").length;
  const totalViews = listings.reduce((sum, l) => sum + l.view_count, 0);
  const totalApplies = listings.reduce((sum, l) => sum + l.apply_count, 0);

  // Filtered listings
  const filtered = statusFilter === "all" ? listings : listings.filter((l) => l.status === statusFilter);

  // Status counts for filter badges
  const statusCounts: Record<string, number> = {};
  for (const l of listings) statusCounts[l.status] = (statusCounts[l.status] ?? 0) + 1;

  const inputClass = "w-full border-[3px] border-border bg-bg px-4 py-3 text-sm text-cream normal-case outline-none placeholder:text-dim focus-visible:border-lime";

  if (loading) {
    return (
      <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
          <div className="h-6 w-48 animate-pulse bg-border" />
          <div className="mt-6 grid grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => <div key={i} className="border-[3px] border-border bg-bg-raised p-4 h-16 animate-pulse" />)}
          </div>
          <div className="mt-6 space-y-3">
            {[1, 2].map((i) => <div key={i} className="border-[3px] border-border bg-bg-raised p-6 h-28 animate-pulse" />)}
          </div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
        <div className="mx-auto max-w-5xl px-4 py-20 text-center space-y-4">
          <p className="text-sm text-red-400 normal-case">Failed to load dashboard</p>
          <button onClick={fetchDashboard} className="btn-press border-[3px] border-border px-5 py-2 text-xs text-cream cursor-pointer">Try Again</button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">

        {/* ─── Top nav ─── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/for-companies" className="text-xs text-dim transition-colors hover:text-muted">&larr; For Companies</Link>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-dim normal-case">{advertiserEmail}</span>
            <Link href="/api/ads/auth/logout" className="text-xs text-muted transition-colors hover:text-red-400 cursor-pointer">
              Log out
            </Link>
          </div>
        </div>

        {/* ─── Header ─── */}
        <div className="mt-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl text-cream sm:text-3xl">{company?.name ?? "Dashboard"}</h1>
            {company && (
              <Link href={`/jobs/company/${company.slug}`} className="text-xs text-dim transition-colors hover:text-muted normal-case">
                thegitcity.com/jobs/company/{company.slug}
              </Link>
            )}
          </div>
          {company && (
            <Link href="/jobs/dashboard/new" className="btn-press bg-lime px-5 py-3 text-xs text-bg cursor-pointer" style={{ boxShadow: "3px 3px 0 0 #5a7a00" }}>
              + New Job
            </Link>
          )}
        </div>

        {/* ─── Success message ─── */}
        {successMessage && (
          <div className="mt-6 border-[3px] border-lime/30 bg-lime/5 px-5 py-4 flex items-center justify-between">
            <p className="text-xs text-lime normal-case">{successMessage}</p>
            <button onClick={() => setSuccessMessage("")} className="text-xs text-dim hover:text-cream cursor-pointer">Dismiss</button>
          </div>
        )}

        {/* ─── Setup form ─── */}
        {setupMode && (
          <div className="mt-8 border-[3px] border-border bg-bg-raised p-6 sm:p-8 space-y-6">
            <div>
              <h2 className="text-sm text-cream">Set up your company profile</h2>
              <p className="mt-1 text-xs text-muted normal-case">This is shown to developers when they view your listings.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="setup-name" className="text-xs text-cream">Company name <span className="text-lime">*</span></label>
                <input id="setup-name" value={name} onChange={(e) => handleNameChange(e.target.value)} placeholder="Acme Corp" className={`${inputClass} mt-1.5`} />
              </div>
              <div>
                <label htmlFor="setup-website" className="text-xs text-cream">Website <span className="text-lime">*</span></label>
                <input id="setup-website" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://acme.com" className={`${inputClass} mt-1.5`} />
              </div>
            </div>

            <div>
              <label htmlFor="setup-url" className="text-xs text-cream">Profile URL <span className="text-lime">*</span></label>
              <div className="mt-1.5 flex items-center border-[3px] border-border bg-bg">
                <span className="shrink-0 px-3 text-xs text-dim normal-case">thegitcity.com/jobs/company/</span>
                <input id="setup-url" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} placeholder="acme-corp" className="w-full bg-transparent px-2 py-3 text-sm text-cream normal-case outline-none" />
              </div>
            </div>

            <div>
              <label htmlFor="setup-desc" className="text-xs text-cream">Description</label>
              <textarea id="setup-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does your company do? (1-2 sentences)" rows={2} className={`${inputClass} mt-1.5 resize-none`} />
            </div>

            <div>
              <label htmlFor="setup-gh" className="text-xs text-muted">GitHub organization</label>
              <input id="setup-gh" value={githubOrg} onChange={(e) => setGithubOrg(e.target.value)} placeholder="acme-corp (optional)" className={`${inputClass} mt-1.5`} />
            </div>

            {setupError && (
              <div className="border-[3px] border-red-500/30 bg-red-500/5 px-4 py-3">
                <p className="text-xs text-red-400 normal-case">{setupError}</p>
              </div>
            )}

            <button onClick={handleSetup} disabled={savingSetup || !name || !website || !slug} className="btn-press w-full bg-lime py-4 text-sm text-bg disabled:opacity-50 cursor-pointer" style={{ boxShadow: "4px 4px 0 0 #5a7a00" }}>
              {savingSetup ? "Creating..." : "Create Company Profile"}
            </button>
          </div>
        )}

        {/* ─── Dashboard content ─── */}
        {company && !setupMode && (
          <>
            {/* Stats */}
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard value={String(listings.length)} label="Total listings" />
              <StatCard value={String(totalActive)} label="Active now" accent="#4ade80" />
              <StatCard value={String(totalViews)} label="Total views" />
              <StatCard value={String(totalApplies)} label="Applications" accent="#c8e64a" />
            </div>

            {/* Filter tabs */}
            <div className="mt-6 flex flex-wrap gap-1.5">
              {STATUS_FILTERS.map((s) => {
                const count = s === "all" ? listings.length : (statusCounts[s] ?? 0);
                if (s !== "all" && count === 0) return null;
                return (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className="cursor-pointer border-[2px] px-3 py-1.5 text-xs transition-colors"
                    style={{
                      borderColor: statusFilter === s ? (STATUS_COLORS[s] ?? "#c8e64a") : "var(--color-border)",
                      color: statusFilter === s ? (STATUS_COLORS[s] ?? "#c8e64a") : "var(--color-muted)",
                      backgroundColor: statusFilter === s ? `${STATUS_COLORS[s] ?? "#c8e64a"}10` : "transparent",
                    }}
                  >
                    {s === "all" ? "All" : STATUS_LABELS[s]} ({count})
                  </button>
                );
              })}
            </div>

            {/* Listings */}
            <div className="mt-4" aria-live="polite">
              {filtered.length === 0 ? (
                <div className="border-[3px] border-border bg-bg-raised p-10 text-center space-y-4">
                  <p className="text-xs text-muted">
                    {listings.length === 0 ? "No listings yet." : "No listings match this filter."}
                  </p>
                  {listings.length === 0 && (
                    <Link href="/jobs/dashboard/new" className="btn-press inline-block bg-lime px-6 py-3 text-xs text-bg cursor-pointer" style={{ boxShadow: "3px 3px 0 0 #5a7a00" }}>
                      Post your first job
                    </Link>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {filtered.map((listing) => (
                    <ListingCard key={listing.id} listing={listing} onAction={handleAction} />
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* ─── Email notification settings ─── */}
        {company && !setupMode && (
          <div className="mt-8">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="flex items-center gap-2 text-xs text-muted transition-colors hover:text-cream cursor-pointer"
            >
              <span>{showSettings ? "▾" : "▸"}</span>
              Email notification settings
            </button>

            {showSettings && (
              <div className="mt-3 border-[3px] border-border bg-bg-raised p-5 sm:p-6 space-y-4">
                <p className="text-xs text-muted/40 normal-case">
                  These emails are sent to <strong className="text-cream">{advertiserEmail}</strong>
                </p>

                <div className="space-y-1 text-xs normal-case">
                  <div className="flex items-center gap-3 py-2 border-b border-border/20">
                    <span className="text-[#c8e64a]">&#10003;</span>
                    <div>
                      <span className="text-cream">Listing approved / rejected</span>
                      <span className="text-muted/40 ml-2">Always on</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 py-2 border-b border-border/20">
                    <span className="text-[#c8e64a]">&#10003;</span>
                    <div>
                      <span className="text-cream">Expiration warnings</span>
                      <span className="text-muted/40 ml-2">Always on</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 py-2 border-b border-border/20">
                    <span className="text-[#c8e64a]">&#10003;</span>
                    <div>
                      <span className="text-cream">New candidates</span>
                      <span className="text-muted/40 ml-2">When someone applies</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 py-2 border-b border-border/20">
                    <span className="text-[#c8e64a]">&#10003;</span>
                    <div>
                      <span className="text-cream">Weekly performance report</span>
                      <span className="text-muted/40 ml-2">Every Monday</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 py-2">
                    <span className="text-[#c8e64a]">&#10003;</span>
                    <div>
                      <span className="text-cream">Moderation alerts</span>
                      <span className="text-muted/40 ml-2">If listing is flagged</span>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-muted/30 normal-case pt-2">
                  All emails are sent to your login email. To change it, log in with a different corporate email.
                </p>
              </div>
            )}
          </div>
        )}

        <div className="h-12" />
      </div>
    </main>
  );
}

/* ─── Listing Card ─── */

function ListingCard({ listing, onAction }: { listing: JobListing; onAction: (id: string, action: string) => void }) {
  const daysLeft = listing.expires_at
    ? Math.max(0, Math.ceil((new Date(listing.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  const statusColor = STATUS_COLORS[listing.status] ?? "#8c8c9c";

  return (
    <div className="border-[3px] border-border bg-bg-raised p-5 sm:p-6">
      {/* Top row: title + status */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm text-cream truncate">{listing.title}</h3>
          <p className="mt-1 text-xs text-muted">
            {SENIORITY_LABELS[listing.seniority]} · {ROLE_TYPE_LABELS[listing.role_type]}
            {listing.location_type && <> · {LOCATION_TYPE_LABELS[listing.location_type]}</>}
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-3">
          {daysLeft !== null && listing.status === "active" && (
            <span className="text-xs text-dim">{daysLeft}d left</span>
          )}
          <span className="border-[2px] px-2.5 py-1 text-xs" style={{ borderColor: `${statusColor}50`, color: statusColor }}>
            {STATUS_LABELS[listing.status] ?? listing.status}
          </span>
        </div>
      </div>

      {/* Metrics row */}
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted">
        <span>{listing.view_count} views</span>
        <span>{listing.apply_count} applications</span>
        <span>{listing.profile_count} profiles shared</span>
        {listing.salary_min > 0 && (
          <span className="text-lime">
            {listing.salary_currency} {listing.salary_min.toLocaleString()}-{listing.salary_max.toLocaleString()}
            {SALARY_PERIOD_LABELS[listing.salary_period] ?? "/mo"}
          </span>
        )}
      </div>

      {/* Status-specific info */}
      {listing.status === "pending_review" && (
        <p className="mt-3 text-xs text-dim normal-case">Being reviewed. Usually takes less than 24 hours.</p>
      )}
      {listing.status === "rejected" && listing.rejection_reason && (
        <p className="mt-3 text-xs text-red-400/70 normal-case">Reason: {listing.rejection_reason}</p>
      )}

      {/* Actions */}
      <div className="mt-4 flex flex-wrap gap-2 border-t border-border/30 pt-4">
        {listing.status === "active" && (
          <>
            <ActionBtn accent onClick={() => window.open(`/jobs/dashboard/${listing.id}/candidates`, "_self")}>Performance & Candidates</ActionBtn>
            <ActionBtn onClick={() => window.open(`/jobs/${listing.id}`, "_blank")}>View</ActionBtn>
            <ActionBtn onClick={() => onAction(listing.id, "pause")}>Pause</ActionBtn>
            <ActionBtn onClick={() => onAction(listing.id, "fill")}>Mark Filled</ActionBtn>
          </>
        )}
        {listing.status === "pending_review" && (
          <ActionBtn onClick={() => window.open(`/jobs/${listing.id}`, "_blank")}>Preview</ActionBtn>
        )}
        {listing.status === "draft" && (
          <>
            <ActionBtn accent onClick={() => onAction(listing.id, "checkout")}>Submit</ActionBtn>
            <ActionBtn danger onClick={() => onAction(listing.id, "delete")}>Delete</ActionBtn>
          </>
        )}
        {listing.status === "paused" && (
          <>
            <ActionBtn accent onClick={() => onAction(listing.id, "resume")}>Resume</ActionBtn>
            <ActionBtn onClick={() => window.open(`/jobs/dashboard/${listing.id}/candidates`, "_self")}>Performance & Candidates</ActionBtn>
            <ActionBtn onClick={() => window.open(`/jobs/${listing.id}`, "_blank")}>View</ActionBtn>
            <ActionBtn onClick={() => onAction(listing.id, "fill")}>Mark Filled</ActionBtn>
          </>
        )}
        {listing.status === "expired" && (
          <>
            <ActionBtn accent onClick={() => onAction(listing.id, "checkout")}>Repost</ActionBtn>
            <ActionBtn onClick={() => window.open(`/jobs/dashboard/${listing.id}/candidates`, "_self")}>Performance & Candidates</ActionBtn>
            <ActionBtn onClick={() => window.open(`/jobs/${listing.id}`, "_blank")}>View</ActionBtn>
          </>
        )}
        {listing.status === "filled" && (
          <>
            <ActionBtn onClick={() => window.open(`/jobs/dashboard/${listing.id}/candidates`, "_self")}>Performance & Candidates</ActionBtn>
            <ActionBtn onClick={() => window.open(`/jobs/${listing.id}`, "_blank")}>View</ActionBtn>
          </>
        )}
        {listing.status === "rejected" && (
          <>
            <ActionBtn onClick={() => window.open(`/jobs/${listing.id}`, "_blank")}>View</ActionBtn>
            <ActionBtn danger onClick={() => onAction(listing.id, "delete")}>Delete</ActionBtn>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Shared ─── */

function StatCard({ value, label, accent }: { value: string; label: string; accent?: string }) {
  return (
    <div className="border-[3px] border-border bg-bg-raised p-4 text-center">
      <p className="text-xl" style={{ color: accent ?? "var(--color-cream)" }}>{value}</p>
      <p className="mt-1 text-xs text-muted">{label}</p>
    </div>
  );
}

function ActionBtn({ children, accent, danger, onClick }: { children: React.ReactNode; accent?: boolean; danger?: boolean; onClick: () => void }) {
  let style = "border-border text-muted hover:border-border-light hover:text-cream";
  if (accent) style = "border-lime/30 text-lime hover:border-lime/50 hover:bg-lime/5";
  if (danger) style = "border-red-500/20 text-red-400/60 hover:border-red-500/40 hover:text-red-400";

  return (
    <button onClick={onClick} className={`cursor-pointer border-[2px] px-3 py-1.5 text-xs transition-colors ${style}`}>
      {children}
    </button>
  );
}
