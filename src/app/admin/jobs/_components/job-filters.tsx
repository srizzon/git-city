"use client";

import { useState, useEffect } from "react";
import type { JobStatus } from "@/lib/jobs/types";

export type StatusFilter = JobStatus | "all";
export type SortKey = "date" | "salary" | "views" | "applies";
export type SortDir = "asc" | "desc";

export interface JobFilters {
  status: StatusFilter;
  q: string;
  sort: SortKey;
  dir: SortDir;
}

interface JobFiltersProps {
  filters: JobFilters;
  setFilter: <K extends keyof JobFilters>(key: K, value: JobFilters[K]) => void;
  onRefresh: () => void;
  filteredCount: number;
  totalCount: number;
}

function ButtonGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap">
      {options.map((opt, i) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`cursor-pointer border px-3 py-1.5 text-[11px] transition-colors ${
            value === opt.value
              ? "relative z-10 border-lime bg-lime/10 text-lime"
              : "border-border text-muted hover:text-cream"
          } ${i > 0 ? "-ml-px" : ""}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function JobFilters({
  filters,
  setFilter,
  onRefresh,
  filteredCount,
  totalCount,
}: JobFiltersProps) {
  const [searchLocal, setSearchLocal] = useState(filters.q);

  useEffect(() => {
    setSearchLocal(filters.q);
  }, [filters.q]);

  return (
    <div className="mb-4 space-y-3">
      {/* Row 1: Status + Search + Refresh */}
      <div className="flex flex-wrap items-center gap-3">
        <ButtonGroup<StatusFilter>
          options={[
            { value: "all", label: "ALL" },
            { value: "pending_review", label: "PENDING" },
            { value: "active", label: "ACTIVE" },
            { value: "paused", label: "PAUSED" },
            { value: "expired", label: "EXPIRED" },
            { value: "filled", label: "FILLED" },
            { value: "rejected", label: "REJECTED" },
          ]}
          value={filters.status}
          onChange={(v) => setFilter("status", v)}
        />

        <input
          type="text"
          placeholder="Search title, company..."
          value={searchLocal}
          onChange={(e) => {
            setSearchLocal(e.target.value);
            setFilter("q", e.target.value);
          }}
          className="ml-auto min-w-50 border border-border bg-bg px-3 py-1.5 text-[11px] text-cream outline-none placeholder:text-dim focus:border-lime"
        />

        <button
          onClick={onRefresh}
          className="cursor-pointer border border-border px-3 py-1.5 text-[11px] text-muted transition-colors hover:text-cream"
        >
          REFRESH
        </button>
      </div>

      {/* Row 2: Sort + Count */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={`${filters.sort}-${filters.dir}`}
          onChange={(e) => {
            const [sort, dir] = e.target.value.split("-") as [SortKey, SortDir];
            setFilter("sort", sort);
            setFilter("dir", dir);
          }}
          className="cursor-pointer border border-border bg-bg px-3 py-1.5 text-[11px] text-cream outline-none focus:border-lime"
        >
          <option value="date-desc">Newest first</option>
          <option value="date-asc">Oldest first</option>
          <option value="salary-desc">Highest salary</option>
          <option value="salary-asc">Lowest salary</option>
          <option value="views-desc">Most views</option>
          <option value="applies-desc">Most applies</option>
        </select>

        <p className="ml-auto text-[11px] text-dim">
          {filteredCount} of {totalCount} listings
        </p>
      </div>
    </div>
  );
}
