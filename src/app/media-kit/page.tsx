import type { Metadata } from "next";
import MediaKitDeck from "./MediaKitDeck";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Media Kit — Git City",
  description:
    "Advertise to 156,000+ developers inside a 3D city built from real GitHub data.",
  openGraph: {
    title: "Media Kit — Git City",
    description:
      "Advertise to 156,000+ developers inside a 3D city built from real GitHub data.",
    siteName: "Git City",
    type: "website",
  },
};

export default function MediaKitPage() {
  return <MediaKitDeck />;
}
