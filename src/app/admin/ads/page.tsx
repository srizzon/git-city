"use client";

import { Suspense } from "react";
import { AdsDashboard } from "./_components/ads-dashboard";

function DashboardFallback() {
  return (
    <div className="min-h-screen bg-bg p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <div className="h-8 w-24 animate-pulse rounded bg-border" />
          <div className="mt-2 h-4 w-48 animate-pulse rounded bg-border" />
        </div>
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="border border-border bg-bg-raised p-4">
              <div className="h-3 w-20 animate-pulse rounded bg-border" />
              <div className="mt-2 h-7 w-16 animate-pulse rounded bg-border" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AdminAdsPage() {
  return (
    <Suspense fallback={<DashboardFallback />}>
      <AdsDashboard />
    </Suspense>
  );
}
