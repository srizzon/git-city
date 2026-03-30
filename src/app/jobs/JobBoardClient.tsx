"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import type { JobListing } from "@/lib/jobs/types";
import {
  SENIORITY_LABELS,
  ROLE_TYPE_LABELS,
  CONTRACT_LABELS,
  WEB_TYPE_LABELS,
  LOCATION_TYPE_LABELS,
  LOCATION_RESTRICTION_LABELS,
  SALARY_PERIOD_LABELS,
} from "@/lib/jobs/constants";

/* ─── Types ─── */

interface JobsResponse {
  listings: JobListing[];
  total: number;
  page: number;
}

/* ─── Filter options ─── */

const ROLE_OPTIONS = [
  "frontend", "backend", "fullstack", "mobile", "devops", "cloud", "sre",
  "data", "ai_ml", "security", "qa", "blockchain", "embedded", "gamedev",
  "design", "engineering_manager", "other",
] as const;

const SENIORITY_OPTIONS = ["intern", "junior", "mid", "senior", "staff", "lead", "principal", "director"] as const;

const CONTRACT_OPTIONS = ["fulltime", "parttime", "clt", "pj", "contract", "freelance", "internship"] as const;

const SALARY_BRACKETS = [
  { label: "5k+", value: "5000" },
  { label: "10k+", value: "10000" },
  { label: "15k+", value: "15000" },
  { label: "20k+", value: "20000" },
  { label: "30k+", value: "30000" },
] as const;

/* ─── Helpers ─── */

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function companyGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const h1 = Math.abs(hash % 360);
  const h2 = (h1 + 40 + Math.abs((hash >> 8) % 60)) % 360;
  return `linear-gradient(135deg, hsl(${h1}, 60%, 45%), hsl(${h2}, 50%, 35%))`;
}

function fmtSalary(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return String(n);
}

/** Toggle a value in a Set-like comma string. Returns new string. */
function toggleSet(current: string, value: string): string {
  const set = new Set(current.split(",").filter(Boolean));
  if (set.has(value)) set.delete(value);
  else set.add(value);
  return [...set].join(",");
}

function setHas(csv: string, value: string): boolean {
  return csv.split(",").includes(value);
}

/* ─── URL Sync Hook ─── */

function useUrlFilters(initialFilters?: Record<string, string>) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const getParam = (key: string) => searchParams.get(key) ?? initialFilters?.[key] ?? "";

  const [q, setQ] = useState(getParam("q"));
  const [roles, setRoles] = useState(getParam("role"));
  const [seniorities, setSeniorities] = useState(getParam("seniority"));
  const [contracts, setContracts] = useState(getParam("contract"));
  const [location, setLocation] = useState(getParam("location"));
  const [salaryMin, setSalaryMin] = useState(getParam("salary_min"));
  const [sort, setSort] = useState(getParam("sort") || "recent");
  const [page, setPage] = useState(parseInt(getParam("page") || "1"));
  const [stack] = useState(initialFilters?.stack ?? "");

  // On programmatic pages (/jobs/t/react), don't sync filters that come from the route
  const isTagPage = pathname.startsWith("/jobs/t/");

  const syncUrl = useCallback(() => {
    if (isTagPage) {
      // Only sync user-changed params (page, sort, extra filters) as query string
      const p = new URLSearchParams();
      if (q) p.set("q", q);
      if (sort && sort !== "recent") p.set("sort", sort);
      if (page > 1) p.set("page", String(page));
      const qs = p.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    } else {
      const p = new URLSearchParams();
      if (q) p.set("q", q);
      if (roles) p.set("role", roles);
      if (seniorities) p.set("seniority", seniorities);
      if (contracts) p.set("contract", contracts);
      if (location) p.set("location", location);
      if (salaryMin) p.set("salary_min", salaryMin);
      if (sort && sort !== "recent") p.set("sort", sort);
      if (page > 1) p.set("page", String(page));
      const qs = p.toString();
      router.replace(`/jobs${qs ? `?${qs}` : ""}`, { scroll: false });
    }
  }, [q, roles, seniorities, contracts, location, salaryMin, sort, page, router, pathname, isTagPage]);

  useEffect(() => { syncUrl(); }, [syncUrl]);

  const hasFilters = !!(roles || seniorities || contracts || location || salaryMin || q);
  const filterCount = [roles, seniorities, contracts, location, salaryMin, q].filter(Boolean).length;

  const clearAll = () => {
    setQ(""); setRoles(""); setSeniorities(""); setContracts(""); setLocation("");
    setSalaryMin(""); setSort("recent"); setPage(1);
  };

  return {
    q, setQ,
    roles, setRoles,
    seniorities, setSeniorities,
    contracts, setContracts,
    location, setLocation,
    salaryMin, setSalaryMin,
    stack,
    sort, setSort,
    page, setPage,
    hasFilters, filterCount, clearAll,
  };
}

/* ─── Main ─── */

interface JobBoardProps {
  username: string | null;
  pageTitle?: string;
  pageDescription?: string;
  initialFilters?: Record<string, string>;
}

export default function JobBoardClient({ username, pageTitle, pageDescription, initialFilters }: JobBoardProps) {
  const filters = useUrlFilters(initialFilters);
  const rawSearchParams = useSearchParams();
  const [listings, setListings] = useState<JobListing[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [debouncedQ, setDebouncedQ] = useState(filters.q);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const resultsRef = useRef<HTMLDivElement>(null);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(filters.q), 300);
    return () => clearTimeout(t);
  }, [filters.q]);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setError(false);
    const p = new URLSearchParams();
    if (debouncedQ) p.set("q", debouncedQ);
    if (filters.roles) p.set("role", filters.roles);
    if (filters.seniorities) p.set("seniority", filters.seniorities);
    if (filters.contracts) p.set("contract", filters.contracts);
    if (filters.location) p.set("location", filters.location);
    if (filters.salaryMin) p.set("salary_min", filters.salaryMin);
    if (filters.stack) p.set("stack", filters.stack);
    if (filters.sort !== "recent") p.set("sort", filters.sort);
    p.set("page", String(filters.page));
    try {
      const res = await fetch(`/api/jobs?${p}`);
      if (!res.ok) throw new Error();
      const data: JobsResponse = await res.json();
      setListings(data.listings);
      setTotal(data.total);
    } catch { setError(true); }
    setLoading(false);
  }, [debouncedQ, filters.roles, filters.seniorities, filters.contracts, filters.location, filters.salaryMin, filters.stack, filters.sort, filters.page]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  // Reset page on filter change
  useEffect(() => {
    filters.setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ, filters.roles, filters.seniorities, filters.contracts, filters.location, filters.salaryMin, filters.sort]);

  const totalPages = Math.ceil(total / 20);

  // Build active pills
  const activePills: Array<{ label: string; onClear: () => void }> = [];
  for (const r of filters.roles.split(",").filter(Boolean)) {
    activePills.push({ label: ROLE_TYPE_LABELS[r] ?? r, onClear: () => filters.setRoles(toggleSet(filters.roles, r)) });
  }
  for (const s of filters.seniorities.split(",").filter(Boolean)) {
    activePills.push({ label: SENIORITY_LABELS[s] ?? s, onClear: () => filters.setSeniorities(toggleSet(filters.seniorities, s)) });
  }
  for (const c of filters.contracts.split(",").filter(Boolean)) {
    activePills.push({ label: CONTRACT_LABELS[c] ?? c, onClear: () => filters.setContracts(toggleSet(filters.contracts, c)) });
  }
  if (filters.location) {
    activePills.push({ label: LOCATION_TYPE_LABELS[filters.location] ?? filters.location, onClear: () => filters.setLocation("") });
  }
  if (filters.salaryMin) {
    activePills.push({ label: `${(parseInt(filters.salaryMin) / 1000).toFixed(0)}k+`, onClear: () => filters.setSalaryMin("") });
  }

  return (
    <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">

        {/* ─── Header ─── */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link href={pageTitle ? "/jobs" : "/"} className="text-[10px] text-dim transition-colors hover:text-muted">
              &larr; {pageTitle ? "All Jobs" : "Back to City"}
            </Link>
            <h1 className="mt-3 text-3xl text-lime sm:text-4xl">{pageTitle ?? "Jobs"}</h1>
            <p className="mt-1 text-xs text-muted normal-case">{pageDescription ?? "Real devs. Real jobs. No robots in between."}</p>
          </div>
          <div className="flex gap-2">
            {username ? (
              <>
                <Link href="/jobs/my-applications" className="border-[3px] border-border px-3 py-2 text-xs text-muted transition-colors hover:border-border-light hover:text-cream">
                  My Applications
                </Link>
                <Link href={`/hire/${username}`} className="border-[3px] border-border px-3 py-2 text-xs text-muted transition-colors hover:border-border-light hover:text-cream">
                  My Profile
                </Link>
              </>
            ) : (
              <Link
                href="/api/auth/github?redirect=/jobs"
                className="btn-press bg-lime px-4 py-2 text-xs text-bg"
                style={{ boxShadow: "3px 3px 0 0 #5a7a00" }}
              >
                Sign in with GitHub
              </Link>
            )}
          </div>
        </div>

        {/* ─── Unsubscribe confirmation ─── */}
        {rawSearchParams.get("unsubscribed") === "true" && (
          <div className="mt-6 border-[3px] border-lime/20 bg-lime/[0.03] px-5 py-3">
            <p className="text-xs text-lime normal-case">You have been unsubscribed from job alerts.</p>
          </div>
        )}

        {/* ─── Search + Filter toggle ─── */}
        <div className="mt-8 flex gap-2">
          <input
            type="text"
            placeholder="Search jobs, companies, tech..."
            value={filters.q}
            onChange={(e) => filters.setQ(e.target.value)}
            aria-label="Search jobs"
            className="flex-1 border-[3px] border-border bg-bg-raised px-4 py-3.5 text-xs text-cream normal-case outline-none placeholder:text-dim focus-visible:border-lime transition-colors"
          />
          <button
            onClick={() => setFiltersOpen(!filtersOpen)}
            className="cursor-pointer border-[3px] px-5 py-3.5 text-xs transition-colors"
            style={{
              borderColor: filtersOpen || filters.hasFilters ? "#c8e64a" : "var(--color-border)",
              color: filtersOpen || filters.hasFilters ? "#c8e64a" : "var(--color-muted)",
              backgroundColor: filtersOpen || filters.hasFilters ? "rgba(200,230,74,0.05)" : "var(--color-bg-raised)",
            }}
          >
            Filter{filters.filterCount > 0 ? ` (${filters.filterCount})` : ""}
          </button>
        </div>

        {/* ─── Filters panel ─── */}
        {filtersOpen && (
          <div className="mt-3 border-[3px] border-border bg-bg-raised p-5 space-y-5" style={{ animation: "fade-in 0.15s ease-out" }}>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <FilterGroup label="Role">
                {ROLE_OPTIONS.map((r) => (
                  <Chip key={r} active={setHas(filters.roles, r)} onClick={() => filters.setRoles(toggleSet(filters.roles, r))}>
                    {ROLE_TYPE_LABELS[r]}
                  </Chip>
                ))}
              </FilterGroup>
              <FilterGroup label="Seniority">
                {SENIORITY_OPTIONS.map((s) => (
                  <Chip key={s} active={setHas(filters.seniorities, s)} onClick={() => filters.setSeniorities(toggleSet(filters.seniorities, s))}>
                    {SENIORITY_LABELS[s]}
                  </Chip>
                ))}
              </FilterGroup>
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
              <FilterGroup label="Contract">
                {CONTRACT_OPTIONS.map((c) => (
                  <Chip key={c} active={setHas(filters.contracts, c)} onClick={() => filters.setContracts(toggleSet(filters.contracts, c))}>
                    {CONTRACT_LABELS[c]}
                  </Chip>
                ))}
              </FilterGroup>
              <FilterGroup label="Location">
                {(["remote", "hybrid", "onsite"] as const).map((l) => (
                  <Chip key={l} active={filters.location === l} onClick={() => filters.setLocation(filters.location === l ? "" : l)}>
                    {LOCATION_TYPE_LABELS[l]}
                  </Chip>
                ))}
              </FilterGroup>
              <FilterGroup label="Min Salary">
                {SALARY_BRACKETS.map((b) => (
                  <Chip key={b.value} active={filters.salaryMin === b.value} onClick={() => filters.setSalaryMin(filters.salaryMin === b.value ? "" : b.value)}>
                    {b.label}
                  </Chip>
                ))}
              </FilterGroup>
            </div>
            {filters.hasFilters && (
              <div className="border-t border-border/30 pt-4 text-right">
                <button onClick={filters.clearAll} className="text-[10px] text-dim transition-colors hover:text-muted">Clear all filters</button>
              </div>
            )}
          </div>
        )}

        {/* ─── Active pills (when panel closed) ─── */}
        {!filtersOpen && activePills.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {activePills.map((p) => (
              <ActivePill key={p.label} label={p.label} onClear={p.onClear} />
            ))}
            <button onClick={filters.clearAll} className="text-[10px] text-dim transition-colors hover:text-muted">Clear</button>
          </div>
        )}

        {/* ─── Results header + Sort ─── */}
        <div className="mt-6 flex items-center justify-between">
          <p className="text-[10px] text-dim">
            {loading ? "Loading..." : `Showing ${listings.length} of ${total}`}
          </p>
          <div className="flex gap-1">
            <SortChip active={filters.sort === "recent"} onClick={() => filters.setSort("recent")}>Newest</SortChip>
            <SortChip active={filters.sort === "salary"} onClick={() => filters.setSort("salary")}>Top Salary</SortChip>
          </div>
        </div>

        {/* ─── Job grid ─── */}
        <div ref={resultsRef} className="mt-4" aria-live="polite">
          {loading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}
            </div>
          ) : error ? (
            <div className="border-[3px] border-red-500/30 bg-red-500/5 p-12 text-center space-y-3">
              <p className="text-xs text-red-400 normal-case">Failed to load jobs</p>
              <button onClick={fetchJobs} className="btn-press border-[3px] border-border px-5 py-2.5 text-xs text-cream">Try Again</button>
            </div>
          ) : listings.length === 0 ? (
            <div className="border-[3px] border-border bg-bg-raised p-14 text-center space-y-5">
              <p className="text-sm text-muted">No jobs match your filters.</p>
              {filters.hasFilters && (
                <button onClick={filters.clearAll} className="btn-press border-[3px] border-border px-5 py-2.5 text-xs text-cream">Clear Filters</button>
              )}
              <div className="pt-2">
                <Link href="/hire/edit" className="btn-press inline-block bg-lime px-6 py-3 text-xs text-bg" style={{ boxShadow: "3px 3px 0 0 #5a7a00" }}>
                  Create Career Profile
                </Link>
                <p className="mt-2 text-[10px] text-dim normal-case">Be ready when jobs drop</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {listings.map((job) => (
                <JobCard key={job.id} job={job} />
              ))}
            </div>
          )}
        </div>

        {/* ─── Pagination ─── */}
        {totalPages > 1 && (
          <div className="mt-10 flex items-center justify-center gap-4">
            <button
              onClick={() => { filters.setPage(Math.max(1, filters.page - 1)); resultsRef.current?.scrollIntoView({ behavior: "smooth" }); }}
              disabled={filters.page === 1}
              className="btn-press border-[3px] border-border px-5 py-2.5 text-xs text-cream disabled:opacity-30"
            >
              Prev
            </button>
            <span className="text-xs text-muted">{filters.page} / {totalPages}</span>
            <button
              onClick={() => { filters.setPage(Math.min(totalPages, filters.page + 1)); resultsRef.current?.scrollIntoView({ behavior: "smooth" }); }}
              disabled={filters.page === totalPages}
              className="btn-press border-[3px] border-border px-5 py-2.5 text-xs text-cream disabled:opacity-30"
            >
              Next
            </button>
          </div>
        )}

        {/* ─── Job alert signup ─── */}
        <JobAlertSignup />

        <div className="h-12" />
      </div>

    </main>
  );
}

/* ─── Job Card ─── */

function JobCard({ job }: { job: JobListing }) {
  const companyName = job.company?.name ?? "Company";
  const isPremium = job.tier === "premium";
  const isFeatured = job.tier === "featured";
  const accent = isPremium ? "#fbbf24" : "#c8e64a";

  let wrapClass = "border-[3px] border-border bg-bg-raised";
  let wrapStyle: React.CSSProperties = {};

  if (isPremium) {
    wrapClass = "border-[3px] border-[#fbbf24]/30";
    wrapStyle = {
      background: "linear-gradient(180deg, rgba(251,191,36,0.05) 0%, rgba(251,191,36,0.01) 100%)",
      boxShadow: "0 0 0 1px rgba(251,191,36,0.08), 0 0 24px rgba(251,191,36,0.04)",
    };
  } else if (isFeatured) {
    wrapClass = "border-[3px] border-lime/20";
    wrapStyle = {
      background: "rgba(200,230,74,0.02)",
      boxShadow: "0 0 0 1px rgba(200,230,74,0.06)",
    };
  }

  return (
    <Link href={`/jobs/${job.id}`} className={`${wrapClass} p-6 block sm:pointer-events-none`} style={wrapStyle}>
      {/* Company + badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <p className="text-xs text-cream truncate">{companyName}</p>
            <p className="text-[10px] text-dim">{timeAgo(job.published_at)}</p>
          </div>
        </div>
        {(isPremium || isFeatured) && (
          <span className="shrink-0 border-[2px] px-2 py-0.5 text-[8px]" style={{ borderColor: `${accent}50`, color: accent }}>
            {isPremium ? "Premium" : "Featured"}
          </span>
        )}
      </div>

      {/* Title */}
      <h3 className="mt-4 text-sm text-cream leading-snug sm:text-base">{job.title}</h3>

      {/* Tags */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        <TagPill>{LOCATION_TYPE_LABELS[job.location_type] ?? "Remote"}{job.location_type === "remote" && job.location_restriction && job.location_restriction !== "worldwide" ? ` (${LOCATION_RESTRICTION_LABELS[job.location_restriction]})` : ""}</TagPill>
        <TagPill>{SENIORITY_LABELS[job.seniority]}</TagPill>
        <TagPill>{CONTRACT_LABELS[job.contract_type]}</TagPill>
      </div>

      {/* Tech */}
      {job.tech_stack.length > 0 && (
        <p className="mt-2.5 text-[9px] text-dim normal-case truncate">
          {job.tech_stack.slice(0, 5).join(" · ")}
          {job.tech_stack.length > 5 && ` +${job.tech_stack.length - 5}`}
        </p>
      )}

      {/* Bottom: Salary + View */}
      <div className="mt-5 flex items-end justify-between border-t border-border/30 pt-4">
        <div>
          <p className="text-sm" style={{ color: accent }}>
            {job.salary_currency} {fmtSalary(job.salary_min)}-{fmtSalary(job.salary_max)}
            <span className="text-[10px] text-dim ml-1">{SALARY_PERIOD_LABELS[job.salary_period] ?? "/mo"}</span>
          </p>
          {(job.badge_response_guaranteed || job.badge_no_ai_screening || job.apply_count > 0) && (
            <div className="mt-1 flex items-center gap-2 text-[9px] text-dim">
              {job.badge_response_guaranteed && <span>Response OK</span>}
              {job.badge_no_ai_screening && <span>No AI</span>}
              {job.apply_count > 0 && <span>{job.apply_count} applied</span>}
            </div>
          )}
        </div>
        <Link
          href={`/jobs/${job.id}`}
          className="btn-press hidden sm:block sm:pointer-events-auto border-[3px] border-border px-4 py-2 text-[10px] text-cream transition-colors hover:border-border-light"
        >
          View
        </Link>
      </div>
    </Link>
  );
}

/* ─── Shared ─── */

function CompanyAvatar({ name, logoUrl, website }: { name: string; logoUrl?: string | null; website?: string | null }) {
  const src = (() => {
    if (logoUrl) return logoUrl;
    if (!website) return null;
    try { return `https://www.google.com/s2/favicons?domain=${new URL(website).hostname}&sz=128`; }
    catch { return null; }
  })();
  if (src) {
    return <img src={src} alt={`${name} logo`} className="h-10 w-10 shrink-0 border-[2px] border-border/40 object-cover bg-white/5" />;
  }
  return (
    <div className="h-10 w-10 shrink-0 flex items-center justify-center text-sm font-bold border-[2px] border-border/40 text-white/80" style={{ background: companyGradient(name) }}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function TagPill({ children }: { children: React.ReactNode }) {
  return <span className="border-[2px] border-border px-2.5 py-1 text-[10px] text-muted">{children}</span>;
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-pressed={active} className="cursor-pointer border-[2px] px-2.5 py-1 text-[10px] transition-colors"
      style={{ borderColor: active ? "#c8e64a" : "var(--color-border)", color: active ? "#c8e64a" : "var(--color-muted)", backgroundColor: active ? "rgba(200,230,74,0.08)" : "transparent" }}>
      {children}
    </button>
  );
}

function SortChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className="cursor-pointer px-2 py-0.5 text-[10px] transition-colors" style={{ color: active ? "#c8e64a" : "var(--color-dim)" }}>{children}</button>;
}

function ActivePill({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <button onClick={onClear} className="flex items-center gap-1 border-[2px] border-lime/20 bg-lime/[0.06] px-2.5 py-1 text-[10px] text-lime transition-colors hover:border-lime/40">
      {label} <span className="text-lime/40">&times;</span>
    </button>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><p className="text-[10px] text-dim tracking-widest mb-2">{label}</p><div className="flex flex-wrap gap-1.5">{children}</div></div>;
}

function JobAlertSignup() {
  const [email, setEmail] = useState("");
  const [stack, setAlertStack] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setStatus("loading");
    try {
      const res = await fetch("/api/jobs/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          tech_stack: stack.split(",").map((s) => s.trim()).filter(Boolean),
        }),
      });
      if (!res.ok) throw new Error();
      setStatus("done");
    } catch {
      setStatus("error");
    }
  };

  if (status === "done") {
    return (
      <div className="mt-12 border-[3px] border-lime/20 bg-lime/[0.03] p-8 text-center">
        <p className="text-sm text-lime">You&apos;re subscribed!</p>
        <p className="mt-1 text-xs text-muted normal-case">We&apos;ll send you matching jobs every week.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-12 border-[3px] border-border bg-bg-raised p-6 sm:p-8">
      <p className="text-xs text-lime tracking-widest">Get job alerts</p>
      <p className="mt-1 text-[10px] text-muted normal-case">New matching jobs delivered weekly. No account needed.</p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          required
          placeholder="your@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1 border-[3px] border-border bg-bg px-4 py-3 text-xs text-cream normal-case outline-none placeholder:text-dim focus-visible:border-lime transition-colors"
        />
        <input
          type="text"
          placeholder="react, typescript, node (optional)"
          value={stack}
          onChange={(e) => setAlertStack(e.target.value)}
          className="flex-1 border-[3px] border-border bg-bg px-4 py-3 text-xs text-cream normal-case outline-none placeholder:text-dim focus-visible:border-lime transition-colors"
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="btn-press bg-lime px-6 py-3 text-xs text-bg disabled:opacity-50"
          style={{ boxShadow: "3px 3px 0 0 #5a7a00" }}
        >
          {status === "loading" ? "..." : "Subscribe"}
        </button>
      </div>
      {status === "error" && <p className="mt-2 text-xs text-red-400 normal-case">Failed to subscribe. Try again.</p>}
    </form>
  );
}

function SkeletonCard() {
  return (
    <div className="border-[3px] border-border bg-bg-raised p-6 space-y-4">
      <div className="flex items-center gap-3"><div className="h-10 w-10 animate-pulse bg-border" /><div className="space-y-1.5 flex-1"><div className="h-3 w-24 animate-pulse bg-border" /><div className="h-2.5 w-16 animate-pulse bg-border" /></div></div>
      <div className="h-5 w-4/5 animate-pulse bg-border" />
      <div className="flex gap-1.5"><div className="h-5 w-16 animate-pulse bg-border" /><div className="h-5 w-14 animate-pulse bg-border" /><div className="h-5 w-12 animate-pulse bg-border" /></div>
      <div className="flex items-center justify-between border-t border-border/30 pt-4"><div className="h-4 w-24 animate-pulse bg-border" /><div className="h-8 w-16 animate-pulse bg-border" /></div>
    </div>
  );
}
