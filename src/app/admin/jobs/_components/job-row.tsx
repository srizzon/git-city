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
        className="cursor-pointer px-4 py-2.5 md:grid md:grid-cols-[24px_minmax(0,2fr)_72px_80px_72px_80px_60px_60px_130px] md:items-center md:gap-3"
        onClick={onToggleExpand}
      >
        {/* Checkbox */}
        <div className="hidden md:block" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggleSelect}
            className="cursor-pointer accent-lime"
          />
        </div>

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
            {job.company?.name}
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

        {/* Tier (text) */}
        <p className="hidden text-right text-xs text-muted md:block">
          {SENIORITY_LABELS[job.seniority] ?? job.seniority}
        </p>

        {/* Posted */}
        <p className="hidden text-right text-xs tabular-nums text-dim md:block">
          {fmtDateShort(job.published_at || job.created_at)}
        </p>

        {/* Views */}
        <p className="hidden text-right text-xs tabular-nums text-cream md:block">
          {job.view_count.toLocaleString()}
        </p>

        {/* Applies */}
        <p className="hidden text-right text-xs tabular-nums text-cream md:block">
          {job.apply_count.toLocaleString()}
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
              DEL
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

      {/* Expanded details */}
      {isExpanded && (
        <div className="border-t border-border/50 px-4 py-5">
          {/* Description */}
          <div className="mb-5 border border-border bg-bg p-4">
            <p className="mb-2 text-[10px] text-dim">DESCRIPTION</p>
            <div
              className="tiptap text-xs text-cream-dark normal-case leading-relaxed max-h-64 overflow-y-auto"
              dangerouslySetInnerHTML={{ __html: job.description }}
            />
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
            <div>
              <span className="text-xs text-dim">Role type</span>
              <p className="mt-1 text-sm text-cream">
                {ROLE_TYPE_LABELS[job.role_type] ?? job.role_type}
              </p>
            </div>
            <div>
              <span className="text-xs text-dim">Seniority</span>
              <p className="mt-1 text-sm text-cream">
                {SENIORITY_LABELS[job.seniority] ?? job.seniority}
              </p>
            </div>
            <div>
              <span className="text-xs text-dim">Contract</span>
              <p className="mt-1 text-sm text-cream">
                {CONTRACT_LABELS[job.contract_type] ?? job.contract_type}
              </p>
            </div>
            <div>
              <span className="text-xs text-dim">Web type</span>
              <p className="mt-1 text-sm text-cream">
                {WEB_TYPE_LABELS[job.web_type] ?? job.web_type}
              </p>
            </div>
            <div>
              <span className="text-xs text-dim">Salary</span>
              <p className="mt-1 text-sm text-lime">
                {job.salary_currency} {job.salary_min.toLocaleString()} - {job.salary_max.toLocaleString()}
              </p>
            </div>
            <div>
              <span className="text-xs text-dim">Published</span>
              <p className="mt-1 text-sm text-cream">{fmtDate(job.published_at)}</p>
            </div>
            <div>
              <span className="text-xs text-dim">Expires</span>
              <p className={`mt-1 text-sm ${expiryColor}`}>
                {fmtDate(job.expires_at)}
                {job.expires_at && (
                  <span className="ml-1 text-[11px]">({expiryLabel})</span>
                )}
              </p>
            </div>
            <div>
              <span className="text-xs text-dim">Stats</span>
              <p className="mt-1 text-sm text-cream">
                {job.view_count} views / {job.apply_count} applies / {job.profile_count} profiles
              </p>
            </div>
          </div>

          {/* Tech stack */}
          {job.tech_stack.length > 0 && (
            <div className="mt-4">
              <span className="text-xs text-dim">TECH STACK</span>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {job.tech_stack.map((tag) => (
                  <span
                    key={tag}
                    className="border border-lime/20 px-2 py-0.5 text-xs text-lime"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Trust badges */}
          {(job.badge_response_guaranteed || job.badge_no_ai_screening) && (
            <div className="mt-4 flex gap-2">
              {job.badge_response_guaranteed && (
                <span className="border border-lime/30 px-2 py-0.5 text-xs text-lime">
                  Response Guaranteed
                </span>
              )}
              {job.badge_no_ai_screening && (
                <span className="border border-lime/30 px-2 py-0.5 text-xs text-lime">
                  No AI Screening
                </span>
              )}
            </div>
          )}

          {/* Links + Rejection */}
          <div className="mt-5 grid grid-cols-2 gap-x-8 gap-y-3 border-t border-border/50 pt-4 sm:grid-cols-4">
            <div>
              <span className="text-xs text-dim">Apply URL</span>
              <p className="mt-1 truncate text-sm">
                <a
                  href={job.apply_url}
                  target="_blank"
                  rel="noopener"
                  className="text-lime hover:underline"
                >
                  {job.apply_url.replace(/^https?:\/\/(www\.)?/, "")}
                </a>
              </p>
            </div>
            <div>
              <span className="text-xs text-dim">Company website</span>
              <p className="mt-1 truncate text-sm">
                {job.company?.website ? (
                  <a
                    href={job.company.website}
                    target="_blank"
                    rel="noopener"
                    className="text-lime hover:underline"
                  >
                    {job.company.website.replace(/^https?:\/\/(www\.)?/, "")}
                  </a>
                ) : (
                  <span className="text-muted">-</span>
                )}
              </p>
            </div>
            <div>
              <span className="text-xs text-dim">Stripe Session</span>
              <p className="mt-1 truncate text-xs text-muted font-mono">
                {job.stripe_session_id || "-"}
              </p>
            </div>
            <div>
              <span className="text-xs text-dim">ID</span>
              <p className="mt-1 truncate text-xs text-muted font-mono">{job.id}</p>
            </div>
          </div>

          {/* Rejection reason */}
          {job.rejection_reason && (
            <div className="mt-3 border border-red-800/30 bg-red-900/10 p-3">
              <span className="text-[10px] text-red-400">REJECTION REASON</span>
              <p className="mt-1 text-xs text-red-300 normal-case">{job.rejection_reason}</p>
            </div>
          )}

          {/* Mobile actions */}
          <div className="mt-4 flex flex-wrap gap-2 md:hidden">
            {isPending && (
              <>
                <button
                  onClick={onApprove}
                  className="cursor-pointer border-2 border-lime px-4 py-1.5 text-xs text-lime transition-colors hover:bg-lime/10"
                >
                  APPROVE
                </button>
                <button
                  onClick={onReject}
                  className="cursor-pointer border border-red-800/50 px-4 py-1.5 text-xs text-red-400 transition-colors hover:bg-red-900/20"
                >
                  REJECT
                </button>
              </>
            )}
            {isActive && (
              <button
                onClick={onPause}
                className="cursor-pointer border border-border px-4 py-1.5 text-xs text-muted transition-colors hover:text-cream"
              >
                PAUSE
              </button>
            )}
            {isPaused && (
              <button
                onClick={onResume}
                className="cursor-pointer border border-border px-4 py-1.5 text-xs text-muted transition-colors hover:text-lime"
              >
                RESUME
              </button>
            )}
            {canDelete && (
              <button
                onClick={onDelete}
                className="cursor-pointer border border-red-800/50 px-4 py-1.5 text-xs text-red-400 transition-colors hover:bg-red-900/20"
              >
                DELETE
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
