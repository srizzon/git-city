"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Application {
  id: string;
  listing_id: string;
  has_profile: boolean;
  created_at: string;
  listing?: {
    id: string;
    title: string;
    status: string;
    company?: { name: string; slug: string };
  };
}

const STATUS_COLORS: Record<string, string> = {
  active: "#4ade80",
  filled: "#c8e64a",
  expired: "#8c8c9c",
  paused: "#fbbf24",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  filled: "Filled",
  expired: "Expired",
  paused: "Paused",
};

export default function MyApplicationsClient() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/jobs/my-applications")
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d) => setApplications(d.applications ?? []))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <Link href="/jobs" className="text-sm text-muted transition-colors hover:text-cream">
          &lt; Back to jobs
        </Link>

        <h1 className="mt-6 text-2xl text-lime sm:text-3xl">My Applications</h1>
        {!loading && !error && (
          <p className="mt-2 text-sm text-muted">
            {applications.length} application{applications.length !== 1 ? "s" : ""}
          </p>
        )}

        <div className="mt-6" aria-live="polite">
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="border-[3px] border-border bg-bg-raised p-5">
                  <div className="h-5 w-2/3 animate-pulse bg-border" />
                  <div className="mt-2 h-3 w-1/3 animate-pulse bg-border" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="border-[3px] border-red-500/30 bg-red-500/5 p-8 text-center space-y-4">
              <p className="text-sm text-red-400 normal-case">Failed to load applications</p>
              <button
                onClick={() => window.location.reload()}
                className="btn-press border-[3px] border-border px-5 py-2 text-xs text-cream"
              >
                Try Again
              </button>
            </div>
          ) : applications.length === 0 ? (
            <div className="border-[3px] border-border bg-bg-raised p-10 text-center space-y-4">
              <p className="text-sm text-muted">No applications yet.</p>
              <Link
                href="/jobs"
                className="btn-press inline-block bg-lime px-6 py-3 text-sm text-bg"
                style={{ boxShadow: "3px 3px 0 0 #5a7a00" }}
              >
                Browse Jobs
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {applications.map((app) => (
                <Link
                  key={app.id}
                  href={`/jobs/${app.listing_id}`}
                  aria-label={`${app.listing?.title ?? "Job"} at ${app.listing?.company?.name ?? "Company"}`}
                  className="block border-[3px] border-border bg-bg-raised p-5 transition-colors hover:border-border-light"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 space-y-1.5">
                      <p className="text-sm text-cream truncate">
                        {app.listing?.title ?? "Unknown listing"}
                      </p>
                      <p className="text-xs text-muted">
                        {app.listing?.company?.name ?? "Company"} · Applied{" "}
                        <span className="normal-case">
                          {new Date(app.created_at).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </p>
                    </div>
                    <div className="shrink-0 text-right space-y-1">
                      <span
                        className="border-[3px] px-2.5 py-1 text-xs"
                        style={{
                          borderColor: (STATUS_COLORS[app.listing?.status ?? ""] ?? "#8c8c9c") + "66",
                          color: STATUS_COLORS[app.listing?.status ?? ""] ?? "#8c8c9c",
                        }}
                      >
                        {STATUS_LABELS[app.listing?.status ?? ""] ?? "Unknown"}
                      </span>
                      {!app.has_profile && (
                        <p className="text-[10px] text-dim">no profile shared</p>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="h-12" />
      </div>
    </main>
  );
}
