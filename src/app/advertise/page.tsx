import type { Metadata } from "next";
import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { AdvertisePageTracker } from "./tracking";
import { AdPurchaseForm } from "./AdPurchaseForm";

const ACCENT = "#c8e64a";

export const metadata: Metadata = {
  title: "Advertise on Git City",
  description:
    "Reach 9,000+ GitHub developers. Planes, blimps, and billboards in a 3D city. 1%+ CTR (2x industry avg). From $9/week.",
  openGraph: {
    title: "Advertise on Git City",
    description:
      "Reach 9,000+ GitHub developers. Planes, blimps, and billboards in a 3D city. 1%+ CTR (2x industry avg). From $9/week.",
    siteName: "Git City",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    creator: "@samuelrizzondev",
    site: "@samuelrizzondev",
  },
};

function formatK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.floor(n / 1_000)}K`;
  return n.toLocaleString();
}

async function getStats() {
  const supabase = getSupabaseAdmin();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const [devResult, impressionResult, clickResult] = await Promise.all([
    supabase
      .from("developers")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("sky_ad_events")
      .select("id", { count: "exact", head: true })
      .eq("event_type", "impression")
      .gte("created_at", thirtyDaysAgo),
    supabase
      .from("sky_ad_events")
      .select("id", { count: "exact", head: true })
      .in("event_type", ["click", "cta_click"])
      .gte("created_at", thirtyDaysAgo),
  ]);

  const impressions = impressionResult.count ?? 0;
  const clicks = clickResult.count ?? 0;
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;

  return { devCount: devResult.count ?? 0, monthlyImpressions: impressions, monthlyClicks: clicks, ctr };
}

const COMPETITORS = [
  { name: "X (Twitter)", ctr: 0.8 },
  { name: "Google Display", ctr: 0.5 },
  { name: "LinkedIn", ctr: 0.4 },
  { name: "Avg banner ad", ctr: 0.46 },
];

export default async function AdvertisePage() {
  const { devCount, monthlyImpressions, monthlyClicks, ctr } = await getStats();

  const statCards = [
    { value: `${formatK(monthlyImpressions)}+`, label: "monthly impressions" },
    { value: `${formatK(monthlyClicks)}+`, label: "monthly ad clicks" },
    {
      value: `${ctr.toFixed(1)}%`,
      label: "avg click rate",
      sub: ctr > 0.9 ? "2x+ industry avg" : undefined,
    },
    { value: `${formatK(devCount)}+`, label: "GitHub developers" },
  ];

  const barMax = Math.max(ctr, 1.2);

  return (
    <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
      <AdvertisePageTracker />

      <div className="mx-auto max-w-3xl px-4 pt-6 pb-12">
        {/* Nav */}
        <Link
          href="/"
          className="text-sm text-muted transition-colors hover:text-cream"
        >
          &larr; Back to City
        </Link>

        {/* ── Hero ── */}
        <div className="mt-10 text-center">
          <h1 className="text-3xl text-cream sm:text-4xl">
            Advertise where developers{" "}
            <span style={{ color: ACCENT }}>actually look</span>
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-muted normal-case">
            Planes fly across the sky. Blimps float between buildings.
            Billboards light up the tallest towers. {devCount.toLocaleString()}+ real
            GitHub developers explore this city every week. Your ad lives inside it.
          </p>
        </div>

        {/* ── Stats ── */}
        <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {statCards.map((s) => (
            <div
              key={s.label}
              className="border-[3px] border-border p-4 text-center"
            >
              <p className="text-2xl" style={{ color: ACCENT }}>
                {s.value}
              </p>
              <p className="mt-1 text-xs leading-tight text-muted normal-case">
                {s.label}
              </p>
              {s.sub && (
                <p
                  className="mt-1 text-[10px] normal-case"
                  style={{ color: ACCENT }}
                >
                  {s.sub}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* ── Your audience ── */}
        <div className="mt-8 border-[3px] border-border p-5 sm:p-6">
          <p className="text-base text-cream">Your audience</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[
              "Verified GitHub developers, not bots",
              "Software engineers, CTOs, indie hackers",
              "Premium demographic: avg $120K+ salary",
              "Minutes of engagement per session, not seconds",
              "Global reach: US, EU, Brazil, India",
              "100% viewability. No ad blockers. No scroll-past",
            ].map((f) => (
              <p
                key={f}
                className="flex items-start gap-2 text-sm text-muted normal-case"
              >
                <span className="mt-px" style={{ color: ACCENT }}>
                  +
                </span>
                {f}
              </p>
            ))}
          </div>
        </div>

        {/* ── CTR comparison ── */}
        {ctr > 0.5 && (
          <div className="mt-8 border-[3px] border-border p-5 sm:p-6">
            <p className="text-base text-cream">
              Git City vs traditional ads
            </p>
            <p className="mt-1 text-xs text-muted normal-case">
              Click-through rate comparison (30-day average)
            </p>

            <div className="mt-5 space-y-3">
              {/* Git City bar */}
              <div className="flex items-center gap-3">
                <span className="w-28 shrink-0 text-xs text-cream normal-case sm:w-32">
                  Git City
                </span>
                <div className="relative h-6 flex-1 overflow-hidden rounded-sm">
                  <div
                    className="absolute inset-y-0 left-0 rounded-sm"
                    style={{
                      width: `${(ctr / barMax) * 100}%`,
                      backgroundColor: ACCENT,
                    }}
                  />
                </div>
                <span
                  className="w-14 text-right text-sm font-bold"
                  style={{ color: ACCENT }}
                >
                  {ctr.toFixed(1)}%
                </span>
              </div>

              {/* Competitor bars */}
              {COMPETITORS.map((p) => (
                <div key={p.name} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 text-xs text-muted normal-case sm:w-32">
                    {p.name}
                  </span>
                  <div className="relative h-6 flex-1 overflow-hidden rounded-sm">
                    <div
                      className="absolute inset-y-0 left-0 rounded-sm bg-border"
                      style={{ width: `${(p.ctr / barMax) * 100}%` }}
                    />
                  </div>
                  <span className="w-14 text-right text-sm text-muted">
                    {p.ctr}%
                  </span>
                </div>
              ))}
            </div>

            <p className="mt-4 text-xs text-dim normal-case">
              3D ads inside the world, not banners people train
              themselves to ignore.
            </p>
          </div>
        )}

        {/* ── Purchase form ── */}
        <div className="mt-10">
          <AdPurchaseForm />
        </div>
      </div>

      {/* ═══════════════════════════════════════════
          ZONE 2: HOW IT WORKS + FAQ
          ═══════════════════════════════════════════ */}
      <div
        className="border-t-[3px] border-border"
        style={{ backgroundColor: "#080e1c" }}
      >
        <div className="mx-auto max-w-3xl px-4 py-16">
          {/* How it works */}
          <div className="grid gap-8 sm:grid-cols-4">
            {[
              { n: "01", t: "Pick", d: "Sky or building ads. 5 formats, starting at $9/week" },
              {
                n: "02",
                t: "Design",
                d: "Your text, your colors. Live 3D preview",
              },
              {
                n: "03",
                t: "Pay",
                d: "Stripe checkout. No account needed. 30 seconds",
              },
              {
                n: "04",
                t: "Track",
                d: "Real-time impressions, clicks, and CTR",
              },
            ].map((s) => (
              <div key={s.n}>
                <span className="text-2xl" style={{ color: ACCENT }}>
                  {s.n}
                </span>
                <h3 className="mt-1 text-base text-cream">{s.t}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted normal-case">
                  {s.d}
                </p>
              </div>
            ))}
          </div>

          {/* Every ad includes */}
          <div className="mt-14 grid gap-x-8 gap-y-3 sm:grid-cols-2">
            <p className="mb-2 text-base text-cream sm:col-span-2">
              Every ad includes
            </p>
            {[
              "Your text, your colors, your link",
              "Live 3D preview before you buy",
              "Clickable CTA with UTM tracking",
              "Real-time impressions and click dashboard",
              "Goes live within minutes",
              "Change your ad anytime, no extra cost",
            ].map((f) => (
              <p
                key={f}
                className="flex items-center gap-2 text-sm text-muted normal-case"
              >
                <span style={{ color: ACCENT }}>+</span>
                {f}
              </p>
            ))}
          </div>

          {/* FAQ */}
          <div className="mt-14">
            <p className="mb-5 text-base text-cream">FAQ</p>
            <div className="space-y-3">
              {[
                {
                  q: "How many people will see my ad?",
                  a: `${formatK(monthlyImpressions)}+ monthly impressions across ${devCount.toLocaleString()}+ developer buildings. Sky ads fly across the entire skyline. Building ads sit on the tallest towers. There is no way to visit the city without seeing your ad.`,
                },
                {
                  q: "What's the click-through rate?",
                  a: `${ctr.toFixed(1)}% average CTR. That's 2x+ the industry average for display ads (0.46%). People click because the ads are part of the world, not something to scroll past.`,
                },
                {
                  q: "Who is the audience?",
                  a: "100% GitHub developers. Software engineers, CTOs, indie hackers, open source maintainers. Every building is a real GitHub profile with real contribution data. No bots, no fake traffic.",
                },
                {
                  q: "What formats are available?",
                  a: "Sky: planes trailing LED banners, blimps with scrolling LED screens. Building: billboards mounted on tower faces, rotating rooftop signs, full LED wraps. All rendered in dot-matrix pixel style.",
                },
                {
                  q: "Do I get analytics?",
                  a: "Yes. After purchase you get a private tracking dashboard with real-time impressions, clicks, and CTA clicks. Bookmark it and check anytime.",
                },
                {
                  q: "How many ad slots are available?",
                  a: "8 plane slots, 4 blimp slots, 10 each for billboard, rooftop, and LED wrap. Limited inventory keeps your ad visible.",
                },
                {
                  q: "How do I pay?",
                  a: "Credit card, Apple Pay, or Google Pay via Stripe. No account needed. Takes about 30 seconds.",
                },
                {
                  q: "Can I change my ad after buying?",
                  a: "Yes. You get a setup page where you can update your text, brand name, description, and link anytime. Unlimited changes, no extra cost.",
                },
                {
                  q: "What if I want a refund?",
                  a: "Refunds are evaluated on a case-by-case basis. Contact samuelrizzondev@gmail.com within the first 24 hours if there's an issue with your ad.",
                },
              ].map((item) => (
                <div key={item.q} className="border-[2px] border-border p-5">
                  <h3 className="text-sm text-cream">{item.q}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted normal-case">
                    {item.a}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="mt-14 text-center">
            <p className="text-xs text-muted normal-case">
              Questions?{" "}
              <a
                href="mailto:samuelrizzondev@gmail.com"
                className="transition-colors hover:text-cream"
                style={{ color: ACCENT }}
              >
                samuelrizzondev@gmail.com
              </a>
            </p>
            <p className="mt-4 text-xs text-muted normal-case">
              built by{" "}
              <a
                href="https://x.com/samuelrizzondev"
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-cream"
                style={{ color: ACCENT }}
              >
                @samuelrizzondev
              </a>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
