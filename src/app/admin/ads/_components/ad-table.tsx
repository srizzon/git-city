"use client";

import type { AdStats, SortKey, SortDir } from "../_lib/types";
import { SortButton } from "./sort-button";
import { AdRow } from "./ad-row";

interface AdTableProps {
  ads: AdStats[];
  loading: boolean;
  isFirstLoad: boolean;
  sortKey: SortKey;
  sortDir: SortDir;
  expandedId: string | null;
  selectedIds: Set<string>;
  onSort: (key: SortKey) => void;
  onToggleExpand: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onEdit: (ad: AdStats) => void;
  onToggleActive: (id: string, active: boolean) => void;
  onDelete: (ad: AdStats) => void;
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
            <div className="h-3 w-14 animate-pulse rounded bg-border" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 w-28 animate-pulse rounded bg-border" />
              <div className="h-2.5 w-40 animate-pulse rounded bg-border" />
            </div>
            <div className="hidden gap-6 md:flex">
              <div className="h-3 w-10 animate-pulse rounded bg-border" />
              <div className="h-3 w-10 animate-pulse rounded bg-border" />
              <div className="h-3 w-10 animate-pulse rounded bg-border" />
              <div className="h-3 w-8 animate-pulse rounded bg-border" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function AdTable({
  ads,
  loading,
  isFirstLoad,
  sortKey,
  sortDir,
  expandedId,
  selectedIds,
  onSort,
  onToggleExpand,
  onToggleSelect,
  onSelectAll,
  onEdit,
  onToggleActive,
  onDelete,
}: AdTableProps) {
  if (isFirstLoad && loading) {
    return <SkeletonRows />;
  }

  const allSelected =
    ads.length > 0 && ads.every((ad) => selectedIds.has(ad.id));

  return (
    <div className={loading ? "opacity-60 transition-opacity" : ""}>
      {/* Table header */}
      {ads.length > 0 && (
        <div className="hidden border border-border bg-bg-raised px-3 py-2 md:grid md:grid-cols-[24px_minmax(0,2fr)_80px_80px_80px_60px_72px_120px] md:items-center md:gap-3">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={onSelectAll}
            className="cursor-pointer accent-lime"
          />
          <SortButton label="AD" sortKey="brand" currentSort={sortKey} currentDir={sortDir} onSort={onSort} />
          <SortButton label="IMP" sortKey="impressions" currentSort={sortKey} currentDir={sortDir} onSort={onSort} />
          <SortButton label="3D CLK" sortKey="clicks" currentSort={sortKey} currentDir={sortDir} onSort={onSort} />
          <SortButton label="CTA" sortKey="cta_clicks" currentSort={sortKey} currentDir={sortDir} onSort={onSort} />
          <SortButton label="CTR" sortKey="ctr" currentSort={sortKey} currentDir={sortDir} onSort={onSort} />
          <SortButton label="STATUS" sortKey="status" currentSort={sortKey} currentDir={sortDir} onSort={onSort} />
          <span className="text-right text-[11px] text-muted">ACTIONS</span>
        </div>
      )}

      {/* Rows */}
      <div className="space-y-0">
        {ads.map((ad) => (
          <AdRow
            key={ad.id}
            ad={ad}
            isExpanded={expandedId === ad.id}
            isSelected={selectedIds.has(ad.id)}
            onToggleExpand={() => onToggleExpand(ad.id)}
            onToggleSelect={() => onToggleSelect(ad.id)}
            onEdit={() => onEdit(ad)}
            onToggleActive={() => onToggleActive(ad.id, ad.active)}
            onDelete={() => onDelete(ad)}
          />
        ))}
      </div>

      {loading && (
        <div className="flex justify-center py-2">
          <div className="h-1 w-24 animate-pulse rounded bg-lime/30" />
        </div>
      )}
    </div>
  );
}
