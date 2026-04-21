import type { Metadata } from "next";
import Link from "next/link";
import { AdvertisePageTracker } from "./tracking";
import AdvertiseLanding from "./AdvertiseLanding";

export const metadata: Metadata = {
  title: "Advertise in Git City — 3D Ads for Developers",
  description:
    "Planes, blimps, and rooftop signs inside a 3D city with 172K+ developers. 1%+ CTR, 3x the industry average. From $47/mo.",
  openGraph: {
    title: "Advertise in Git City — 3D Ads for Developers",
    description:
      "Planes, blimps, and rooftop signs inside a 3D city with 172K+ developers. 1%+ CTR, 3x the industry average. From $47/mo.",
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

export default function AdvertisePage() {
  return (
    <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
      <AdvertisePageTracker />

      <div className="mx-auto max-w-4xl px-4 pb-12">
        {/* Header */}
        <div className="flex items-center justify-between pt-6">
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

        <AdvertiseLanding />
      </div>
    </main>
  );
}
