"use client";

import { useLeaderboardAuth } from "./LeaderboardYouBadge";

const ACCENT = "#c8e64a";

interface MetricEntry {
  login: string;
  value: number;
}

export default function LeaderboardYouVsNext({
  metrics,
  metricLabel,
}: {
  metrics: MetricEntry[];
  metricLabel: string;
}) {
  const authLogin = useLeaderboardAuth();

  if (!authLogin) return null;

  const userIdx = metrics.findIndex((m) => m.login === authLogin);
  if (userIdx < 0) return null; // Not in top 50

  const user = metrics[userIdx];
  const position = userIdx + 1;
  const label = metricLabel.toLowerCase();

  // User is #1
  if (position === 1) {
    const runner = metrics[1];
    if (!runner) return null;
    const lead = user.value - runner.value;
    return (
      <div className="mt-4 border-[3px] border-border bg-bg-card px-4 py-3">
        <div className="flex items-center justify-between gap-2 text-[10px]">
          <span className="text-cream">
            You&apos;re <span style={{ color: "#ffd700" }}>#1</span>
          </span>
          <span className="text-muted normal-case">
            {lead.toLocaleString()} {label} ahead of #2
          </span>
        </div>
      </div>
    );
  }

  // User is #2-50
  const next = metrics[userIdx - 1];
  const gap = next.value - user.value;
  const progress = next.value > 0 ? Math.min(user.value / next.value, 1) : 1;

  return (
    <div className="mt-4 border-[3px] border-border bg-bg-card px-4 py-3">
      <div className="flex items-center justify-between gap-2 text-[10px]">
        <span className="text-cream normal-case">
          You | 你： <span style={{ color: ACCENT }}>#{position}</span> &middot; {user.value.toLocaleString()}
        </span>
        <span className="text-muted normal-case">
          Next | 下一名： <span className="text-cream">#{position - 1}</span> &middot; {next.value.toLocaleString()}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden bg-border/50">
          <div
            className="h-full transition-all duration-500"
            style={{ width: `${progress * 100}%`, backgroundColor: ACCENT }}
          />
        </div>
        <span className="text-[9px] font-bold normal-case" style={{ color: ACCENT }}>
          {gap.toLocaleString()} to go | 还差{gap.toLocaleString()} {label}
        </span>
      </div>
    </div>
  );
}
