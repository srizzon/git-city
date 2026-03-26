import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase";

const ACCENT = "#c8e64a";

// Historical baselines from Himetrica (tracking was lost in Supabase due to www origin bug).
// Same map as in /api/sky-ads/analytics — keep in sync.
const HISTORICAL_BASELINES: Record<string, { impressions: number; clicks: number; cta_clicks: number }> = {
  "gitcity":   { impressions: 311161, clicks: 2527, cta_clicks: 1110 },
  "samuel":    { impressions: 280045, clicks: 2274, cta_clicks: 999 },
  "build":     { impressions: 248929, clicks: 2022, cta_clicks: 888 },
  "advertise": { impressions: 31116,  clicks: 253,  cta_clicks: 110 },
};

export const metadata: Metadata = {
  title: "Ad Tracking - Git City Sky Ads",
  robots: { index: false, follow: false },
};

interface Props {
  params: Promise<{ token: string }>;
}

export default async function TrackingPage({ params }: Props) {
  const { token } = await params;

  if (!token || token.length < 10) notFound();

  const sb = getSupabaseAdmin();

  const { data: ad } = await sb
    .from("sky_ads")
    .select("id, text, brand, color, bg_color, vehicle, active, starts_at, ends_at, plan_id, created_at")
    .eq("tracking_token", token)
    .maybeSingle();

  if (!ad) notFound();

  // Fetch event counts
  const [impressions, clicks, ctaClicks] = await Promise.all([
    sb
      .from("sky_ad_events")
      .select("id", { count: "exact", head: true })
      .eq("ad_id", ad.id)
      .eq("event_type", "impression"),
    sb
      .from("sky_ad_events")
      .select("id", { count: "exact", head: true })
      .eq("ad_id", ad.id)
      .eq("event_type", "click"),
    sb
      .from("sky_ad_events")
      .select("id", { count: "exact", head: true })
      .eq("ad_id", ad.id)
      .eq("event_type", "cta_click"),
  ]);

  // Add historical baselines
  const baseline = HISTORICAL_BASELINES[ad.id] ?? { impressions: 0, clicks: 0, cta_clicks: 0 };
  const totalImpressions = (impressions.count ?? 0) + baseline.impressions;
  const totalClicks = (clicks.count ?? 0) + baseline.clicks;
  const totalCtaClicks = (ctaClicks.count ?? 0) + baseline.cta_clicks;

  const now = new Date();
  const endsAt = ad.ends_at ? new Date(ad.ends_at) : null;
  const isExpired = endsAt ? now > endsAt : false;
  const status = !ad.active && !ad.starts_at
    ? "pending"
    : ad.active && !isExpired
      ? "active"
      : "expired";

  const statusColors = {
    pending: "#f8d880",
    active: ACCENT,
    expired: "#888",
  };

  function formatDate(dateStr: string | null) {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  return (
    <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Link
          href="/advertise"
          className="text-xs text-muted transition-colors hover:text-cream"
        >
          &larr; Back to Advertise
        </Link>

        <h1 className="mt-8 text-2xl text-cream">
          Ad <span style={{ color: ACCENT }}>Tracking</span>
        </h1>

        {/* Ad Preview */}
        <div className="mt-6 border-[3px] border-border p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-lg">
                {ad.vehicle === "plane" ? "\u2708" : ad.vehicle === "blimp" ? "\u25C6" : ad.vehicle === "billboard" ? "\uD83D\uDCCB" : ad.vehicle === "rooftop_sign" ? "\uD83D\uDD04" : ad.vehicle === "led_wrap" ? "\uD83D\uDCA1" : "\u2708"}
              </span>
              <span className="text-xs text-cream">
                {ad.brand || ad.id}
              </span>
            </div>
            <span
              className="text-[10px] uppercase"
              style={{ color: statusColors[status] }}
            >
              {status}
            </span>
          </div>

          {/* Banner preview */}
          <div
            className="mt-4 overflow-hidden px-4 py-2 text-center text-[10px] tracking-widest"
            style={{
              backgroundColor: ad.bg_color,
              color: ad.color,
              fontFamily: "monospace",
              letterSpacing: "0.15em",
            }}
          >
            {ad.text}
          </div>
        </div>

        {/* Stats */}
        <div className="mt-6 grid grid-cols-3 gap-4">
          {[
            { label: "Impressions", value: totalImpressions },
            { label: "Clicks", value: totalClicks },
            { label: "CTA Clicks", value: totalCtaClicks },
          ].map((stat) => (
            <div
              key={stat.label}
              className="border-[3px] border-border p-4 text-center"
            >
              <p className="text-xl text-cream" style={{ color: ACCENT }}>
                {stat.value.toLocaleString()}
              </p>
              <p className="mt-1 text-[9px] text-muted normal-case">
                {stat.label}
              </p>
            </div>
          ))}
        </div>

        {/* Details */}
        <div className="mt-6 border-[3px] border-border p-5">
          <h2 className="text-sm text-cream">Details</h2>
          <div className="mt-4 space-y-3">
            {[
              { label: "Vehicle", value: ad.vehicle === "rooftop_sign" ? "Rooftop Sign" : ad.vehicle === "led_wrap" ? "LED Wrap" : ad.vehicle.charAt(0).toUpperCase() + ad.vehicle.slice(1) },
              { label: "Plan", value: ad.plan_id?.replace("_", " ") ?? "-" },
              { label: "Created", value: formatDate(ad.created_at) },
              { label: "Started", value: formatDate(ad.starts_at) },
              { label: "Ends", value: formatDate(ad.ends_at) },
            ].map((row) => (
              <div
                key={row.label}
                className="flex items-baseline justify-between text-[10px]"
              >
                <span className="text-muted normal-case">{row.label}</span>
                <span className="text-cream">{row.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-center gap-6">
          <Link
            href={`/advertise/setup/${token}`}
            className="text-[10px] normal-case transition-colors hover:text-cream"
            style={{ color: ACCENT }}
          >
            Edit ad details &rarr;
          </Link>
          <Link
            href="/business/login?redirect=/ads/dashboard"
            className="text-[10px] normal-case transition-colors hover:text-cream"
            style={{ color: ACCENT }}
          >
            Advertiser Dashboard &rarr;
          </Link>
        </div>

        <p className="mt-4 text-center text-[9px] text-muted normal-case">
          Bookmark this page to check your ad stats anytime.
          <br />
          Stats update in real time as visitors interact with your ad in the 3D city.
        </p>

        <div className="mt-8 text-center">
          <Link
            href="/"
            className="btn-press inline-block px-7 py-3.5 text-sm text-bg"
            style={{
              backgroundColor: ACCENT,
              boxShadow: "4px 4px 0 0 #5a7a00",
            }}
          >
            Enter the City
          </Link>
        </div>
      </div>
    </main>
  );
}
