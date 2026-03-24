"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { StatsCard } from "./_components/stats-card";
import { PeriodSelector, type Period } from "./_components/period-selector";
import { DailyChart } from "./_components/daily-chart";
import { AdCard } from "./_components/ad-card";

const ACCENT = "#c8e64a";

interface AdData {
  id: string;
  text: string;
  brand: string | null;
  vehicle: string;
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  impressions: number;
  clicks: number;
  cta_clicks: number;
  conversions: number;
  revenue_cents: number;
  ctr: string;
}

interface DashboardData {
  ads: AdData[];
  totals: {
    impressions: number;
    clicks: number;
    cta_clicks: number;
    conversions: number;
    revenue_cents: number;
    ctr: string;
    conv_rate: string;
    changes: {
      impressions: number;
      clicks: number;
      cta_clicks: number;
      conversions: number;
    };
  };
  daily: { day: string; impressions: number; clicks: number; conversions: number }[];
}

const VALID_PERIODS = new Set(["7d", "30d", "90d", "all"]);

function parsePeriod(raw: string | null): Period {
  return raw && VALID_PERIODS.has(raw) ? (raw as Period) : "30d";
}

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [period, setPeriodState] = useState<Period>(() => parsePeriod(searchParams.get("period")));
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  function setPeriod(p: Period) {
    setPeriodState(p);
    router.replace(`/ads/dashboard?period=${p}`);
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/ads/stats?period=${period}&_t=${Date.now()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [period]);

  if (loading && !data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-muted">Loading...</p>
      </div>
    );
  }

  if (!data || data.ads.length === 0) {
    return (
      <div className="mt-12 text-center">
        <h1 className="text-2xl text-cream">No ads yet</h1>
        <p className="mt-2 text-sm text-muted normal-case">
          Purchase your first ad to see analytics here.
        </p>
        <Link
          href="/advertise"
          className="btn-press mt-6 inline-block px-7 py-3 text-sm text-bg"
          style={{ backgroundColor: ACCENT, boxShadow: "4px 4px 0 0 #5a7a00" }}
        >
          Buy an ad
        </Link>
      </div>
    );
  }

  const { totals, daily, ads } = data;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl text-cream">Overview</h1>
        <div className="flex items-center gap-3">
          <PeriodSelector value={period} onChange={setPeriod} />
          <Link
            href="/ads/dashboard/new"
            className="btn-press px-4 py-2 text-xs text-bg"
            style={{ backgroundColor: ACCENT, boxShadow: "3px 3px 0 0 #5a7a00" }}
          >
            + New Ad
          </Link>
        </div>
      </div>

      {/* Conversion tracking nudge */}
      {totals.cta_clicks > 0 && totals.conversions === 0 && (
        <div className="mt-4 border-[3px] px-4 py-3 text-sm normal-case" style={{ borderColor: "#ff9800", color: "#ff9800", backgroundColor: "#ff980010" }}>
          You have {totals.cta_clicks.toLocaleString()} CTA clicks but no conversions tracked.{" "}
          <Link href="/ads/dashboard/integration" className="underline">Set up conversion tracking</Link> to measure ROI.
        </div>
      )}

      {/* Stats cards */}
      <div className={`mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 transition-opacity ${loading ? "opacity-50" : ""}`}>
        <StatsCard
          label="Impressions"
          value={totals.impressions}
          change={period !== "all" ? totals.changes.impressions : undefined}
        />
        <StatsCard
          label="Clicks"
          value={totals.clicks}
          change={period !== "all" ? totals.changes.clicks : undefined}
        />
        <StatsCard
          label="CTA Clicks"
          value={totals.cta_clicks}
          change={period !== "all" ? totals.changes.cta_clicks : undefined}
        />
        <StatsCard label="CTR" value={totals.ctr} />
        <StatsCard
          label="Conversions"
          value={totals.conversions}
          change={period !== "all" ? totals.changes.conversions : undefined}
        />
        <StatsCard label="Conv. Rate" value={totals.conv_rate} />
      </div>

      {/* Chart */}
      <div className={`mt-5 transition-opacity ${loading ? "opacity-50" : ""}`}>
        <DailyChart key={`chart-${period}-${totals.impressions}`} data={daily} />
      </div>

      {/* Ad list */}
      <div className="mt-6">
        <h2 className="mb-3 text-base text-cream">Your Ads</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {ads.map((ad) => (
            <AdCard key={ad.id} ad={ad} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center">
          <p className="text-sm text-muted">Loading...</p>
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
