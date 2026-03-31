"use client";

import { useState } from "react";
import type { AdStats } from "../_lib/types";
import { VEHICLE_LABELS } from "../_lib/constants";
import { getAdStatus, fmtDate, fmtDateShort, fmtEndsIn } from "../_lib/helpers";
import { StatusBadge } from "./status-badge";

interface AdRowProps {
  ad: AdStats;
  isExpanded: boolean;
  isSelected: boolean;
  reportMode?: boolean;
  onToggleExpand: () => void;
  onToggleSelect: () => void;
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}

function fmtShort(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

function SparkChart({ data }: { data: number[] }) {
  const max = Math.max(...data, 1);
  const total = data.reduce((a, b) => a + b, 0);
  const dayLabels = data.map((_, i) => {
    const d = new Date(Date.now() - (data.length - 1 - i) * 86400000);
    return d.toLocaleDateString("en", { weekday: "short" });
  });

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-xs text-dim">Views (last 7 days)</span>
        <span className="text-xs tabular-nums text-cream">{fmtShort(total)} total</span>
      </div>
      <div className="flex gap-2">
        {data.map((v, i) => {
          const h = Math.max(Math.round((v / max) * 64), 3);
          return (
            <div key={i} className="flex flex-col items-center gap-1 flex-1">
              <span className="text-[10px] tabular-nums text-muted leading-none">
                {v > 0 ? fmtShort(v) : "0"}
              </span>
              <div className="w-full flex items-end" style={{ height: 64 }}>
                <div
                  className="w-full bg-lime/30 rounded-t-sm"
                  style={{ height: h }}
                />
              </div>
              <span className="text-[10px] text-dim leading-none">{dayLabels[i]}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AdRow({
  ad,
  isExpanded,
  isSelected,
  reportMode,
  onToggleExpand,
  onToggleSelect,
  onEdit,
  onToggleActive,
  onDelete,
}: AdRowProps) {
  const status = getAdStatus(ad);
  const isPaid = !!ad.plan_id;
  const [showTechnical, setShowTechnical] = useState(false);

  const endsLabel = fmtEndsIn(ad.ends_at);
  const endsColor = status === "expired" ? "text-red-400" : endsLabel.includes("d left") && parseInt(endsLabel) <= 3 ? "text-yellow-400" : "text-dim";

  const gridCols = reportMode
    ? "md:grid-cols-[minmax(0,2fr)_80px_80px_64px_88px_76px]"
    : "md:grid-cols-[24px_minmax(0,2fr)_80px_80px_64px_88px_76px_130px]";

  return (
    <div className="border border-t-0 border-border first:border-t bg-bg-raised transition-colors hover:bg-bg-card">
      {/* Main row */}
      <div
        className={`${reportMode ? "" : "cursor-pointer"} px-4 py-2.5 md:grid ${gridCols} md:items-center md:gap-3`}
        onClick={reportMode ? undefined : onToggleExpand}
      >
        {/* Checkbox */}
        {!reportMode && (
          <div className="hidden md:block" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={isSelected}
              onChange={onToggleSelect}
              className="cursor-pointer accent-lime"
            />
          </div>
        )}

        {/* Ad info */}
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="shrink-0 w-18 text-[10px] text-dim uppercase tracking-wide">
            {VEHICLE_LABELS[ad.vehicle] ?? ad.vehicle}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm text-cream font-medium">{ad.brand || ad.id}</span>
              {isPaid && !reportMode && (
                <span className="shrink-0 border border-blue-600/30 bg-blue-900/20 px-1.5 py-0.5 text-[10px] text-blue-400 leading-none">
                  PAID
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Stats - desktop */}
        <p className="hidden text-right text-sm tabular-nums text-cream md:block">
          {ad.impressions.toLocaleString()}
        </p>
        <p className="hidden text-right text-sm tabular-nums text-cream md:block">
          {ad.cta_clicks.toLocaleString()}
        </p>
        <p className="hidden text-right text-sm tabular-nums text-lime md:block">{ad.ctr}</p>
        <p className={`hidden text-right text-xs tabular-nums md:block ${endsColor}`}>
          {endsLabel}
        </p>
        <div className="hidden md:block">
          <StatusBadge status={status} />
        </div>

        {/* Actions - desktop */}
        {!reportMode && (
          <div
            className="hidden items-center justify-end gap-1.5 md:flex"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={onEdit}
              className="cursor-pointer border border-border px-2 py-1 text-[10px] text-muted transition-colors hover:border-lime hover:text-lime"
            >
              EDIT
            </button>
            <button
              onClick={onToggleActive}
              className="cursor-pointer border border-border px-2 py-1 text-[10px] text-muted transition-colors hover:border-border-light hover:text-cream"
            >
              {ad.active ? "PAUSE" : "GO"}
            </button>
            <button
              onClick={onDelete}
              className="cursor-pointer border border-red-800/50 px-2 py-1 text-[10px] text-red-400 transition-colors hover:border-red-800 hover:bg-red-900/20"
            >
              DEL
            </button>
          </div>
        )}

        {/* Stats - mobile only */}
        <div className="mt-2 flex items-center gap-3 md:hidden">
          <StatusBadge status={status} />
          <span className="text-xs text-cream">
            {ad.impressions.toLocaleString()} views
          </span>
          <span className="text-xs text-cream">
            {ad.cta_clicks.toLocaleString()} clicks
          </span>
          <span className="text-xs text-lime">{ad.ctr}</span>
        </div>
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="border-t border-border/50 px-4 py-5">
          {/* Chart */}
          {ad.daily && ad.daily.length > 0 && (
            <div className="mb-5">
              <SparkChart data={ad.daily} />
            </div>
          )}

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
            <div>
              <span className="text-xs text-dim">Link</span>
              <p className="mt-1 truncate text-sm">
                {ad.link ? (
                  <a href={ad.link} target="_blank" rel="noopener" className="text-lime hover:underline">
                    {ad.link.replace(/^https?:\/\/(www\.)?/, "")}
                  </a>
                ) : (
                  <span className="text-muted">-</span>
                )}
              </p>
            </div>
            <div>
              <span className="text-xs text-dim">Email</span>
              <p className="mt-1 truncate text-sm text-cream">
                {ad.purchaser_email || "-"}
              </p>
            </div>
            <div>
              <span className="text-xs text-dim">Period</span>
              <p className="mt-1 text-sm text-cream">
                {fmtDateShort(ad.starts_at)} - {fmtDateShort(ad.ends_at)}
                {status === "active" && ad.ends_at && (
                  <span className="ml-1 text-dim">({fmtEndsIn(ad.ends_at)})</span>
                )}
              </p>
            </div>
            {ad.description && (
              <div>
                <span className="text-xs text-dim">Note</span>
                <p className="mt-1 text-sm text-cream">{ad.description}</p>
              </div>
            )}
          </div>

          {/* Footer: tracking link + technical toggle + mobile actions */}
          {!reportMode && (
            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border/50 pt-3">
              {ad.tracking_token && (
                <a
                  href={`/advertise/track/${ad.tracking_token}`}
                  target="_blank"
                  className="text-xs text-lime hover:underline"
                >
                  Open tracking page
                </a>
              )}

              <button
                onClick={() => setShowTechnical(!showTechnical)}
                className="cursor-pointer text-xs text-dim hover:text-muted transition-colors"
              >
                {showTechnical ? "Hide" : "Show"} technical details
              </button>

              {/* Mobile actions */}
              <div className="ml-auto flex gap-2 md:hidden">
                <button
                  onClick={onEdit}
                  className="cursor-pointer border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:border-lime hover:text-lime"
                >
                  EDIT
                </button>
                <button
                  onClick={onToggleActive}
                  className="cursor-pointer border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:text-cream"
                >
                  {ad.active ? "PAUSE" : "RESUME"}
                </button>
                <button
                  onClick={onDelete}
                  className="cursor-pointer border border-red-800/50 px-3 py-1.5 text-xs text-red-400 transition-colors hover:bg-red-900/20"
                >
                  DELETE
                </button>
              </div>
            </div>
          )}

          {/* Technical details (admin only) */}
          {showTechnical && !reportMode && (
            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2.5 border-t border-border/50 pt-3 sm:grid-cols-3 lg:grid-cols-4">
              <div>
                <span className="text-xs text-dim">ID</span>
                <p className="mt-0.5 text-xs text-muted font-mono">{ad.id}</p>
              </div>
              <div>
                <span className="text-xs text-dim">Colors</span>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span className="inline-block h-4 w-4 border border-border" style={{ backgroundColor: ad.color }} />
                  <span className="text-xs text-muted">{ad.color}</span>
                  <span className="inline-block h-4 w-4 border border-border" style={{ backgroundColor: ad.bg_color }} />
                  <span className="text-xs text-muted">{ad.bg_color}</span>
                </div>
              </div>
              <div>
                <span className="text-xs text-dim">Priority</span>
                <p className="mt-0.5 text-xs text-cream">{ad.priority}</p>
              </div>
              <div>
                <span className="text-xs text-dim">Plan</span>
                <p className="mt-0.5 text-xs text-cream">{ad.plan_id?.replace("_", " ") || "manual"}</p>
              </div>
              <div>
                <span className="text-xs text-dim">3D Clicks</span>
                <p className="mt-0.5 text-xs text-cream">{ad.clicks.toLocaleString()}</p>
              </div>
              <div>
                <span className="text-xs text-dim">CPC</span>
                <p className="mt-0.5 text-xs text-cream">{ad.cpc || "-"}</p>
              </div>
              <div>
                <span className="text-xs text-dim">Paid</span>
                <p className="mt-0.5 text-xs text-cream">
                  {ad.amount_paid_cents
                    ? `${ad.currency === "brl" ? "R$" : "$"}${(ad.amount_paid_cents / 100).toFixed(2)}`
                    : "-"}
                </p>
              </div>
              <div>
                <span className="text-xs text-dim">Token</span>
                <p className="mt-0.5 truncate text-xs text-muted font-mono">{ad.tracking_token || "-"}</p>
              </div>
              <div>
                <span className="text-xs text-dim">Created</span>
                <p className="mt-0.5 text-xs text-cream">{fmtDate(ad.created_at)}</p>
              </div>
              {ad.vehicle !== "landmark" && ad.text && (
                <div className="col-span-full">
                  <span className="text-xs text-dim">Banner preview</span>
                  <div
                    className="mt-1 overflow-hidden px-4 py-2 text-center text-sm tracking-widest"
                    style={{ backgroundColor: ad.bg_color, color: ad.color, fontFamily: "monospace", letterSpacing: "0.12em" }}
                  >
                    {ad.text}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
