"use client";

import { useState, useCallback, useEffect } from "react";
import type { JobCompanyProfileAdmin } from "@/lib/jobs/types";
import { CompanyForm } from "./company-form";
import { CompanyLinkModal } from "./company-link-modal";

interface CompanyDashboardProps {
  addToast: (type: "success" | "error", message: string) => void;
}

export function CompanyDashboard({ addToast }: CompanyDashboardProps) {
  const [companies, setCompanies] = useState<JobCompanyProfileAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [showCreate, setShowCreate] = useState(false);
  const [editingCompany, setEditingCompany] = useState<JobCompanyProfileAdmin | null>(null);
  const [linkingCompany, setLinkingCompany] = useState<JobCompanyProfileAdmin | null>(null);

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/companies");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setCompanies(data.companies ?? []);
    } catch {
      setError("Failed to load companies");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  const handleDelete = useCallback(
    async (company: JobCompanyProfileAdmin) => {
      if (!confirm(`Delete "${company.name}"? This cannot be undone.`)) return;
      try {
        const res = await fetch(`/api/admin/companies/${company.id}`, { method: "DELETE" });
        if (!res.ok) {
          const data = await res.json();
          addToast("error", data.error || "Failed to delete");
          return;
        }
        setCompanies((prev) => prev.filter((c) => c.id !== company.id));
        addToast("success", "Company deleted");
      } catch {
        addToast("error", "Failed to delete");
      }
    },
    [addToast],
  );

  const handleUnlink = useCallback(
    async (company: JobCompanyProfileAdmin) => {
      if (!confirm(`Unlink advertiser from "${company.name}"?`)) return;
      try {
        const res = await fetch(`/api/admin/companies/${company.id}/link`, { method: "DELETE" });
        if (!res.ok) throw new Error();
        setCompanies((prev) =>
          prev.map((c) =>
            c.id === company.id ? { ...c, advertiser_id: null, advertiser_email: null } : c,
          ),
        );
        addToast("success", "Advertiser unlinked");
      } catch {
        addToast("error", "Failed to unlink");
      }
    },
    [addToast],
  );

  const handleSave = useCallback(
    (company: JobCompanyProfileAdmin, isNew: boolean) => {
      if (isNew) {
        setCompanies((prev) => [{ ...company, listings_count: 0, active_count: 0 }, ...prev]);
      } else {
        setCompanies((prev) => prev.map((c) => (c.id === company.id ? { ...c, ...company } : c)));
      }
      setShowCreate(false);
      setEditingCompany(null);
      addToast("success", isNew ? "Company created" : "Company updated");
    },
    [addToast],
  );

  const handleLinked = useCallback(
    (companyId: string, email: string) => {
      setCompanies((prev) =>
        prev.map((c) =>
          c.id === companyId ? { ...c, advertiser_email: email } : c,
        ),
      );
      setLinkingCompany(null);
      addToast("success", `Linked to ${email}`);
    },
    [addToast],
  );

  return (
    <>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs text-muted">{companies.length} companies</p>
        <button
          onClick={() => setShowCreate(true)}
          className="cursor-pointer border-2 border-lime px-4 py-2 text-xs text-lime transition-colors hover:bg-lime/10"
        >
          CREATE COMPANY
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 border border-red-800 bg-red-900/20 p-4 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && companies.length === 0 && (
        <div className="space-y-0">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="border border-t-0 border-border first:border-t bg-bg-raised px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="h-3.5 w-32 animate-pulse rounded bg-border" />
                <div className="h-3 w-20 animate-pulse rounded bg-border" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      {companies.length > 0 && (
        <div className={loading ? "opacity-60 transition-opacity" : ""}>
          {/* Header */}
          <div className="hidden border border-border bg-bg-raised px-4 py-2.5 md:grid md:grid-cols-[minmax(0,2fr)_100px_80px_80px_150px_180px] md:items-center md:gap-3">
            <span className="text-xs text-muted">COMPANY</span>
            <span className="text-xs text-muted">SLUG</span>
            <span className="text-right text-xs text-muted">LISTINGS</span>
            <span className="text-right text-xs text-muted">ACTIVE</span>
            <span className="text-xs text-muted">ADVERTISER</span>
            <span className="text-right text-xs text-muted">ACTIONS</span>
          </div>

          {/* Rows */}
          {companies.map((company) => (
            <div
              key={company.id}
              className="border border-t-0 border-border first:border-t bg-bg-raised px-4 py-2.5 transition-colors hover:bg-bg-card md:grid md:grid-cols-[minmax(0,2fr)_100px_80px_80px_150px_180px] md:items-center md:gap-3"
            >
              {/* Name */}
              <div className="min-w-0">
                <p className="truncate text-sm text-cream font-medium">{company.name}</p>
                {company.website && (
                  <p className="truncate text-[11px] text-muted">
                    {company.website.replace(/^https?:\/\/(www\.)?/, "")}
                  </p>
                )}
              </div>

              {/* Slug */}
              <p className="hidden text-xs text-dim font-mono md:block">{company.slug}</p>

              {/* Listings count */}
              <p className="hidden text-right text-xs tabular-nums text-cream md:block">
                {company.listings_count ?? 0}
              </p>

              {/* Active count */}
              <p className="hidden text-right text-xs tabular-nums text-lime md:block">
                {company.active_count ?? 0}
              </p>

              {/* Advertiser */}
              <div className="hidden md:block">
                {company.advertiser_email ? (
                  <p className="truncate text-xs text-cream">{company.advertiser_email}</p>
                ) : (
                  <span className="border border-yellow-500/30 px-1.5 py-0.5 text-[10px] text-yellow-400">
                    UNLINKED
                  </span>
                )}
              </div>

              {/* Actions */}
              <div className="mt-2 flex items-center justify-end gap-1.5 md:mt-0">
                <button
                  onClick={() => setEditingCompany(company)}
                  className="cursor-pointer border border-border px-2 py-1 text-[10px] text-muted transition-colors hover:border-border-light hover:text-cream"
                >
                  EDIT
                </button>
                {company.advertiser_email ? (
                  <button
                    onClick={() => handleUnlink(company)}
                    className="cursor-pointer border border-yellow-500/30 px-2 py-1 text-[10px] text-yellow-400 transition-colors hover:bg-yellow-900/20"
                  >
                    UNLINK
                  </button>
                ) : (
                  <button
                    onClick={() => setLinkingCompany(company)}
                    className="cursor-pointer border border-lime/30 px-2 py-1 text-[10px] text-lime transition-colors hover:bg-lime/10"
                  >
                    LINK
                  </button>
                )}
                <button
                  onClick={() => handleDelete(company)}
                  className="cursor-pointer border border-red-800/50 px-2 py-1 text-[10px] text-red-400 transition-colors hover:border-red-800 hover:bg-red-900/20"
                >
                  DELETE
                </button>
              </div>

              {/* Mobile summary */}
              <div className="mt-2 flex items-center gap-3 md:hidden">
                <span className="text-xs text-dim font-mono">{company.slug}</span>
                <span className="text-xs text-cream">{company.listings_count ?? 0} listings</span>
                {company.advertiser_email ? (
                  <span className="text-xs text-muted truncate">{company.advertiser_email}</span>
                ) : (
                  <span className="text-[10px] text-yellow-400">UNLINKED</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && companies.length === 0 && !error && (
        <div className="border border-border bg-bg-raised p-8 text-center">
          <p className="text-sm text-muted">No companies yet</p>
        </div>
      )}

      {/* Modals */}
      {showCreate && (
        <CompanyForm
          mode="create"
          onSave={(c) => handleSave(c, true)}
          onClose={() => setShowCreate(false)}
        />
      )}
      {editingCompany && (
        <CompanyForm
          mode="edit"
          company={editingCompany}
          onSave={(c) => handleSave(c, false)}
          onClose={() => setEditingCompany(null)}
        />
      )}
      {linkingCompany && (
        <CompanyLinkModal
          company={linkingCompany}
          onLinked={(email) => handleLinked(linkingCompany.id, email)}
          onClose={() => setLinkingCompany(null)}
        />
      )}
    </>
  );
}
