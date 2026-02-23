import type { Metadata } from "next";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_BASE_URL ??
      (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000")
  ),
  title: "Git City - Your GitHub as a 3D City",
  description:
    "Explore GitHub users as buildings in a 3D pixel art city. Fly through the city and discover developers.",
  keywords: [
    "github",
    "3d city",
    "developer profile",
    "contributions",
    "pixel art",
    "open source",
    "git visualization",
  ],
  openGraph: {
    title: "Git City - Your GitHub as a 3D City",
    description:
      "Explore GitHub users as buildings in a 3D pixel art city. Fly through the city and discover developers.",
    siteName: "Git City",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    creator: "@samuelrizzondev",
    site: "@samuelrizzondev",
  },
  authors: [{ name: "Samuel Rizzon", url: "https://x.com/samuelrizzondev" }],
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-icon.png",
  },
};

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ??
  (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000");

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Git City",
  description:
    "Your GitHub profile as a 3D pixel art building in an interactive city",
  url: BASE_URL,
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Web",
  author: {
    "@type": "Person",
    name: "Samuel Rizzon",
    url: "https://x.com/samuelrizzondev",
  },
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Silkscreen&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-bg font-pixel text-warm">
        {children}
        <Analytics />
        <SpeedInsights />
        {process.env.NEXT_PUBLIC_HIMETRICA_API_KEY && (
          <>
            <Script
              src="https://cdn.himetrica.com/tracker.js"
              data-api-key={process.env.NEXT_PUBLIC_HIMETRICA_API_KEY}
              strategy="afterInteractive"
            />
            <Script
              src="https://cdn.himetrica.com/vitals.js"
              data-api-key={process.env.NEXT_PUBLIC_HIMETRICA_API_KEY}
              strategy="afterInteractive"
            />
            <Script
              src="https://cdn.himetrica.com/errors.js"
              data-api-key={process.env.NEXT_PUBLIC_HIMETRICA_API_KEY}
              strategy="afterInteractive"
            />
          </>
        )}
      </body>
    </html>
  );
}
