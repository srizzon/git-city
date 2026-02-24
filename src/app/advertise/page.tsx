import type { Metadata } from "next";
import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { AdvertisePageTracker } from "./tracking";
import { AdPurchaseForm } from "./AdPurchaseForm";

const ACCENT = "#c8e64a";
const SHADOW = "#5a7a00";

export const metadata: Metadata = {
  title: "Advertise on Git City",
  description:
    "Advertise on the tallest buildings and across the sky of a 3D city with 1,000+ GitHub developers. Billboards, LED wraps, planes, blimps. Full analytics.",
  openGraph: {
    title: "Advertise on Git City",
    description:
      "Advertise on the tallest buildings and across the sky of a 3D city with 1,000+ GitHub developers. Billboards, LED wraps, planes, blimps. Full analytics.",
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

async function getStats() {
  const supabase = getSupabaseAdmin();

  const [devResult, impressionResult] = await Promise.all([
    supabase
      .from("developers")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("sky_ad_events")
      .select("id", { count: "exact", head: true })
      .eq("event_type", "impression"),
  ]);

  return {
    devCount: devResult.count ?? 0,
    totalImpressions: impressionResult.count ?? 0,
  };
}

export default async function AdvertisePage() {
  const { devCount, totalImpressions } = await getStats();

  return (
    <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
      <AdvertisePageTracker />

      {/* ═══════════════════════════════════════════
          ZONE 1: THE BUILDER
          Purchase flow. Focused. No distractions.
          ═══════════════════════════════════════════ */}
      <div className="mx-auto max-w-3xl px-4 pt-6 pb-10">
        {/* Nav */}
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="text-xs text-muted transition-colors hover:text-cream"
          >
            &larr; Back to City
          </Link>
          <div className="flex items-center gap-4 text-[11px] text-muted normal-case">
            <span>
              <span style={{ color: ACCENT }}>
                {devCount.toLocaleString()}+
              </span>{" "}
              buildings
            </span>
            <span>
              <span style={{ color: ACCENT }}>
                {totalImpressions.toLocaleString()}+
              </span>{" "}
              impressions
            </span>
          </div>
        </div>

        {/* Hero text */}
        <div className="mt-8 text-center">
          <h1 className="text-2xl text-cream sm:text-3xl">
            Your brand in the{" "}
            <span style={{ color: ACCENT }}>skyline</span>
          </h1>
          <p className="mt-2 text-xs text-muted normal-case">
            Planes and blimps in the sky, billboards and LEDs on the tallest
            buildings. <br />
            Pick a format, preview in 3D, go live in minutes.
          </p>
        </div>

        {/* Purchase form: preview + control panel */}
        <div className="mt-6">
          <AdPurchaseForm />
        </div>
      </div>

      {/* ═══════════════════════════════════════════
          ZONE 2: THE PROOF
          For people who scroll down to learn more.
          ═══════════════════════════════════════════ */}
      <div
        className="border-t-[3px] border-border"
        style={{ backgroundColor: "#080e1c" }}
      >
        <div className="mx-auto max-w-3xl px-4 py-14">
          {/* How it works */}
          <div className="grid gap-6 sm:grid-cols-4">
            {[
              { n: "01", t: "Pick", d: "Sky ads or building ads, 5 formats" },
              { n: "02", t: "Design", d: "Write your message, pick your colors, preview in 3D" },
              { n: "03", t: "Pay", d: "Secure checkout, no account needed" },
              { n: "04", t: "Live", d: "Your ad goes live instantly across the city" },
            ].map((s) => (
              <div key={s.n}>
                <span className="text-xl" style={{ color: ACCENT }}>
                  {s.n}
                </span>
                <h3 className="mt-1 text-sm text-cream">{s.t}</h3>
                <p className="mt-1 text-[11px] leading-relaxed text-muted normal-case">
                  {s.d}
                </p>
              </div>
            ))}
          </div>

          {/* Included features */}
          <div className="mt-12 grid gap-x-6 gap-y-2 sm:grid-cols-2">
            <p className="mb-2 text-sm text-cream sm:col-span-2">
              Every ad includes
            </p>
            {[
              "Displayed on the tallest buildings or flying across the skyline",
              "Custom text up to 80 characters with your brand colors",
              "Live 3D preview before you buy",
              "Clickable link with UTM tracking",
              "Real-time impression and click analytics",
              "Goes live instantly after payment",
            ].map((f) => (
              <p
                key={f}
                className="flex items-center gap-2 text-xs text-muted normal-case"
              >
                <span style={{ color: ACCENT }}>+</span>
                {f}
              </p>
            ))}
          </div>

          {/* FAQ */}
          <div className="mt-12">
            <p className="mb-4 text-sm text-cream">FAQ</p>
            <div className="space-y-3">
              {[
                {
                  q: "How many people will see my ad?",
                  a: `The city has ${devCount.toLocaleString()}+ developer buildings and growing. Building ads are placed on the tallest towers, which are the first thing visitors see. Sky ads fly across the entire skyline. Every visitor who explores the city sees your ad.`,
                },
                {
                  q: "What formats are available?",
                  a: "Sky: planes trailing LED banners, blimps with scrolling LED screens. Building: billboards mounted on tower faces, rotating rooftop signs, full LED wraps. All rendered in dot-matrix LED style.",
                },
                {
                  q: "Can I change my ad text?",
                  a: "Yes. One free text change per week. Email samuelrizzondev@gmail.com.",
                },
                {
                  q: "What if I want a refund?",
                  a: "Available within the first 3 days. After that it runs until the end of the paid period.",
                },
                {
                  q: "How do I pay?",
                  a: "Credit card, Apple Pay, or Google Pay via Stripe. No account needed.",
                },
                {
                  q: "How many slots per format?",
                  a: "4 plane, 2 blimp, 10 each for billboard, rooftop, and LED wrap. Limited inventory keeps your ad visible.",
                },
              ].map((item) => (
                <div key={item.q} className="border-[2px] border-border p-4">
                  <h3 className="text-xs text-cream">{item.q}</h3>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-muted normal-case">
                    {item.a}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="mt-12 text-center">
            <a
              href="#"
              className="btn-press inline-block px-7 py-3.5 text-sm text-bg"
              style={{
                backgroundColor: ACCENT,
                boxShadow: `4px 4px 0 0 ${SHADOW}`,
              }}
            >
              Browse Ad Formats
            </a>
            <p className="mt-4 text-[11px] text-muted normal-case">
              Questions?{" "}
              <a
                href="mailto:samuelrizzondev@gmail.com"
                className="transition-colors hover:text-cream"
                style={{ color: ACCENT }}
              >
                samuelrizzondev@gmail.com
              </a>
            </p>
            <p className="mt-4 text-[11px] text-muted normal-case">
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
