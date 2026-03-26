"use client";

import { useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import type { AdStats, ConfirmState, ModalState } from "../_lib/types";
import { useAdsUrlState } from "../_lib/use-ads-url-state";
import { useAdsData } from "../_lib/use-ads-data";
import { useToast } from "../_lib/use-toast";
import { ToastContainer } from "./toast";
import { ConfirmDialog } from "./confirm-dialog";
import { AdModal } from "./ad-modal";
import { SummaryCards } from "./summary-cards";
import { AdFilters } from "./ad-filters";
import { BatchToolbar } from "./batch-toolbar";
import { AdTable } from "./ad-table";

export function AdsDashboard() {
  const searchParams = useSearchParams();
  const { filters, setFilter, handleSort } = useAdsUrlState();
  const { toasts, addToast, dismissToast } = useToast();
  const [reportMode, setReportMode] = useState(searchParams.get("report") === "true");

  const {
    ads,
    filteredAndSorted,
    loading,
    error,
    saving,
    totals,
    activeCount,
    paidCount,
    fetchStats,
    handleToggle,
    handleDelete,
    handleCreate,
    handleEdit,
    handleBatch,
  } = useAdsData({ filters, onToast: addToast });

  // Track whether we've ever received data (for skeleton vs stale)
  const hasDataRef = useRef(false);
  if (ads.length > 0) hasDataRef.current = true;
  const isFirstLoad = !hasDataRef.current;

  // UI state
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<ModalState>({
    open: false,
    mode: "create",
  });
  const [confirm, setConfirm] = useState<ConfirmState>({
    open: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  // Selection handlers
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const allIds = filteredAndSorted.map((ad) => ad.id);
      const allSelected = allIds.every((id) => prev.has(id));
      return allSelected ? new Set() : new Set(allIds);
    });
  }, [filteredAndSorted]);

  // Modal handlers
  const openCreateModal = useCallback(() => {
    setModal({ open: true, mode: "create" });
  }, []);

  const openEditModal = useCallback((ad: AdStats) => {
    setModal({ open: true, mode: "edit", ad });
  }, []);

  const closeModal = useCallback(() => {
    setModal({ open: false, mode: "create" });
  }, []);

  // Confirm dialog handlers
  const requestDelete = useCallback(
    (ad: AdStats) => {
      setConfirm({
        open: true,
        title: `Delete "${ad.brand || ad.id}"?`,
        message:
          "This permanently removes the ad and all its event data. This action cannot be undone.",
        onConfirm: () => handleDelete(ad.id),
      });
    },
    [handleDelete],
  );

  const closeConfirm = useCallback(() => {
    setConfirm({ open: false, title: "", message: "", onConfirm: () => {} });
  }, []);

  // Batch handlers
  const batchPause = useCallback(async () => {
    const ids = Array.from(selectedIds);
    const ok = await handleBatch(ids, "pause");
    if (ok) setSelectedIds(new Set());
  }, [selectedIds, handleBatch]);

  const batchResume = useCallback(async () => {
    const ids = Array.from(selectedIds);
    const ok = await handleBatch(ids, "resume");
    if (ok) setSelectedIds(new Set());
  }, [selectedIds, handleBatch]);

  const batchDelete = useCallback(() => {
    const count = selectedIds.size;
    setConfirm({
      open: true,
      title: `Delete ${count} ads?`,
      message:
        "This permanently removes the selected ads and all their event data. This action cannot be undone.",
      onConfirm: async () => {
        const ids = Array.from(selectedIds);
        const ok = await handleBatch(ids, "delete");
        if (ok) setSelectedIds(new Set());
      },
    });
  }, [selectedIds, handleBatch]);

  const toggleReportMode = useCallback(() => {
    setReportMode((prev) => {
      const next = !prev;
      const url = new URL(window.location.href);
      if (next) url.searchParams.set("report", "true");
      else url.searchParams.delete("report");
      window.history.replaceState({}, "", url.toString());
      return next;
    });
  }, []);

  return (
    <div className="min-h-screen bg-bg p-4 sm:p-6 lg:p-8">
      {/* Global loading bar */}
      {loading && !reportMode && (
        <div className="fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-border">
          <div
            className="h-full w-1/3 bg-lime"
            style={{ animation: "loading-slide 1s ease-in-out infinite" }}
          />
          <style>{`@keyframes loading-slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(400%); } }`}</style>
        </div>
      )}

      <div className="mx-auto max-w-7xl">
        {!reportMode && (
          <>
            {/* Toast */}
            <ToastContainer toasts={toasts} onDismiss={dismissToast} />

            {/* Confirm Dialog */}
            <ConfirmDialog state={confirm} onClose={closeConfirm} />

            {/* Ad Modal */}
            <AdModal
              open={modal.open}
              mode={modal.mode}
              ad={modal.ad}
              saving={saving}
              onClose={closeModal}
              onCreate={handleCreate}
              onEdit={handleEdit}
            />
          </>
        )}

        {/* Header */}
        {reportMode ? (
          <div className="mb-8 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xs text-lime tracking-widest">GIT CITY</span>
              <span className="text-xs text-dim">/</span>
              {filteredAndSorted.length > 0 && (
                <>
                  <span className="text-xs text-cream">{filteredAndSorted[0].brand || filteredAndSorted[0].id}</span>
                  <span className="text-xs text-dim">/</span>
                </>
              )}
              <span className="text-xs text-muted">Ad Report</span>
              <span className="text-xs text-dim">
                {filters.period === "7d" ? "Last 7 days" : filters.period === "30d" ? "Last 30 days" : "All time"}
              </span>
            </div>
            <button
              onClick={toggleReportMode}
              className="cursor-pointer text-xs text-dim hover:text-muted transition-colors"
            >
              Exit report
            </button>
          </div>
        ) : (
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl text-cream">ADS</h1>
              <p className="mt-1 text-xs text-muted">
                {ads.length} ads total / {activeCount} active / {paidCount} paid
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={toggleReportMode}
                className="cursor-pointer border border-border px-4 py-2 text-xs text-muted transition-colors hover:border-border-light hover:text-cream"
              >
                REPORT
              </button>
              <a
                href="/"
                className="border border-border px-4 py-2 text-xs text-muted transition-colors hover:border-border-light hover:text-cream"
              >
                BACK
              </a>
              <button
                onClick={openCreateModal}
                className="cursor-pointer border-2 border-lime px-4 py-2 text-xs text-lime transition-colors hover:bg-lime/10"
              >
                + NEW AD
              </button>
            </div>
          </div>
        )}

        {/* Summary Cards */}
        <SummaryCards totals={totals} periodDays={filters.period === "7d" ? 7 : filters.period === "30d" ? 30 : null} />

        {/* Filters */}
        {!reportMode && (
          <AdFilters
            filters={filters}
            setFilter={setFilter}
            onRefresh={fetchStats}
            filteredCount={filteredAndSorted.length}
            totalCount={ads.length}
          />
        )}

        {/* Error */}
        {error && !reportMode && (
          <div className="mb-4 border border-red-800 bg-red-900/20 p-4 text-xs text-red-400">
            {error}
          </div>
        )}

        {/* Batch Toolbar */}
        {!reportMode && (
          <BatchToolbar
            count={selectedIds.size}
            onPause={batchPause}
            onResume={batchResume}
            onDelete={batchDelete}
            onClear={() => setSelectedIds(new Set())}
          />
        )}

        {/* Table */}
        <AdTable
          ads={filteredAndSorted}
          loading={loading}
          isFirstLoad={isFirstLoad}
          sortKey={filters.sort}
          sortDir={filters.dir}
          expandedId={expandedId}
          selectedIds={selectedIds}
          reportMode={reportMode}
          onSort={handleSort}
          onToggleExpand={(id) =>
            setExpandedId((prev) => (prev === id ? null : id))
          }
          onToggleSelect={toggleSelect}
          onSelectAll={selectAll}
          onEdit={openEditModal}
          onToggleActive={handleToggle}
          onDelete={requestDelete}
        />
      </div>
    </div>
  );
}
