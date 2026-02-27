"use client";

import type { AdStats } from "../_lib/types";
import { VEHICLE_LABELS } from "../_lib/constants";
import { getAdStatus, fmtDate } from "../_lib/helpers";
import { StatusBadge } from "./status-badge";

interface AdRowProps {
  ad: AdStats;
  isExpanded: boolean;
  isSelected: boolean;
  onToggleExpand: () => void;
  onToggleSelect: () => void;
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}

export function AdRow({
  ad,
  isExpanded,
  isSelected,
  onToggleExpand,
  onToggleSelect,
  onEdit,
  onToggleActive,
  onDelete,
}: AdRowProps) {
  const status = getAdStatus(ad);
  const isPaid = !!ad.plan_id;

  return (
    <div className="border border-t-0 border-border first:border-t bg-bg-raised transition-colors hover:bg-bg-card">
      {/* Main row */}
      <div
        className="cursor-pointer px-3 py-2 md:grid md:grid-cols-[24px_minmax(0,2fr)_80px_80px_80px_60px_72px_120px] md:items-center md:gap-3"
        onClick={onToggleExpand}
      >
        {/* Checkbox */}
        <div
          className="hidden md:block"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggleSelect}
            className="cursor-pointer accent-lime"
          />
        </div>

        {/* Ad info */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="shrink-0 w-[72px] text-[9px] text-dim uppercase tracking-wide">
            {VEHICLE_LABELS[ad.vehicle] ?? ad.vehicle}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-xs text-cream font-medium">{ad.brand || ad.id}</span>
              {isPaid && (
                <span className="shrink-0 border border-blue-600/30 bg-blue-900/20 px-1 py-px text-[9px] text-blue-400 leading-none">
                  PAID
                </span>
              )}
            </div>
            <p className="truncate text-[10px] text-dim">{ad.id}</p>
          </div>
        </div>

        {/* Stats - desktop */}
        <p className="hidden text-right text-xs tabular-nums text-cream md:block">
          {ad.impressions.toLocaleString()}
        </p>
        <p className="hidden text-right text-xs tabular-nums text-cream md:block">
          {ad.clicks.toLocaleString()}
        </p>
        <p className="hidden text-right text-xs tabular-nums text-cream md:block">
          {ad.cta_clicks.toLocaleString()}
        </p>
        <p className="hidden text-right text-xs tabular-nums text-lime md:block">{ad.ctr}</p>
        <div className="hidden md:block">
          <StatusBadge status={status} />
        </div>

        {/* Actions - desktop */}
        <div
          className="hidden items-center justify-end gap-1.5 md:flex"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onEdit}
            className="cursor-pointer border border-border px-1.5 py-0.5 text-[9px] text-muted transition-colors hover:border-lime hover:text-lime"
          >
            EDIT
          </button>
          <button
            onClick={onToggleActive}
            className="cursor-pointer border border-border px-1.5 py-0.5 text-[9px] text-muted transition-colors hover:border-border-light hover:text-cream"
          >
            {ad.active ? "PAUSE" : "GO"}
          </button>
          <button
            onClick={onDelete}
            className="cursor-pointer border border-red-800/50 px-1.5 py-0.5 text-[9px] text-red-400 transition-colors hover:border-red-800 hover:bg-red-900/20"
          >
            DEL
          </button>
        </div>

        {/* Stats - mobile only */}
        <div className="mt-1.5 flex items-center gap-3 md:hidden">
          <StatusBadge status={status} />
          <span className="text-[11px] text-cream">
            {ad.impressions.toLocaleString()} imp
          </span>
          <span className="text-[11px] text-cream">
            {(ad.clicks + ad.cta_clicks).toLocaleString()} clicks
          </span>
          <span className="text-[11px] text-lime">{ad.ctr}</span>
        </div>
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="border-t border-border/50 px-3 py-3">
          {/* Banner preview */}
          <div
            className="mb-3 overflow-hidden px-4 py-1.5 text-center text-xs tracking-widest"
            style={{
              backgroundColor: ad.bg_color,
              color: ad.color,
              fontFamily: "monospace",
              letterSpacing: "0.12em",
            }}
          >
            {ad.text}
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-3 lg:grid-cols-4">
            <div>
              <span className="text-[10px] text-dim">Colors</span>
              <div className="mt-0.5 flex items-center gap-1.5">
                <span
                  className="inline-block h-3.5 w-3.5 border border-border"
                  style={{ backgroundColor: ad.color }}
                />
                <span className="text-[11px] text-muted">{ad.color}</span>
                <span
                  className="inline-block h-3.5 w-3.5 border border-border"
                  style={{ backgroundColor: ad.bg_color }}
                />
                <span className="text-[11px] text-muted">{ad.bg_color}</span>
              </div>
            </div>
            <div>
              <span className="text-[10px] text-dim">Link</span>
              <p className="mt-0.5 truncate text-[11px] text-muted">
                {ad.link ? (
                  <a
                    href={ad.link}
                    target="_blank"
                    rel="noopener"
                    className="text-lime hover:underline"
                  >
                    {ad.link}
                  </a>
                ) : (
                  "-"
                )}
              </p>
            </div>
            <div>
              <span className="text-[10px] text-dim">Priority</span>
              <p className="mt-0.5 text-[11px] text-cream">{ad.priority}</p>
            </div>
            <div>
              <span className="text-[10px] text-dim">Plan</span>
              <p className="mt-0.5 text-[11px] text-cream">
                {ad.plan_id?.replace("_", " ") || "manual"}
              </p>
            </div>
            <div>
              <span className="text-[10px] text-dim">Start</span>
              <p className="mt-0.5 text-[11px] text-cream">{fmtDate(ad.starts_at)}</p>
            </div>
            <div>
              <span className="text-[10px] text-dim">End</span>
              <p className="mt-0.5 text-[11px] text-cream">{fmtDate(ad.ends_at)}</p>
            </div>
            <div>
              <span className="text-[10px] text-dim">Email</span>
              <p className="mt-0.5 truncate text-[11px] text-cream">
                {ad.purchaser_email || "-"}
              </p>
            </div>
            <div>
              <span className="text-[10px] text-dim">Created</span>
              <p className="mt-0.5 text-[11px] text-cream">{fmtDate(ad.created_at)}</p>
            </div>
          </div>

          {/* Tracking + mobile actions */}
          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border/50 pt-2">
            {ad.tracking_token && (
              <a
                href={`/advertise/track/${ad.tracking_token}`}
                target="_blank"
                className="text-[11px] text-lime hover:underline"
              >
                Open tracking page
              </a>
            )}

            {/* Mobile actions */}
            <div className="ml-auto flex gap-2 md:hidden">
              <button
                onClick={onEdit}
                className="cursor-pointer border border-border px-2.5 py-1 text-[10px] text-muted transition-colors hover:border-lime hover:text-lime"
              >
                EDIT
              </button>
              <button
                onClick={onToggleActive}
                className="cursor-pointer border border-border px-2.5 py-1 text-[10px] text-muted transition-colors hover:text-cream"
              >
                {ad.active ? "PAUSE" : "RESUME"}
              </button>
              <button
                onClick={onDelete}
                className="cursor-pointer border border-red-800/50 px-2.5 py-1 text-[10px] text-red-400 transition-colors hover:bg-red-900/20"
              >
                DELETE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
