"use client";

import { useEffect } from "react";
import { trackSponsorshipPageView, trackSponsorshipCtaClick } from "@/lib/himetrica";

export function SponsorshipPageTracker() {
  useEffect(() => {
    trackSponsorshipPageView();
  }, []);
  return null;
}

export function SponsorshipCtaLink({
  href,
  className,
  style,
  cta,
  children,
}: {
  href: string;
  className?: string;
  style?: React.CSSProperties;
  cta?: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className={className}
      style={style}
      onClick={() => trackSponsorshipCtaClick(cta)}
    >
      {children}
    </a>
  );
}
