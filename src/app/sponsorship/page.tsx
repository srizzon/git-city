import type { Metadata } from "next";
import Link from "next/link";
import { SponsorshipPageTracker } from "./tracking";
import SponsorshipLanding from "./SponsorshipLanding";

export const metadata: Metadata = {
  title: "Git City for Brands. Sponsor a 3D city of 40K developers.",
  description:
    "Put your brand where 40,000 developers already hang out. Custom 3D landmarks from $500/mo, themed week takeovers, annual partnerships. Solo dev, 2 to 3 week turnaround.",
  openGraph: {
    title: "Git City for Brands. Sponsor a 3D city of 40K developers.",
    description:
      "Put your brand where 40,000 developers already hang out. Custom 3D landmarks from $500/mo, themed week takeovers, annual partnerships. Solo dev, 2 to 3 week turnaround.",
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

export default function SponsorshipPage() {
  return (
    <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
      <SponsorshipPageTracker />

      <div className="mx-auto max-w-4xl px-4 pb-12">
        {/* Header */}
        <div className="flex items-center justify-between pt-6">
          <Link
            href="/"
            className="text-sm text-muted transition-colors hover:text-cream"
          >
            &larr; Back to City
          </Link>
        </div>

        <SponsorshipLanding />
      </div>
    </main>
  );
}
