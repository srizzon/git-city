"use client";

import { useEffect } from "react";
import { trackAdvertisePageView, trackAdvertiseCtaClick } from "@/lib/himetrica";

export function AdvertisePageTracker() {
  useEffect(() => {
    trackAdvertisePageView();
  }, []);
  return null;
}

export function AdvertiseCtaLink({
  href,
  className,
  style,
  children,
}: {
  href: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className={className}
      style={style}
      onClick={() => trackAdvertiseCtaClick()}
    >
      {children}
    </a>
  );
}
