"use client";

import { useState, useEffect } from "react";
import type { AdsFilters, Period, StatusFilter, VehicleFilter, SourceFilter } from "../_lib/types";
import { VEHICLE_LABELS } from "../_lib/constants";

interface AdFiltersProps {
  filters: AdsFilters;
  setFilter: <K extends keyof AdsFilters>(key: K, value: AdsFilters[K]) => void;
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
    <div className="flex">
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

export function AdFilters({
  filters,
  setFilter,
  onRefresh,
  filteredCount,
  totalCount,
}: AdFiltersProps) {
  // Local search state for debounce (visual responsiveness)
  const [searchLocal, setSearchLocal] = useState(filters.q);

  useEffect(() => {
    setSearchLocal(filters.q);
  }, [filters.q]);

  return (
    <div className="mb-4 space-y-3">
      {/* Row 1: Period + Status + Search + Refresh */}
      <div className="flex flex-wrap items-center gap-3">
        <ButtonGroup<Period>
          options={[
            { value: "7d", label: "7D" },
            { value: "30d", label: "30D" },
            { value: "all", label: "ALL" },
          ]}
          value={filters.period}
          onChange={(v) => setFilter("period", v)}
        />

        <div className="h-5 w-px bg-border" />

        <ButtonGroup<StatusFilter>
          options={[
            { value: "all", label: "ALL" },
            { value: "active", label: "ACTIVE" },
            { value: "paused", label: "PAUSED" },
            { value: "expired", label: "EXPIRED" },
          ]}
          value={filters.status}
          onChange={(v) => setFilter("status", v)}
        />

        <input
          type="text"
          placeholder="Search brand, id, email..."
          value={searchLocal}
          onChange={(e) => {
            setSearchLocal(e.target.value);
            setFilter("q", e.target.value);
          }}
          className="ml-auto min-w-[200px] border border-border bg-bg px-3 py-1.5 text-[11px] text-cream outline-none placeholder:text-dim focus:border-lime"
        />

        <button
          onClick={onRefresh}
          className="cursor-pointer border border-border px-3 py-1.5 text-[11px] text-muted transition-colors hover:text-cream"
        >
          REFRESH
        </button>
      </div>

      {/* Row 2: Vehicle + Source dropdowns + count */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={filters.vehicle}
          onChange={(e) => setFilter("vehicle", e.target.value as VehicleFilter)}
          className="cursor-pointer border border-border bg-bg px-3 py-1.5 text-[11px] text-cream outline-none focus:border-lime"
        >
          <option value="all">All vehicles</option>
          {Object.entries(VEHICLE_LABELS).map(([val, label]) => (
            <option key={val} value={val}>
              {label}
            </option>
          ))}
        </select>

        <select
          value={filters.source}
          onChange={(e) => setFilter("source", e.target.value as SourceFilter)}
          className="cursor-pointer border border-border bg-bg px-3 py-1.5 text-[11px] text-cream outline-none focus:border-lime"
        >
          <option value="all">All sources</option>
          <option value="paid">Paid</option>
          <option value="manual">Manual</option>
        </select>

        <p className="ml-auto text-[11px] text-dim">
          {filteredCount} of {totalCount} ads
        </p>
      </div>
    </div>
  );
}
