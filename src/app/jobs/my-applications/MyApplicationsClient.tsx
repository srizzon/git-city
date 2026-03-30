"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  SENIORITY_LABELS,
  LOCATION_TYPE_LABELS,
  SALARY_PERIOD_LABELS,
} from "@/lib/jobs/constants";

interface Company {
  name: string;
  slug: string;
}

interface Listing {
  id: string;
  title: string;
  status: string;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: string | null;
  seniority: string | null;
  role_type: string | null;
  location_type: string | null;
  contract_type: string | null;
  company: Company;
}

interface Application {
  listing_id: string;
  developer_id: string;
  has_profile: boolean;
  status: string;
  created_at: string;
  listing: Listing;
}

const STATUS_COLORS: Record<string, string> = {
  active: "#4ade80",
  filled: "#c8e64a",
  expired: "#8c8c9c",
  paused: "#fbbf24",
  hired: "#c8e64a",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  filled: "Filled",
  expired: "Expired",
  paused: "Paused",
};

type FilterStatus = "all" | "active" | "hired" | "closed";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function formatSalary(min: number | null, max: number | null, currency: string | null, period: string | null): string | null {
  if (!min && !max) return null;
  const cur = (currency ?? "USD").toUpperCase();
  const per = period ? (SALARY_PERIOD_LABELS[period] ?? "") : "";
  if (min && max) return `${cur} ${min.toLocaleString()} - ${max.toLocaleString()}${per}`;
  if (min) return `${cur} ${min.toLocaleString()}+${per}`;
  if (max) return `Up to ${cur} ${max.toLocaleString()}${per}`;
  return null;
}

function StatusBadge({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="inline-block rounded-sm px-2 py-0.5 text-[10px] font-bold"
      style={{ backgroundColor: color, color: "#1a1a2e" }}
    >
      {label}
    </span>
  );
}

function SkeletonCard() {
  return (
    <div className="border-[3px] border-border bg-bg-raised p-5 sm:p-6 space-y-3">
      <div className="h-4 w-3/4 animate-pulse bg-border" />
      <div className="h-3 w-1/3 animate-pulse bg-border" />
      <div className="flex gap-2">
        <div className="h-3 w-16 animate-pulse bg-border" />
        <div className="h-3 w-20 animate-pulse bg-border" />
      </div>
    </div>
  );
}

export default function MyApplicationsClient() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<FilterStatus>("all");

  useEffect(() => {
    fetch("/api/jobs/my-applications")
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d) => setApplications(d.applications))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const counts = useMemo(() => {
    const c = { all: applications.length, active: 0, hired: 0, closed: 0 };
    for (const app of applications) {
      if (app.status === "hired") c.hired++;
      else if (app.listing.status === "active") c.active++;
      else c.closed++;
    }
    return c;
  }, [applications]);

  const filtered = useMemo(() => {
    if (filter === "all") return applications;
    if (filter === "hired") return applications.filter((a) => a.status === "hired");
    if (filter === "active") return applications.filter((a) => a.status !== "hired" && a.listing.status === "active");
    return applications.filter((a) => a.status !== "hired" && a.listing.status !== "active");
  }, [applications, filter]);

  const FILTERS: { key: FilterStatus; label: string }[] = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "hired", label: "Hired" },
    { key: "closed", label: "Closed" },
  ];

  return (
    <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <div className="flex items-center justify-between">
          <Link href="/jobs" className="text-sm text-muted transition-colors hover:text-cream cursor-pointer">
            &lt; Jobs
          </Link>
          <Link href="/settings" className="text-xs text-muted transition-colors hover:text-cream">
            Notification settings
          </Link>
        </div>

        <h1 className="mt-4 text-2xl text-cream sm:text-3xl">My Applications</h1>
        <p className="mt-1 text-xs text-muted/40 normal-case">{applications.length} total</p>

        {loading && (
          <div className="mt-6 space-y-4">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {error && (
          <div className="mt-6 border-[3px] border-border bg-bg-raised p-5 sm:p-6">
            <p className="text-sm text-red-400 normal-case">
              Failed to load applications. Please try again.
            </p>
          </div>
        )}

        {!loading && !error && applications.length === 0 && (
          <div className="mt-6 border-[3px] border-border bg-bg-raised p-8 text-center space-y-3">
            <p className="text-sm text-muted normal-case">No applications yet</p>
            <Link
              href="/jobs"
              className="inline-block text-sm text-lime transition-colors hover:text-cream"
            >
              Browse open positions
            </Link>
          </div>
        )}

        {!loading && !error && applications.length > 0 && (
          <>
            {/* Filters */}
            <div className="mt-6 flex flex-wrap gap-1.5">
              {FILTERS.map((f) => {
                const count = counts[f.key];
                if (f.key !== "all" && count === 0) return null;
                return (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={`cursor-pointer border-[2px] px-3 py-1.5 text-xs transition-colors ${
                      filter === f.key
                        ? "border-lime text-lime bg-lime/10"
                        : "border-border text-muted hover:border-border-light"
                    }`}
                  >
                    {f.label} ({count})
                  </button>
                );
              })}
            </div>

            {/* List */}
            <div className="mt-4 space-y-3">
              {filtered.map((app) => {
                const listing = app.listing;
                const salary = formatSalary(
                  listing.salary_min,
                  listing.salary_max,
                  listing.salary_currency,
                  listing.salary_period,
                );
                const seniority = listing.seniority
                  ? SENIORITY_LABELS[listing.seniority] ?? listing.seniority
                  : null;
                const locationType = listing.location_type
                  ? LOCATION_TYPE_LABELS[listing.location_type] ?? listing.location_type
                  : null;

                return (
                  <div
                    key={app.listing_id}
                    className="border-[3px] border-border bg-bg-raised p-5 sm:p-6"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-1 min-w-0 flex-1">
                        <Link
                          href={`/jobs/${listing.id}`}
                          className="text-sm text-cream transition-colors hover:text-lime normal-case block truncate"
                        >
                          {listing.title}
                        </Link>
                        <Link
                          href={`/jobs/company/${listing.company.slug}`}
                          className="text-xs text-muted transition-colors hover:text-cream normal-case block"
                        >
                          {listing.company.name}
                        </Link>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {app.status === "hired" ? (
                          <StatusBadge label="Hired" color={STATUS_COLORS.hired} />
                        ) : (
                          <StatusBadge
                            label={STATUS_LABELS[listing.status] ?? listing.status}
                            color={STATUS_COLORS[listing.status] ?? "#8c8c9c"}
                          />
                        )}
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                      {salary && (
                        <span className="text-cream normal-case">{salary}</span>
                      )}
                      {seniority && (
                        <span className="text-muted normal-case">{seniority}</span>
                      )}
                      {locationType && (
                        <span className="text-muted normal-case">{locationType}</span>
                      )}
                      <span className="text-muted/40 normal-case">Applied {timeAgo(app.created_at)}</span>
                    </div>
                  </div>
                );
              })}

              {filtered.length === 0 && (
                <div className="border-[3px] border-border bg-bg-raised p-8 text-center">
                  <p className="text-xs text-muted normal-case">No applications match this filter</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
