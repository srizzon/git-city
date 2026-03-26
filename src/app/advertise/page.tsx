import type { Metadata } from "next";
import Link from "next/link";
import { AdvertisePageTracker } from "./tracking";
import { AdPurchaseForm } from "./AdPurchaseForm";

const ACCENT = "#c8e64a";

export const metadata: Metadata = {
  title: "Advertise on Git City",
  description:
    "Reach 60,000+ GitHub developers. Planes, blimps, and billboards in a 3D city. 1%+ CTR (2x industry avg). From $29/mo.",
  openGraph: {
    title: "Advertise on Git City",
    description:
      "Reach 60,000+ GitHub developers. Planes, blimps, and billboards in a 3D city. 1%+ CTR (2x industry avg). From $29/mo.",
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

const FAQ = [
  {
    q: "How many people will see my ad?",
    a: "Thousands of monthly impressions across 60,000+ developer buildings. Sky ads fly across the entire skyline. Building ads sit on the tallest towers.",
  },
  {
    q: "What formats are available?",
    a: "Sky: planes with LED banners, blimps with scrolling screens. Building: billboards, rotating rooftop signs, full LED wraps.",
  },
  {
    q: "Can I change my ad after buying?",
    a: "Yes. Update your text, brand, description, and link anytime. Unlimited changes, no extra cost.",
  },
  {
    q: "How do I pay?",
    a: "Credit card, Apple Pay, Google Pay via Stripe, or PIX for Brazilian users. No account needed.",
  },
  {
    q: "What if I want to cancel?",
    a: "Cancel anytime. Your ad stays active until the end of the billing period.",
  },
];

export default function AdvertisePage() {
  return (
    <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
      <AdvertisePageTracker />

      <div className="mx-auto max-w-3xl px-4 pt-6 pb-12">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="text-sm text-muted transition-colors hover:text-cream"
          >
            &larr; Back to City
          </Link>
          <Link
            href="/business/login?redirect=/ads/dashboard"
            className="text-sm text-muted transition-colors hover:text-cream"
          >
            Log in
          </Link>
        </div>

        {/* Form (contains 3D preview + all controls) */}
        <div className="mt-6">
          <AdPurchaseForm />
        </div>

        {/* FAQ accordion */}
        <div className="mt-12">
          <p className="mb-5 text-base text-cream">FAQ</p>
          <div className="space-y-2">
            {FAQ.map((item) => (
              <details
                key={item.q}
                className="group border-2 border-border"
              >
                <summary className="flex cursor-pointer items-center justify-between p-4 text-sm text-cream transition-colors hover:text-lime [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <span className="ml-3 text-xs text-muted transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="border-t border-border px-4 py-3 text-sm leading-relaxed text-muted normal-case">
                  {item.a}
                </p>
              </details>
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
    </main>
  );
}
