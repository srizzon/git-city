"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import type { JobListing } from "@/lib/jobs/types";
import {
  SENIORITY_LABELS,
  ROLE_TYPE_LABELS,
  CONTRACT_LABELS,
  WEB_TYPE_LABELS,
} from "@/lib/jobs/constants";

interface JobsResponse {
  listings: JobListing[];
  total: number;
  page: number;
}

const ROLE_OPTIONS = ["frontend", "backend", "fullstack", "devops", "mobile", "data", "design", "other"] as const;
const SENIORITY_OPTIONS = ["junior", "mid", "senior", "staff", "lead"] as const;
const CONTRACT_OPTIONS = ["clt", "pj", "contract"] as const;
const WEB_OPTIONS = ["web2", "web3", "both"] as const;

export default function JobBoardClient() {
  const [listings, setListings] = useState<JobListing[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [role, setRole] = useState("");
  const [seniority, setSeniority] = useState("");
  const [contract, setContract] = useState("");
  const [salaryMin, setSalaryMin] = useState("");
  const [web, setWeb] = useState("");
  const [sort, setSort] = useState("recent");
  const resultsRef = useRef<HTMLDivElement>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setError(false);
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (role) params.set("role", role);
    if (seniority) params.set("seniority", seniority);
    if (contract) params.set("contract", contract);
    if (web) params.set("web", web);
    if (salaryMin) params.set("salary_min", salaryMin);
    if (sort !== "recent") params.set("sort", sort);
    params.set("page", String(page));

    try {
      const res = await fetch(`/api/jobs?${params}`);
      if (!res.ok) throw new Error();
      const data: JobsResponse = await res.json();
      setListings(data.listings);
      setTotal(data.total);
    } catch {
      setError(true);
    }
    setLoading(false);
  }, [debouncedSearch, role, seniority, contract, web, salaryMin, sort, page]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, role, seniority, contract, web, salaryMin, sort]);

  const totalPages = Math.ceil(total / 20);
  const hasFilters = !!(role || seniority || contract || web || salaryMin || debouncedSearch);

  const clearFilters = () => {
    setSearch(""); setRole(""); setSeniority(""); setContract("");
    setWeb(""); setSalaryMin(""); setSort("recent");
  };

  return (
    <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link href="/" className="text-xs text-muted transition-colors hover:text-cream">
              &lt; Back to city
            </Link>
            <h1 className="mt-3 text-2xl text-lime sm:text-3xl">
              Git City Jobs
            </h1>
            <p className="mt-1 text-sm text-muted">
              {total} open position{total !== 1 ? "s" : ""} · real devs. real jobs.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/jobs/career-profile"
              className="btn-press border-[3px] border-border px-4 py-2 text-xs text-cream transition-colors hover:border-border-light"
            >
              Career Profile
            </Link>
            <Link
              href="/jobs/my-applications"
              className="btn-press border-[3px] border-border px-4 py-2 text-xs text-cream transition-colors hover:border-border-light"
            >
              My Applications
            </Link>
          </div>
        </div>

        {/* Search */}
        <div className="mt-6">
          <input
            type="text"
            placeholder="Search jobs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search jobs"
            className="w-full border-[3px] border-border bg-bg-raised px-5 py-3 text-sm text-cream normal-case outline-none placeholder:text-dim focus-visible:border-lime"
          />
        </div>

        {/* Filters — all chips, no native selects */}
        <div className="mt-4 space-y-3">
          {/* Row 1: Role chips */}
          <div className="flex flex-wrap gap-1.5">
            {ROLE_OPTIONS.map((r) => (
              <FilterChip key={r} active={role === r} onClick={() => setRole(role === r ? "" : r)}>
                {ROLE_TYPE_LABELS[r]}
              </FilterChip>
            ))}
          </div>

          {/* Row 2: Seniority + Contract + Sort */}
          <div className="flex flex-wrap items-center gap-1.5">
            {SENIORITY_OPTIONS.map((s) => (
              <FilterChip key={s} active={seniority === s} onClick={() => setSeniority(seniority === s ? "" : s)}>
                {SENIORITY_LABELS[s]}
              </FilterChip>
            ))}

            <span className="mx-1 h-4 w-px bg-border/50" />

            {CONTRACT_OPTIONS.map((c) => (
              <FilterChip key={c} active={contract === c} onClick={() => setContract(contract === c ? "" : c)}>
                {CONTRACT_LABELS[c]}
              </FilterChip>
            ))}

            <span className="mx-1 h-4 w-px bg-border/50" />

            {WEB_OPTIONS.map((w) => (
              <FilterChip key={w} active={web === w} onClick={() => setWeb(web === w ? "" : w)}>
                {WEB_TYPE_LABELS[w]}
              </FilterChip>
            ))}

            <span className="mx-1 h-4 w-px bg-border/50" />

            <FilterChip active={sort === "salary"} onClick={() => setSort(sort === "salary" ? "recent" : "salary")}>
              Highest Salary
            </FilterChip>
          </div>

          {/* Row 3: Salary min + Clear */}
          <div className="flex items-center gap-2">
            <input
              type="number"
              placeholder="Min salary..."
              value={salaryMin}
              onChange={(e) => setSalaryMin(e.target.value)}
              aria-label="Minimum salary filter"
              className="w-32 border-[3px] border-border bg-bg-raised px-3 py-2 text-xs text-cream normal-case outline-none placeholder:text-dim focus-visible:border-lime"
            />
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="text-xs text-muted transition-colors hover:text-cream"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>

        {/* Results */}
        <div ref={resultsRef} className="mt-6" aria-live="polite">
          {loading ? (
            /* Skeleton loading */
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="border-[3px] border-border bg-bg-raised p-5">
                  <div className="h-4 w-2/3 animate-pulse bg-border" />
                  <div className="mt-2 h-3 w-1/3 animate-pulse bg-border" />
                  <div className="mt-2 flex gap-1">
                    <div className="h-5 w-16 animate-pulse bg-border" />
                    <div className="h-5 w-12 animate-pulse bg-border" />
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="border-[3px] border-red-500/30 bg-red-500/5 p-8 text-center space-y-4">
              <p className="text-sm text-red-400 normal-case">Failed to load jobs</p>
              <button
                onClick={fetchJobs}
                className="btn-press border-[3px] border-border px-5 py-2 text-xs text-cream"
              >
                Try Again
              </button>
            </div>
          ) : listings.length === 0 ? (
            <div className="border-[3px] border-border bg-bg-raised p-10 text-center space-y-4">
              <p className="text-sm text-muted">No jobs match your filters.</p>
              {hasFilters && (
                <button
                  onClick={clearFilters}
                  className="btn-press border-[3px] border-border px-5 py-2 text-xs text-cream"
                >
                  Clear Filters
                </button>
              )}
              <div>
                <Link
                  href="/jobs/career-profile"
                  className="btn-press inline-block bg-lime px-6 py-3 text-xs text-bg"
                  style={{ boxShadow: "3px 3px 0 0 #5a7a00" }}
                >
                  Create Career Profile
                </Link>
                <p className="mt-2 text-[10px] text-dim normal-case">Be ready when jobs drop</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {listings.map((job) => (
                <Link
                  key={job.id}
                  href={`/jobs/${job.id}`}
                  aria-label={`${job.title} at ${job.company?.name ?? "Company"} — ${job.salary_currency} ${job.salary_min.toLocaleString()}–${job.salary_max.toLocaleString()}`}
                  className="block border-[3px] border-border bg-bg-raised p-5 transition-colors hover:border-border-light"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2">
                        {(job.tier === "featured" || job.tier === "premium") && (
                          <span
                            className="shrink-0 border-2 px-1.5 py-0.5 text-[10px]"
                            style={{
                              borderColor: job.tier === "premium" ? "#fbbf24" : "#c8e64a",
                              color: job.tier === "premium" ? "#fbbf24" : "#c8e64a",
                            }}
                          >
                            {job.tier === "premium" ? "Premium" : "Featured"}
                          </span>
                        )}
                        <h3 className="truncate text-sm text-cream">{job.title}</h3>
                      </div>
                      <p className="text-xs text-muted">
                        {job.company?.name ?? "Company"} · {SENIORITY_LABELS[job.seniority]} · {WEB_TYPE_LABELS[job.web_type]}
                      </p>
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        {job.tech_stack.slice(0, 6).map((tag) => (
                          <span
                            key={tag}
                            className="border-2 px-1.5 py-0.5 text-[10px]"
                            style={{ borderColor: "rgba(200,230,74,0.2)", color: "#c8e64a" }}
                          >
                            {tag}
                          </span>
                        ))}
                        {job.tech_stack.length > 6 && (
                          <span className="px-1.5 py-0.5 text-[10px] text-dim">
                            +{job.tech_stack.length - 6}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm text-lime">
                        {job.salary_currency} {job.salary_min.toLocaleString()}–{job.salary_max.toLocaleString()}
                        <span className="text-[10px] text-dim ml-1">/mo</span>
                      </p>
                      <div className="mt-1.5 flex justify-end gap-2 text-[10px] text-dim">
                        {job.badge_response_guaranteed && <span>Response OK</span>}
                        {job.badge_no_ai_screening && <span>No AI</span>}
                        <span>Verified</span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              onClick={() => { setPage(Math.max(1, page - 1)); resultsRef.current?.scrollIntoView({ behavior: "smooth" }); }}
              disabled={page === 1}
              className="btn-press border-[3px] border-border px-4 py-2 text-xs text-cream disabled:opacity-30"
            >
              Prev
            </button>
            <span className="px-3 py-2 text-xs text-muted">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => { setPage(Math.min(totalPages, page + 1)); resultsRef.current?.scrollIntoView({ behavior: "smooth" }); }}
              disabled={page === totalPages}
              className="btn-press border-[3px] border-border px-4 py-2 text-xs text-cream disabled:opacity-30"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

/* ── Filter chip ── */
function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className="border-[3px] px-3 py-1.5 text-xs transition-colors"
      style={{
        borderColor: active ? "#c8e64a" : "var(--color-border)",
        color: active ? "#c8e64a" : "var(--color-muted)",
        backgroundColor: active ? "rgba(200,230,74,0.08)" : "transparent",
      }}
    >
      {children}
    </button>
  );
}
