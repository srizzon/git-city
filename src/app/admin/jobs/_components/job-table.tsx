"use client";

import type { JobListingAdmin } from "./job-row";
import { JobRow } from "./job-row";

interface JobTableProps {
  jobs: JobListingAdmin[];
  loading: boolean;
  isFirstLoad: boolean;
  expandedId: string | null;
  selectedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onApprove: (id: string) => void;
  onReject: (job: JobListingAdmin) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onDelete: (job: JobListingAdmin) => void;
}

function SkeletonRows() {
  return (
    <div className="space-y-0">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="border border-t-0 border-border first:border-t bg-bg-raised px-3 py-2.5"
        >
          <div className="flex items-center gap-3">
            <div className="h-3 w-4 animate-pulse rounded bg-border" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 w-40 animate-pulse rounded bg-border" />
              <div className="h-2.5 w-24 animate-pulse rounded bg-border" />
            </div>
            <div className="hidden gap-6 md:flex">
              <div className="h-3 w-14 animate-pulse rounded bg-border" />
              <div className="h-3 w-16 animate-pulse rounded bg-border" />
              <div className="h-3 w-10 animate-pulse rounded bg-border" />
              <div className="h-3 w-12 animate-pulse rounded bg-border" />
              <div className="h-3 w-8 animate-pulse rounded bg-border" />
              <div className="h-3 w-8 animate-pulse rounded bg-border" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function JobTable({
  jobs,
  loading,
  isFirstLoad,
  expandedId,
  selectedIds,
  onToggleExpand,
  onToggleSelect,
  onSelectAll,
  onApprove,
  onReject,
  onPause,
  onResume,
  onDelete,
}: JobTableProps) {
  if (isFirstLoad && loading) {
    return <SkeletonRows />;
  }

  const allSelected =
    jobs.length > 0 && jobs.every((j) => selectedIds.has(j.id));

  return (
    <div className={loading ? "opacity-60 transition-opacity" : ""}>
      {/* Table header */}
      {jobs.length > 0 && (
        <div className="hidden border border-border bg-bg-raised px-4 py-2.5 md:grid md:grid-cols-[24px_minmax(0,2fr)_72px_80px_72px_80px_60px_60px_130px] md:items-center md:gap-3">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={onSelectAll}
            className="cursor-pointer accent-lime"
          />
          <span className="text-xs text-muted">TITLE / COMPANY</span>
          <span className="text-right text-xs text-muted">STATUS</span>
          <span className="text-right text-xs text-muted">SALARY</span>
          <span className="text-right text-xs text-muted">LEVEL</span>
          <span className="text-right text-xs text-muted">POSTED</span>
          <span className="text-right text-xs text-muted">VIEWS</span>
          <span className="text-right text-xs text-muted">APPLIES</span>
          <span className="text-right text-xs text-muted">ACTIONS</span>
        </div>
      )}

      {/* Rows */}
      <div className="space-y-0">
        {jobs.map((job) => (
          <JobRow
            key={job.id}
            job={job}
            isExpanded={expandedId === job.id}
            isSelected={selectedIds.has(job.id)}
            onToggleExpand={() => onToggleExpand(job.id)}
            onToggleSelect={() => onToggleSelect(job.id)}
            onApprove={() => onApprove(job.id)}
            onReject={() => onReject(job)}
            onPause={() => onPause(job.id)}
            onResume={() => onResume(job.id)}
            onDelete={() => onDelete(job)}
          />
        ))}
      </div>

      {/* Empty state */}
      {!loading && jobs.length === 0 && (
        <div className="border border-border bg-bg-raised p-8 text-center">
          <p className="text-sm text-muted">No listings found</p>
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-2">
          <div className="h-1 w-24 animate-pulse rounded bg-lime/30" />
        </div>
      )}
    </div>
  );
}
