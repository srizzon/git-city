"use client";

import { useEffect, useState } from "react";

interface Stats {
  sent24h: number;
  sent7d: number;
  failed: number;
  bounced: number;
  delivered: number;
  suppressed: number;
}

interface Failure {
  id: string;
  channel: string;
  notification_type: string;
  recipient: string;
  title: string;
  status: string;
  failure_reason: string | null;
  failed_at: string | null;
  created_at: string;
}

interface MonitoringData {
  stats: Stats;
  recentFailures: Failure[];
}

function StatCard({ label, value, variant }: { label: string; value: number; variant?: "danger" | "warning" | "success" }) {
  const valueColor =
    variant === "danger"
      ? "text-red-400"
      : variant === "warning"
        ? "text-yellow-400"
        : variant === "success"
          ? "text-green-400"
          : "text-cream";

  return (
    <div className="border border-border bg-bg-raised p-4">
      <p className="text-xs uppercase tracking-wider text-cream/50">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${valueColor}`}>{value.toLocaleString()}</p>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminEmailMonitoringPage() {
  const [data, setData] = useState<MonitoringData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/email-monitoring")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to fetch");
        return res.json();
      })
      .then((d) => setData(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-bg p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8">
            <div className="h-8 w-48 animate-pulse rounded bg-border" />
            <div className="mt-2 h-4 w-64 animate-pulse rounded bg-border" />
          </div>
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="border border-border bg-bg-raised p-4">
                <div className="h-3 w-20 animate-pulse rounded bg-border" />
                <div className="mt-2 h-7 w-16 animate-pulse rounded bg-border" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-bg p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-7xl">
          <p className="text-red-400">Failed to load email monitoring data: {error}</p>
        </div>
      </div>
    );
  }

  const { stats, recentFailures } = data;

  return (
    <div className="min-h-screen bg-bg p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <h1 className="font-pixel text-2xl text-cream">Email Monitoring</h1>
          <p className="mt-1 text-sm text-cream/50">Delivery stats and failure tracking (last 7 days)</p>
        </div>

        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Sent (24h)" value={stats.sent24h} />
          <StatCard label="Sent (7d)" value={stats.sent7d} />
          <StatCard label="Delivered" value={stats.delivered} variant="success" />
          <StatCard label="Failed" value={stats.failed} variant="danger" />
          <StatCard label="Bounced" value={stats.bounced} variant="warning" />
          <StatCard label="Suppressed" value={stats.suppressed} variant="warning" />
        </div>

        <div>
          <h2 className="mb-4 font-pixel text-lg text-cream">Recent Failures</h2>
          {recentFailures.length === 0 ? (
            <div className="border border-border bg-bg-raised p-8 text-center">
              <p className="text-cream/50">No failures recorded. All clear.</p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-border">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-bg-raised">
                    <th className="px-4 py-3 text-xs uppercase tracking-wider text-cream/50">Date</th>
                    <th className="px-4 py-3 text-xs uppercase tracking-wider text-cream/50">Type</th>
                    <th className="px-4 py-3 text-xs uppercase tracking-wider text-cream/50">Channel</th>
                    <th className="px-4 py-3 text-xs uppercase tracking-wider text-cream/50">Recipient</th>
                    <th className="px-4 py-3 text-xs uppercase tracking-wider text-cream/50">Subject</th>
                    <th className="px-4 py-3 text-xs uppercase tracking-wider text-cream/50">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {recentFailures.map((f) => (
                    <tr key={f.id} className="border-b border-border/50 hover:bg-bg-raised/50">
                      <td className="whitespace-nowrap px-4 py-3 text-cream/70">
                        {formatDate(f.failed_at ?? f.created_at)}
                      </td>
                      <td className="px-4 py-3 text-cream/70">{f.notification_type}</td>
                      <td className="px-4 py-3 text-cream/70">{f.channel}</td>
                      <td className="max-w-[200px] truncate px-4 py-3 text-cream/70" title={f.recipient}>
                        {f.recipient}
                      </td>
                      <td className="max-w-[250px] truncate px-4 py-3 text-cream/70" title={f.title}>
                        {f.title}
                      </td>
                      <td className="px-4 py-3 text-red-400">
                        {f.failure_reason ?? "Unknown"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
