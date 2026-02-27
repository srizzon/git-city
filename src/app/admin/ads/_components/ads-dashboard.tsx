"use client";

import { useState, useCallback, useRef } from "react";
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
  const { filters, setFilter, handleSort } = useAdsUrlState();
  const { toasts, addToast, dismissToast } = useToast();

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

  return (
    <div className="min-h-screen bg-bg p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
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

        {/* Header */}
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl text-cream">ADS</h1>
            <p className="mt-1 text-xs text-muted">
              {ads.length} ads total / {activeCount} active / {paidCount} paid
            </p>
          </div>
          <div className="flex gap-3">
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

        {/* Summary Cards */}
        <SummaryCards totals={totals} />

        {/* Filters */}
        <AdFilters
          filters={filters}
          setFilter={setFilter}
          onRefresh={fetchStats}
          filteredCount={filteredAndSorted.length}
          totalCount={ads.length}
        />

        {/* Error */}
        {error && (
          <div className="mb-4 border border-red-800 bg-red-900/20 p-4 text-xs text-red-400">
            {error}
          </div>
        )}

        {/* Batch Toolbar */}
        <BatchToolbar
          count={selectedIds.size}
          onPause={batchPause}
          onResume={batchResume}
          onDelete={batchDelete}
          onClear={() => setSelectedIds(new Set())}
        />

        {/* Table */}
        <AdTable
          ads={filteredAndSorted}
          loading={loading}
          isFirstLoad={isFirstLoad}
          sortKey={filters.sort}
          sortDir={filters.dir}
          expandedId={expandedId}
          selectedIds={selectedIds}
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
