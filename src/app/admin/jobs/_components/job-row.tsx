"use client";

import type { JobListing, JobCompanyProfile, JobStatus } from "@/lib/jobs/types";
import { SENIORITY_LABELS, ROLE_TYPE_LABELS, CONTRACT_LABELS, WEB_TYPE_LABELS } from "@/lib/jobs/constants";
import { StatusBadge } from "./status-badge";

export interface JobListingAdmin extends JobListing {
  company: JobCompanyProfile;
}

interface JobRowProps {
  job: JobListingAdmin;
  isExpanded: boolean;
  isSelected: boolean;
  onToggleExpand: () => void;
  onToggleSelect: () => void;
  onApprove: () => void;
  onReject: () => void;
  onPause: () => void;
  onResume: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onChangeTier: (tier: string) => void;
  onExtend: () => void;
}

function fmtDate(d: string | null): string {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
}

function fmtDateShort(d: string | null): string {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en", { month: "short", day: "numeric" });
}

function fmtSalary(min: number, max: number, currency: string): string {
  const f = (n: number) => {
    if (n >= 1000) return (n / 1000).toFixed(0) + "K";
    return String(n);
  };
  return `${currency} ${f(min)}-${f(max)}`;
}

function fmtExpiry(d: string | null): string {
  if (!d) return "-";
  const now = Date.now();
  const exp = new Date(d).getTime();
  const daysLeft = Math.ceil((exp - now) / 86400000);
  if (daysLeft < 0) return "expired";
  if (daysLeft === 0) return "today";
  return `${daysLeft}d left`;
}

const TIER_STYLES: Record<string, string> = {
  premium: "border-yellow-500/40 text-yellow-400",
  featured: "border-blue-500/40 text-blue-400",
  standard: "border-border text-muted",
};

export function JobRow({
  job,
  isExpanded,
  isSelected,
  onToggleExpand,
  onToggleSelect,
  onApprove,
  onReject,
  onPause,
  onResume,
  onDelete,
  onEdit,
  onChangeTier,
  onExtend,
}: JobRowProps) {
  const status = job.status as JobStatus;
  const isPending = status === "pending_review";
  const isActive = status === "active";
  const isPaused = status === "paused";
  const canDelete = status === "draft" || status === "rejected";

  const expiryLabel = fmtExpiry(job.expires_at);
  const expiryColor =
    expiryLabel === "expired"
      ? "text-red-400"
      : expiryLabel.includes("d left") && parseInt(expiryLabel) <= 5
        ? "text-yellow-400"
        : "text-dim";

  return (
    <div className="border border-t-0 border-border first:border-t bg-bg-raised transition-colors hover:bg-bg-card">
      {/* Main row */}
      <div
        className="cursor-pointer px-4 py-2.5 md:grid md:grid-cols-[minmax(0,2fr)_80px_90px_80px_80px_180px] md:items-center md:gap-3"
        onClick={onToggleExpand}
      >
        {/* Title + Company */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm text-cream font-medium">{job.title}</span>
            <span
              className={`shrink-0 border px-1.5 py-0.5 text-[10px] leading-none ${TIER_STYLES[job.tier] ?? TIER_STYLES.standard}`}
            >
              {job.tier.toUpperCase()}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-muted">
            {job.company?.name} · {SENIORITY_LABELS[job.seniority] ?? job.seniority}
          </p>
        </div>

        {/* Status */}
        <div className="hidden md:block">
          <StatusBadge status={status} />
        </div>

        {/* Salary */}
        <p className="hidden text-right text-xs tabular-nums text-cream md:block">
          {fmtSalary(job.salary_min, job.salary_max, job.salary_currency)}
        </p>

        {/* Posted */}
        <p className="hidden text-right text-xs tabular-nums text-dim md:block">
          {fmtDateShort(job.published_at || job.created_at)}
        </p>

        {/* Metrics */}
        <p className="hidden text-right text-xs tabular-nums text-cream md:block">
          {job.view_count} views / {job.apply_count} applies
        </p>

        {/* Actions */}
        <div
          className="hidden items-center justify-end gap-1.5 md:flex"
          onClick={(e) => e.stopPropagation()}
        >
          {isPending && (
            <>
              <button
                onClick={onApprove}
                className="cursor-pointer border-2 border-lime px-2 py-1 text-[10px] text-lime transition-colors hover:bg-lime/10"
              >
                APPROVE
              </button>
              <button
                onClick={onReject}
                className="cursor-pointer border border-red-800/50 px-2 py-1 text-[10px] text-red-400 transition-colors hover:border-red-800 hover:bg-red-900/20"
              >
                REJECT
              </button>
            </>
          )}
          {isActive && (
            <button
              onClick={onPause}
              className="cursor-pointer border border-border px-2 py-1 text-[10px] text-muted transition-colors hover:border-border-light hover:text-cream"
            >
              PAUSE
            </button>
          )}
          {isPaused && (
            <button
              onClick={onResume}
              className="cursor-pointer border border-border px-2 py-1 text-[10px] text-muted transition-colors hover:border-lime hover:text-lime"
            >
              RESUME
            </button>
          )}
          {canDelete && (
            <button
              onClick={onDelete}
              className="cursor-pointer border border-red-800/50 px-2 py-1 text-[10px] text-red-400 transition-colors hover:border-red-800 hover:bg-red-900/20"
            >
              DELETE
            </button>
          )}
        </div>

        {/* Mobile summary */}
        <div className="mt-2 flex items-center gap-3 md:hidden">
          <StatusBadge status={status} />
          <span className="text-xs text-cream">{job.company?.name}</span>
          <span className="text-xs text-lime">
            {fmtSalary(job.salary_min, job.salary_max, job.salary_currency)}
          </span>
        </div>
      </div>

      {/* Modal */}
      {isExpanded && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onToggleExpand}>
          <div className="absolute inset-0 bg-black/70" />
          <div
            className="relative w-full max-w-3xl max-h-[85vh] overflow-y-auto bg-bg border-[3px] border-border no-scrollbar"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-bg px-5 py-3">
              <div className="min-w-0">
                <h2 className="text-sm text-cream truncate">{job.title}</h2>
                <p className="text-xs text-muted">{job.company?.name} · {job.tier.toUpperCase()}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-4">
                <StatusBadge status={status} />
                <button onClick={onToggleExpand} className="text-xs text-dim hover:text-cream cursor-pointer ml-2">CLOSE</button>
              </div>
            </div>

            <div className="p-5 space-y-5">
              {/* Actions bar */}
              <div className="flex flex-wrap gap-2">
                {isPending && (
                  <>
                    <button onClick={onApprove} className="cursor-pointer border-2 border-lime px-4 py-2 text-xs text-lime transition-colors hover:bg-lime/10">APPROVE</button>
                    <button onClick={onReject} className="cursor-pointer border border-red-800/50 px-4 py-2 text-xs text-red-400 transition-colors hover:bg-red-900/20">REJECT</button>
                  </>
                )}
                {isActive && <button onClick={onPause} className="cursor-pointer border border-border px-4 py-2 text-xs text-muted transition-colors hover:text-cream">PAUSE</button>}
                {isPaused && <button onClick={onResume} className="cursor-pointer border border-border px-4 py-2 text-xs text-muted transition-colors hover:text-lime">RESUME</button>}
                {canDelete && <button onClick={onDelete} className="cursor-pointer border border-red-800/50 px-4 py-2 text-xs text-red-400 transition-colors hover:bg-red-900/20">DELETE</button>}
                <button onClick={onEdit} className="cursor-pointer border border-lime/40 px-4 py-2 text-xs text-lime transition-colors hover:bg-lime/10">EDIT</button>
                <select
                  value={job.tier}
                  onChange={(e) => onChangeTier(e.target.value)}
                  className="cursor-pointer border border-border bg-bg px-3 py-2 text-xs text-muted outline-none hover:border-border-light hover:text-cream"
                >
                  <option value="free">FREE</option>
                  <option value="standard">STANDARD</option>
                  <option value="featured">FEATURED</option>
                  <option value="premium">PREMIUM</option>
                </select>
                {(isActive || isPaused || status === "expired") && (
                  <button onClick={onExtend} className="cursor-pointer border border-border px-4 py-2 text-xs text-muted transition-colors hover:border-lime hover:text-lime">EXTEND 30 DAYS</button>
                )}
                <a href={`/jobs/${job.id}`} target="_blank" rel="noopener" className="border border-border px-4 py-2 text-xs text-muted transition-colors hover:text-cream">VIEW LISTING</a>
              </div>

              {/* Info grid */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <InfoCell label="Role">{ROLE_TYPE_LABELS[job.role_type] ?? job.role_type}</InfoCell>
                <InfoCell label="Seniority">{SENIORITY_LABELS[job.seniority] ?? job.seniority}</InfoCell>
                <InfoCell label="Contract">{CONTRACT_LABELS[job.contract_type] ?? job.contract_type}</InfoCell>
                <InfoCell label="Web">{WEB_TYPE_LABELS[job.web_type] ?? job.web_type}</InfoCell>
                <InfoCell label="Salary" accent>{job.salary_currency} {job.salary_min.toLocaleString()} - {job.salary_max.toLocaleString()}</InfoCell>
                <InfoCell label="Published">{fmtDate(job.published_at)}</InfoCell>
                <InfoCell label="Expires"><span className={expiryColor}>{fmtDate(job.expires_at)} {job.expires_at && `(${expiryLabel})`}</span></InfoCell>
                <InfoCell label="Views">{job.view_count.toLocaleString()}</InfoCell>
                <InfoCell label="Applies">{job.apply_count.toLocaleString()}</InfoCell>
                <InfoCell label="Profile views">{job.profile_count.toLocaleString()}</InfoCell>
              </div>

              {/* Tech stack */}
              {job.tech_stack.length > 0 && (
                <div>
                  <p className="text-xs text-dim mb-2">TECH STACK</p>
                  <div className="flex flex-wrap gap-1.5">
                    {job.tech_stack.map((tag) => <span key={tag} className="border border-lime/20 px-2 py-0.5 text-xs text-lime">{tag}</span>)}
                  </div>
                </div>
              )}

              {/* Badges */}
              {(job.badge_response_guaranteed || job.badge_no_ai_screening) && (
                <div className="flex gap-2">
                  {job.badge_response_guaranteed && <span className="border border-lime/30 px-2 py-0.5 text-xs text-lime">Response Guaranteed</span>}
                  {job.badge_no_ai_screening && <span className="border border-lime/30 px-2 py-0.5 text-xs text-lime">No AI Screening</span>}
                </div>
              )}

              {/* Description */}
              <div className="border border-border bg-bg-raised p-4">
                <p className="text-xs text-dim mb-2">DESCRIPTION</p>
                <div className="tiptap text-xs text-cream-dark normal-case leading-relaxed max-h-80 overflow-y-auto scrollbar-thin" dangerouslySetInnerHTML={{ __html: job.description }} />
              </div>

              {/* Links */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 border-t border-border/50 pt-4">
                <div>
                  <p className="text-xs text-dim">Apply URL</p>
                  <a href={job.apply_url} target="_blank" rel="noopener" className="mt-1 block text-xs text-lime hover:underline truncate">{job.apply_url.replace(/^https?:\/\/(www\.)?/, "")}</a>
                </div>
                <div>
                  <p className="text-xs text-dim">Company</p>
                  {job.company?.website ? (
                    <a href={job.company.website} target="_blank" rel="noopener" className="mt-1 block text-xs text-lime hover:underline truncate">{job.company.website.replace(/^https?:\/\/(www\.)?/, "")}</a>
                  ) : <p className="mt-1 text-xs text-muted">-</p>}
                </div>
                <div>
                  <p className="text-xs text-dim">Stripe</p>
                  <p className="mt-1 text-xs text-muted font-mono truncate">{job.stripe_session_id || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-dim">ID</p>
                  <p className="mt-1 text-xs text-muted font-mono truncate">{job.id}</p>
                </div>
              </div>

              {/* Rejection */}
              {job.rejection_reason && (
                <div className="border border-red-800/30 bg-red-900/10 p-3">
                  <p className="text-[10px] text-red-400">REJECTION REASON</p>
                  <p className="mt-1 text-xs text-red-300 normal-case">{job.rejection_reason}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoCell({ label, accent, children }: { label: string; accent?: boolean; children: React.ReactNode }) {
  return (
    <div className="border border-border bg-bg-raised p-2.5">
      <p className="text-[10px] text-dim">{label}</p>
      <p className={`mt-0.5 text-xs ${accent ? "text-lime" : "text-cream"}`}>{children}</p>
    </div>
  );
}
