"use client";

import { useState, useEffect, use, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { StatsCard } from "../_components/stats-card";
import { PeriodSelector, type Period } from "../_components/period-selector";
import { DailyChart } from "../_components/daily-chart";
import { ProgressBar } from "../_components/progress-bar";

const ACCENT = "#c8e64a";

const VEHICLE_ICONS: Record<string, string> = {
  plane: "\u2708",
  blimp: "\u25C6",
  billboard: "\uD83D\uDCCB",
  rooftop_sign: "\uD83D\uDD04",
  led_wrap: "\uD83D\uDCA1",
};

interface AdDetail {
  id: string;
  text: string;
  brand: string | null;
  description: string | null;
  color: string;
  bg_color: string;
  vehicle: string;
  active: boolean;
  link: string | null;
  plan_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string | null;
  impressions: number;
  clicks: number;
  cta_clicks: number;
  conversions: number;
  revenue_cents: number;
  ctr: string;
  cpc: string | null;
}

interface AudienceData {
  countries: { code: string; name: string; pct: number }[];
  languages: { name: string; pct: number }[];
  seniority: { level: string; pct: number }[];
  devices: { type: string; pct: number }[];
  hourly: number[];
  sample_rate: number;
  total_identified: number;
}

function formatDate(d: string | null) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const VALID_PERIODS = new Set(["7d", "30d", "90d", "all"]);

function parsePeriod(raw: string | null): Period {
  return raw && VALID_PERIODS.has(raw) ? (raw as Period) : "30d";
}

function AdDetailContent({ adId }: { adId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [period, setPeriodState] = useState<Period>(() => parsePeriod(searchParams.get("period")));
  const [ad, setAd] = useState<AdDetail | null>(null);
  const [daily, setDaily] = useState<{ day: string; impressions: number; clicks: number }[]>([]);
  const [audience, setAudience] = useState<AudienceData | null>(null);
  const [loading, setLoading] = useState(true);

  function setPeriod(p: Period) {
    setPeriodState(p);
    router.replace(`/ads/dashboard/${adId}?period=${p}`);
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/ads/stats?period=${period}&ad_id=${adId}&_t=${Date.now()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const found = d.ads?.find((a: AdDetail) => a.id === adId);
        if (found) {
          setAd(found);
        }
        setDaily(d.daily ?? []);
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [adId, period]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/ads/audience/${adId}?period=${period}&_t=${Date.now()}`, { cache: "no-store" })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (!cancelled && d) setAudience(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [adId, period]);

  async function handleToggle() {
    if (!ad) return;
    await fetch(`/api/ads/manage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ad_id: ad.id, action: ad.active ? "pause" : "activate" }),
    });
    setAd({ ...ad, active: !ad.active });
  }

  if (loading && !ad) {
    return <div className="flex h-64 items-center justify-center"><p className="text-sm text-muted">Loading...</p></div>;
  }

  if (!ad) {
    return <div className="mt-12 text-center"><p className="text-base text-muted">Ad not found</p></div>;
  }

  const now = new Date();
  const isExpired = ad.ends_at ? now > new Date(ad.ends_at) : false;
  const status = !ad.active && !ad.starts_at ? "pending" : ad.active && !isExpired ? "active" : isExpired ? "expired" : "paused";
  const statusColors: Record<string, string> = { pending: "#f8d880", active: ACCENT, expired: "#888", paused: "#ff9800" };

  const daysActive = ad.starts_at ? Math.max(1, Math.ceil((now.getTime() - new Date(ad.starts_at).getTime()) / 86400000)) : 0;
  const totalDays = ad.starts_at && ad.ends_at ? Math.max(1, Math.ceil((new Date(ad.ends_at).getTime() - new Date(ad.starts_at).getTime()) / 86400000)) : 30;
  const avgDailyImpressions = daysActive > 0 ? ad.impressions / daysActive : 0;
  const estimatedTotal = Math.round(avgDailyImpressions * totalDays);

  return (
    <div>
      <Link href="/ads/dashboard" className="text-sm text-muted transition-colors hover:text-cream">&larr; Dashboard</Link>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{VEHICLE_ICONS[ad.vehicle] ?? "\u2708"}</span>
          <div>
            <h1 className="text-xl text-cream">{ad.brand || ad.text.slice(0, 30)}</h1>
            <p className="text-xs text-muted normal-case">{ad.vehicle.replace("_", " ")} &middot; {ad.plan_id?.replace("_", " ") ?? "custom"}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs uppercase" style={{ color: statusColors[status] }}>{status}</span>
          {!isExpired && ad.starts_at && (
            <button
              type="button"
              onClick={handleToggle}
              className="border-[2px] border-border px-3 py-1.5 text-xs text-muted transition-colors hover:text-cream"
            >
              {ad.active ? "Pause" : "Activate"}
            </button>
          )}
          <PeriodSelector value={period} onChange={setPeriod} />
        </div>
      </div>

      {!ad.link && ad.active && (
        <div className="mt-4 border-[3px] px-4 py-3 text-sm normal-case" style={{ borderColor: "#f8d880", color: "#f8d880", backgroundColor: "#f8d88010" }}>
          Your ad has no link. <Link href={`/ads/dashboard/${ad.id}/edit`} className="underline">Add one</Link> to convert clicks into visits.
        </div>
      )}

      {/* Live banner preview */}
      <div
        className="mt-4 overflow-hidden px-4 py-3 text-center text-xs tracking-widest"
        style={{
          backgroundColor: ad.bg_color,
          color: ad.color,
          fontFamily: "monospace",
          letterSpacing: "0.15em",
        }}
      >
        {ad.text}
      </div>

      <div className={`mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7 transition-opacity ${loading ? "opacity-50" : ""}`}>
        <StatsCard label="Impressions" value={ad.impressions} />
        <StatsCard label="Clicks" value={ad.clicks} />
        <StatsCard label="CTA Clicks" value={ad.cta_clicks} />
        <StatsCard label="CTR" value={ad.ctr} />
        <StatsCard label="CPC" value={ad.cpc ?? "-"} />
        <StatsCard label="Conversions" value={ad.conversions} />
        <StatsCard
          label="Conv. Rate"
          value={ad.cta_clicks > 0 ? ((ad.conversions / ad.cta_clicks) * 100).toFixed(2) + "%" : "0.00%"}
        />
      </div>

      {ad.starts_at && estimatedTotal > 0 && (
        <div className="mt-4">
          <ProgressBar current={ad.impressions} total={estimatedTotal} label="Estimated impression delivery" />
        </div>
      )}

      <div className={`mt-5 transition-opacity ${loading ? "opacity-50" : ""}`}>
        <DailyChart key={`${adId}-${period}-${ad.impressions}`} data={daily} />
      </div>

      {/* Ad details / Edit section */}
      <div className="mt-6 border-[3px] border-border p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base text-cream">Details</h2>
          <Link
            href={`/ads/dashboard/${ad.id}/edit`}
            className="border-[2px] px-4 py-1.5 text-xs transition-colors hover:text-cream"
            style={{ borderColor: ACCENT, color: ACCENT }}
          >
            Edit
          </Link>
        </div>

        <div className="mt-4 space-y-3">
          {[
            { label: "Brand", value: ad.brand || "-" },
            { label: "Description", value: ad.description || "-" },
            { label: "Link", value: ad.link || "None" },
            { label: "Text color", value: ad.color },
            { label: "Background", value: ad.bg_color },
            { label: "Vehicle", value: ad.vehicle.replace("_", " ") },
            { label: "Created", value: formatDate(ad.created_at) },
            { label: "Started", value: formatDate(ad.starts_at) },
            { label: "Ends", value: formatDate(ad.ends_at) },
          ].map((row) => (
            <div key={row.label} className="flex items-baseline justify-between text-sm">
              <span className="text-muted normal-case">{row.label}</span>
              <span className="text-cream normal-case">{row.value}</span>
            </div>
          ))}
        </div>
      </div>

      {audience && audience.total_identified >= 100 && (
        <div className="mt-6 border-[3px] border-border p-5">
          <h2 className="text-base text-cream">Audience Profile</h2>
          <p className="mt-1 text-xs text-muted normal-case">Based on {audience.sample_rate.toFixed(0)}% of impressions ({audience.total_identified.toLocaleString()} identified viewers)</p>

          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            {audience.countries.length > 0 && (
              <div>
                <p className="mb-2 text-xs text-muted normal-case">Top Countries</p>
                {audience.countries.slice(0, 8).map((c) => (
                  <div key={c.code} className="flex items-center justify-between py-1 text-sm">
                    <span className="text-cream normal-case">{c.name}</span>
                    <span className="text-muted">{c.pct.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            )}
            {audience.languages.length > 0 && (
              <div>
                <p className="mb-2 text-xs text-muted normal-case">Top Languages</p>
                {audience.languages.slice(0, 8).map((l) => (
                  <div key={l.name} className="flex items-center justify-between py-1 text-sm">
                    <span className="text-cream normal-case">{l.name}</span>
                    <span className="text-muted">{l.pct.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            )}
            {audience.seniority.length > 0 && (
              <div>
                <p className="mb-2 text-xs text-muted normal-case">Seniority</p>
                {audience.seniority.map((s) => (
                  <div key={s.level} className="flex items-center justify-between py-1 text-sm">
                    <span className="text-cream normal-case">{s.level}</span>
                    <span className="text-muted">{s.pct.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            )}
            {audience.devices.length > 0 && (
              <div>
                <p className="mb-2 text-xs text-muted normal-case">Devices</p>
                {audience.devices.map((d) => (
                  <div key={d.type} className="flex items-center justify-between py-1 text-sm">
                    <span className="text-cream normal-case">{d.type}</span>
                    <span className="text-muted">{d.pct.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {audience.hourly.length === 24 && (
            <div className="mt-5">
              <p className="mb-2 text-xs text-muted normal-case">Peak Hours (UTC)</p>
              <div className="flex gap-px">
                {audience.hourly.map((v, i) => {
                  const max = Math.max(...audience.hourly, 1);
                  const intensity = v / max;
                  return (
                    <div
                      key={i}
                      className="h-8 flex-1"
                      style={{ backgroundColor: `rgba(200, 230, 74, ${0.1 + intensity * 0.9})` }}
                      title={`${i}:00 UTC: ${v} impressions`}
                    />
                  );
                })}
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-muted">
                <span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdDetailPage({ params }: { params: Promise<{ adId: string }> }) {
  const { adId } = use(params);

  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center">
          <p className="text-sm text-muted">Loading...</p>
        </div>
      }
    >
      <AdDetailContent adId={adId} />
    </Suspense>
  );
}
