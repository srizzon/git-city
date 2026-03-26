import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "E.Arcade - Git City",
  description: "The city's office. A shared space for developers.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function ArcadeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
