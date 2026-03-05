"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

const ACCENT = "#c8e64a";

function SuccessBannerInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get("success");

  if (!token) return null;

  return (
    <div className="mt-6 border-[3px] p-5 text-center" style={{ borderColor: ACCENT }}>
      <p className="text-sm text-cream">
        Payment <span style={{ color: ACCENT }}>confirmed!</span>
      </p>
      <p className="mt-2 text-[10px] text-muted normal-case">
        Your ad is now live and flying over the city. Track impressions and clicks anytime:
      </p>
      <Link
        href={`/advertise/track/${token}`}
        className="btn-press mt-3 inline-block px-5 py-2.5 text-xs text-bg"
        style={{
          backgroundColor: ACCENT,
          boxShadow: "4px 4px 0 0 #5a7a00",
        }}
      >
        View Tracking Dashboard
      </Link>
    </div>
  );
}

export function SuccessBanner() {
  return (
    <Suspense fallback={null}>
      <SuccessBannerInner />
    </Suspense>
  );
}
