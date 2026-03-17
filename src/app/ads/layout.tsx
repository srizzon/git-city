import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Git City Ads",
    template: "%s | Git City Ads",
  },
  robots: { index: false, follow: false },
};

export default function AdsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
