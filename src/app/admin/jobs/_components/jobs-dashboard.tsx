"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import type { JobStatus } from "@/lib/jobs/types";
import { JOB_TIERS } from "@/lib/jobs/constants";
import type { JobListingAdmin } from "./job-row";
import type { Toast } from "./toast";
import type { ConfirmState } from "./confirm-dialog";
import type { JobFilters } from "./job-filters";
import { ToastContainer } from "./toast";
import { ConfirmDialog } from "./confirm-dialog";
import { SummaryCards } from "./summary-cards";
import { JobFilters as JobFiltersComponent } from "./job-filters";
import { JobTable } from "./job-table";

// ─── Toast hook ─────────────────────────────────────────────
function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const addToast = useCallback((type: Toast["type"], message: string) => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, addToast, dismissToast };
}

// ─── Dashboard ──────────────────────────────────────────────
export function JobsDashboard() {
  const { toasts, addToast, dismissToast } = useToast();

  // Data
  const [jobs, setJobs] = useState<JobListingAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filters, setFiltersState] = useState<JobFilters>({
    status: "all",
    q: "",
    sort: "date",
    dir: "desc",
  });

  const setFilter = useCallback(
    <K extends keyof JobFilters>(key: K, value: JobFilters[K]) => {
      setFiltersState((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  // Track first load
  const hasDataRef = useRef(false);
  if (jobs.length > 0) hasDataRef.current = true;
  const isFirstLoad = !hasDataRef.current;

  // UI state
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<ConfirmState>({
    open: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  // ─── Fetch ──────────────────────────────────────────────
  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/jobs");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setJobs(data.listings ?? []);
    } catch {
      setError("Failed to load listings");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // ─── Computed ───────────────────────────────────────────
  const pendingCount = useMemo(
    () => jobs.filter((j) => j.status === "pending_review").length,
    [jobs],
  );
  const activeCount = useMemo(
    () => jobs.filter((j) => j.status === "active").length,
    [jobs],
  );
  const revenue = useMemo(
    () =>
      jobs
        .filter((j) => j.stripe_session_id)
        .reduce((sum, j) => {
          const tier = JOB_TIERS[j.tier as keyof typeof JOB_TIERS];
          return sum + (tier?.price_usd_cents ?? 0);
        }, 0),
    [jobs],
  );

  // ─── Filter + Sort ─────────────────────────────────────
  const filteredAndSorted = useMemo(() => {
    let result = [...jobs];

    // Status filter
    if (filters.status !== "all") {
      result = result.filter((j) => j.status === filters.status);
    }

    // Search
    if (filters.q.trim()) {
      const q = filters.q.toLowerCase();
      result = result.filter(
        (j) =>
          j.title.toLowerCase().includes(q) ||
          j.company?.name?.toLowerCase().includes(q),
      );
    }

    // Sort
    result.sort((a, b) => {
      const dir = filters.dir === "asc" ? 1 : -1;
      switch (filters.sort) {
        case "date":
          return (
            dir *
            (new Date(a.created_at).getTime() -
              new Date(b.created_at).getTime())
          );
        case "salary":
          return dir * (a.salary_max - b.salary_max);
        case "views":
          return dir * (a.view_count - b.view_count);
        case "applies":
          return dir * (a.apply_count - b.apply_count);
        default:
          return 0;
      }
    });

    return result;
  }, [jobs, filters]);

  // ─── Actions ────────────────────────────────────────────
  const handleApprove = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/jobs/${id}/approve`, { method: "POST" });
        if (!res.ok) throw new Error();
        setJobs((prev) =>
          prev.map((j) =>
            j.id === id
              ? {
                  ...j,
                  status: "active" as JobStatus,
                  published_at: new Date().toISOString(),
                  expires_at: new Date(
                    Date.now() + 30 * 86400000,
                  ).toISOString(),
                }
              : j,
          ),
        );
        addToast("success", "Listing approved");
      } catch {
        addToast("error", "Failed to approve");
      }
    },
    [addToast],
  );

  const handleReject = useCallback(
    async (id: string, reason: string) => {
      try {
        const res = await fetch(`/api/jobs/${id}/reject`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        });
        if (!res.ok) throw new Error();
        setJobs((prev) =>
          prev.map((j) =>
            j.id === id
              ? {
                  ...j,
                  status: "rejected" as JobStatus,
                  rejection_reason: reason,
                }
              : j,
          ),
        );
        addToast("success", "Listing rejected");
      } catch {
        addToast("error", "Failed to reject");
      }
    },
    [addToast],
  );

  const handlePause = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/admin/jobs/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "pause" }),
        });
        if (!res.ok) throw new Error();
        setJobs((prev) =>
          prev.map((j) =>
            j.id === id ? { ...j, status: "paused" as JobStatus } : j,
          ),
        );
        addToast("success", "Listing paused");
      } catch {
        addToast("error", "Failed to pause");
      }
    },
    [addToast],
  );

  const handleResume = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/admin/jobs/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "resume" }),
        });
        if (!res.ok) throw new Error();
        setJobs((prev) =>
          prev.map((j) =>
            j.id === id ? { ...j, status: "active" as JobStatus } : j,
          ),
        );
        addToast("success", "Listing resumed");
      } catch {
        addToast("error", "Failed to resume");
      }
    },
    [addToast],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/admin/jobs/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "delete" }),
        });
        if (!res.ok) throw new Error();
        setJobs((prev) => prev.filter((j) => j.id !== id));
        addToast("success", "Listing deleted");
      } catch {
        addToast("error", "Failed to delete");
      }
    },
    [addToast],
  );

  // ─── Batch ──────────────────────────────────────────────
  const batchApprove = useCallback(async () => {
    const ids = Array.from(selectedIds);
    let ok = 0;
    for (const id of ids) {
      try {
        const res = await fetch(`/api/jobs/${id}/approve`, { method: "POST" });
        if (res.ok) ok++;
      } catch {
        /* skip */
      }
    }
    if (ok > 0) {
      setJobs((prev) =>
        prev.map((j) =>
          selectedIds.has(j.id) && j.status === "pending_review"
            ? {
                ...j,
                status: "active" as JobStatus,
                published_at: new Date().toISOString(),
                expires_at: new Date(
                  Date.now() + 30 * 86400000,
                ).toISOString(),
              }
            : j,
        ),
      );
      addToast("success", `${ok} listing(s) approved`);
      setSelectedIds(new Set());
    }
  }, [selectedIds, addToast]);

  const batchReject = useCallback(() => {
    const count = selectedIds.size;
    setConfirm({
      open: true,
      title: `Reject ${count} listings?`,
      message:
        "All selected pending listings will be rejected. This cannot be undone.",
      withReason: true,
      onConfirm: async () => {
        const ids = Array.from(selectedIds);
        let ok = 0;
        for (const id of ids) {
          try {
            const res = await fetch(`/api/jobs/${id}/reject`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ reason: "Batch rejection" }),
            });
            if (res.ok) ok++;
          } catch {
            /* skip */
          }
        }
        if (ok > 0) {
          setJobs((prev) =>
            prev.map((j) =>
              selectedIds.has(j.id) && j.status === "pending_review"
                ? { ...j, status: "rejected" as JobStatus }
                : j,
            ),
          );
          addToast("success", `${ok} listing(s) rejected`);
          setSelectedIds(new Set());
        }
      },
    });
  }, [selectedIds, addToast]);

  const batchDelete = useCallback(() => {
    const count = selectedIds.size;
    setConfirm({
      open: true,
      title: `Delete ${count} listings?`,
      message:
        "This permanently removes the selected listings. This action cannot be undone.",
      onConfirm: async () => {
        const ids = Array.from(selectedIds);
        let ok = 0;
        for (const id of ids) {
          try {
            const res = await fetch(`/api/admin/jobs/${id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "delete" }),
            });
            if (res.ok) ok++;
          } catch {
            /* skip */
          }
        }
        if (ok > 0) {
          setJobs((prev) => prev.filter((j) => !selectedIds.has(j.id)));
          addToast("success", `${ok} listing(s) deleted`);
          setSelectedIds(new Set());
        }
      },
    });
  }, [selectedIds, addToast]);

  // ─── Selection ──────────────────────────────────────────
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
      const allIds = filteredAndSorted.map((j) => j.id);
      const allSelected = allIds.every((id) => prev.has(id));
      return allSelected ? new Set() : new Set(allIds);
    });
  }, [filteredAndSorted]);

  // ─── Confirm helpers ────────────────────────────────────
  const requestApprove = useCallback(
    (id: string) => {
      setConfirm({
        open: true,
        title: "Approve this listing?",
        message:
          "The listing will go live immediately and expire in 30 days.",
        onConfirm: () => handleApprove(id),
      });
    },
    [handleApprove],
  );

  const requestRejectWithReason = useCallback(
    (job: JobListingAdmin) => {
      const reason = prompt("Rejection reason (sent to the company):");
      if (reason && reason.trim()) {
        handleReject(job.id, reason.trim());
      }
    },
    [handleReject],
  );

  const requestPause = useCallback(
    (id: string) => {
      handlePause(id);
    },
    [handlePause],
  );

  const requestResume = useCallback(
    (id: string) => {
      handleResume(id);
    },
    [handleResume],
  );

  const requestDelete = useCallback(
    (job: JobListingAdmin) => {
      setConfirm({
        open: true,
        title: `Delete "${job.title}"?`,
        message:
          "This permanently removes the listing. This action cannot be undone.",
        onConfirm: () => handleDelete(job.id),
      });
    },
    [handleDelete],
  );

  const closeConfirm = useCallback(() => {
    setConfirm({ open: false, title: "", message: "", onConfirm: () => {} });
  }, []);

  return (
    <div className="min-h-screen bg-bg p-4 sm:p-6 lg:p-8">
      {/* Global loading bar */}
      {loading && (
        <div className="fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-border">
          <div
            className="h-full w-1/3 bg-lime"
            style={{
              animation: "loading-slide 1s ease-in-out infinite",
            }}
          />
          <style>{`@keyframes loading-slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(400%); } }`}</style>
        </div>
      )}

      <div className="mx-auto max-w-7xl">
        {/* Toast */}
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />

        {/* Confirm Dialog */}
        <ConfirmDialog state={confirm} onClose={closeConfirm} />

        {/* Header */}
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl text-cream">JOBS</h1>
            <p className="mt-1 text-xs text-muted">
              {jobs.length} listings total / {activeCount} active
              {pendingCount > 0 && (
                <span className="ml-1 text-yellow-400">
                  / {pendingCount} pending
                </span>
              )}
            </p>
          </div>
          <div className="flex gap-3">
            <a
              href="/"
              className="border border-border px-4 py-2 text-xs text-muted transition-colors hover:border-border-light hover:text-cream"
            >
              BACK
            </a>
            <a
              href="/jobs"
              target="_blank"
              className="border border-border px-4 py-2 text-xs text-muted transition-colors hover:border-border-light hover:text-cream"
            >
              VIEW BOARD
            </a>
          </div>
        </div>

        {/* Summary Cards */}
        <SummaryCards
          total={jobs.length}
          pending={pendingCount}
          active={activeCount}
          revenue={revenue}
        />

        {/* Filters */}
        <JobFiltersComponent
          filters={filters}
          setFilter={setFilter}
          onRefresh={fetchJobs}
          filteredCount={filteredAndSorted.length}
          totalCount={jobs.length}
        />

        {/* Error */}
        {error && (
          <div className="mb-4 border border-red-800 bg-red-900/20 p-4 text-xs text-red-400">
            {error}
          </div>
        )}

        {/* Batch Toolbar */}
        {selectedIds.size > 0 && (
          <div className="mb-4 flex items-center gap-3 border border-lime/30 bg-lime/5 px-4 py-3">
            <span className="text-xs text-lime">
              {selectedIds.size} selected
            </span>
            <div className="ml-auto flex gap-2">
              <button
                onClick={batchApprove}
                className="cursor-pointer border-2 border-lime px-3 py-1.5 text-[11px] text-lime transition-colors hover:bg-lime/10"
              >
                APPROVE ALL
              </button>
              <button
                onClick={batchReject}
                className="cursor-pointer border border-red-800/50 px-3 py-1.5 text-[11px] text-red-400 transition-colors hover:bg-red-900/20"
              >
                REJECT ALL
              </button>
              <button
                onClick={batchDelete}
                className="cursor-pointer border border-red-800/50 px-3 py-1.5 text-[11px] text-red-400 transition-colors hover:bg-red-900/20"
              >
                DELETE ALL
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="cursor-pointer px-3 py-1.5 text-[11px] text-dim transition-colors hover:text-cream"
              >
                CLEAR
              </button>
            </div>
          </div>
        )}

        {/* Table */}
        <JobTable
          jobs={filteredAndSorted}
          loading={loading}
          isFirstLoad={isFirstLoad}
          expandedId={expandedId}
          selectedIds={selectedIds}
          onToggleExpand={(id) =>
            setExpandedId((prev) => (prev === id ? null : id))
          }
          onToggleSelect={toggleSelect}
          onSelectAll={selectAll}
          onApprove={requestApprove}
          onReject={requestRejectWithReason}
          onPause={requestPause}
          onResume={requestResume}
          onDelete={requestDelete}
        />
      </div>
    </div>
  );
}
