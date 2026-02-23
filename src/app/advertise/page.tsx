import type { Metadata } from "next";
import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { AdvertisePageTracker, AdvertiseCtaLink } from "./tracking";

const ACCENT = "#c8e64a";
const SHADOW = "#5a7a00";
const MAILTO =
  "mailto:samuelrizzondev@gmail.com?subject=Git%20City%20Sky%20Ad%20%E2%80%93%20Interested";

export const metadata: Metadata = {
  title: "Advertise on Git City - Sky Ads",
  description:
    "Put your brand in the sky above a 3D city of GitHub developers. Planes, blimps, LED banners, impression tracking, and click analytics.",
  openGraph: {
    title: "Advertise on Git City",
    description:
      "Your brand flying over 1,000+ developer buildings. Planes, blimps, LED banners with full analytics.",
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
      <div className="mx-auto max-w-3xl px-4 py-10">
        {/* Nav */}
        <Link
          href="/"
          className="text-xs text-muted transition-colors hover:text-cream"
        >
          &larr; Back to City
        </Link>

        <AdvertisePageTracker />

        {/* Hero */}
        <section className="mt-10 text-center">
          <h1 className="text-3xl text-cream md:text-4xl">
            Advertise on{" "}
            <span style={{ color: ACCENT }}>Git City</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-xs text-muted normal-case">
            {devCount.toLocaleString()}+ developers see your brand flying over
            the city. Planes, blimps, LED banners, full analytics.
          </p>
          <AdvertiseCtaLink
            href={MAILTO}
            className="btn-press mt-6 inline-block px-7 py-3.5 text-sm text-bg"
            style={{
              backgroundColor: ACCENT,
              boxShadow: `4px 4px 0 0 ${SHADOW}`,
            }}
          >
            Get Started
          </AdvertiseCtaLink>
        </section>

        {/* How it works */}
        <section className="mt-14">
          <h2 className="text-center text-xl text-cream">
            How it <span style={{ color: ACCENT }}>works</span>
          </h2>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {[
              {
                step: "01",
                title: "Choose your vehicle",
                desc: "Plane with a banner trail or blimp with dual LED screens. Pick what fits your campaign.",
              },
              {
                step: "02",
                title: "Customize",
                desc: "Your brand name, colors, banner text, and a clickable link on every ad.",
              },
              {
                step: "03",
                title: "Fly over the city",
                desc: `Your ad flies over ${devCount.toLocaleString()}+ developer buildings. We track impressions and clicks.`,
              },
            ].map((item) => (
              <div
                key={item.step}
                className="border-[3px] border-border p-5"
              >
                <span
                  className="text-2xl"
                  style={{ color: ACCENT }}
                >
                  {item.step}
                </span>
                <h3 className="mt-2 text-sm text-cream">{item.title}</h3>
                <p className="mt-2 text-[10px] leading-relaxed text-muted normal-case">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Vehicles */}
        <section className="mt-14">
          <h2 className="text-center text-xl text-cream">
            <span style={{ color: ACCENT }}>Vehicles</span>
          </h2>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="border-[3px] border-border p-5">
              <div className="flex items-center gap-3">
                <span className="text-2xl">&#9992;</span>
                <h3 className="text-sm text-cream">Plane</h3>
              </div>
              <p className="mt-3 text-[10px] leading-relaxed text-muted normal-case">
                Fast flyby with a banner trailing behind. Loops around the city
                edge. Best for short messages and quick brand impressions.
              </p>
            </div>

            <div className="border-[3px] border-border p-5">
              <div className="flex items-center gap-3">
                <span className="text-2xl">&#128680;</span>
                <h3 className="text-sm text-cream">Blimp</h3>
              </div>
              <p className="mt-3 text-[10px] leading-relaxed text-muted normal-case">
                Slow hover with dual LED screens on both sides. Floats over
                downtown. Best for brand presence and longer messages.
              </p>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="mt-14">
          <h2 className="text-center text-xl text-cream">
            Real <span style={{ color: ACCENT }}>numbers</span>
          </h2>

          <div className="mt-6 grid grid-cols-2 gap-4">
            <div className="border-[3px] border-border p-5 text-center">
              <p className="text-2xl text-cream md:text-3xl" style={{ color: ACCENT }}>
                {devCount.toLocaleString()}+
              </p>
              <p className="mt-2 text-[10px] text-muted normal-case">
                developer buildings
              </p>
            </div>
            <div className="border-[3px] border-border p-5 text-center">
              <p className="text-2xl text-cream md:text-3xl" style={{ color: ACCENT }}>
                {totalImpressions.toLocaleString()}+
              </p>
              <p className="mt-2 text-[10px] text-muted normal-case">
                ad impressions served
              </p>
            </div>
          </div>

          <p className="mt-4 text-center text-[10px] text-muted normal-case">
            Your ad is seen by developers from GitHub&apos;s top open source
            projects.
          </p>
        </section>

        {/* What's included */}
        <section className="mt-14">
          <h2 className="text-center text-xl text-cream">
            What&apos;s <span style={{ color: ACCENT }}>included</span>
          </h2>

          <div className="mx-auto mt-6 max-w-md border-[3px] border-border p-5">
            <ul className="space-y-3">
              {[
                "Custom brand colors on the banner",
                "Clickable link with UTM tracking",
                "Impression + click analytics dashboard",
                "Choose plane or blimp",
                "Schedule start and end dates",
                "Priority placement options",
              ].map((feature) => (
                <li
                  key={feature}
                  className="flex items-start gap-3 text-[10px] text-muted normal-case"
                >
                  <span
                    className="mt-0.5 text-xs"
                    style={{ color: ACCENT }}
                  >
                    +
                  </span>
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* CTA */}
        <section className="mt-14 text-center">
          <h2 className="text-xl text-cream">
            Interested<span style={{ color: ACCENT }}>?</span>
          </h2>
          <p className="mt-3 text-[10px] text-muted normal-case">
            Send us an email and we&apos;ll get your brand in the sky.
          </p>
          <AdvertiseCtaLink
            href={MAILTO}
            className="btn-press mt-6 inline-block px-7 py-3.5 text-sm text-bg"
            style={{
              backgroundColor: ACCENT,
              boxShadow: `4px 4px 0 0 ${SHADOW}`,
            }}
          >
            Get in Touch
          </AdvertiseCtaLink>
          <p className="mt-4 text-[10px] text-muted normal-case">
            samuelrizzondev@gmail.com
          </p>
        </section>

        {/* Footer */}
        <div className="mt-14 text-center">
          <Link
            href="/"
            className="btn-press inline-block px-7 py-3.5 text-sm text-bg"
            style={{
              backgroundColor: ACCENT,
              boxShadow: `4px 4px 0 0 ${SHADOW}`,
            }}
          >
            Enter the City
          </Link>

          <p className="mt-6 text-[9px] text-muted normal-case">
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
    </main>
  );
}
