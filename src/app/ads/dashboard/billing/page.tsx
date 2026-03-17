"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const ACCENT = "#c8e64a";

interface AdSummary {
  id: string;
  brand: string | null;
  text: string;
  vehicle: string;
  active: boolean;
  plan_id: string | null;
  ends_at: string | null;
}

export default function BillingPage() {
  const [ads, setAds] = useState<AdSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    fetch("/api/ads/stats?period=all")
      .then((r) => r.json())
      .then((d) => {
        setAds(d.ads ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function openStripePortal() {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/ads/billing/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setPortalLoading(false);
    }
  }

  const activeAds = ads.filter((a) => a.active);
  const inactiveAds = ads.filter((a) => !a.active);

  function formatDate(d: string | null) {
    if (!d) return "-";
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  return (
    <div>
      <Link href="/ads/dashboard" className="text-sm text-muted transition-colors hover:text-cream">&larr; Dashboard</Link>
      <h1 className="mt-4 text-xl text-cream">Billing</h1>

      {loading ? (
        <p className="mt-6 text-sm text-muted">Loading...</p>
      ) : (
        <>
          {/* Active plans */}
          <div className="mt-5">
            <h2 className="mb-3 text-base text-cream">Active Plans ({activeAds.length})</h2>
            {activeAds.length === 0 ? (
              <p className="text-sm text-muted normal-case">No active plans.</p>
            ) : (
              <div className="space-y-2">
                {activeAds.map((ad) => (
                  <div key={ad.id} className="flex items-center justify-between border-[3px] border-border p-4">
                    <div>
                      <p className="text-sm text-cream">{ad.brand || ad.text.slice(0, 30)}</p>
                      <p className="mt-0.5 text-xs text-muted normal-case">
                        {ad.vehicle.replace("_", " ")} &middot; {ad.plan_id?.replace("_", " ") ?? "custom"}
                      </p>
                    </div>
                    <div className="text-right">
                      {ad.ends_at && (
                        <p className="text-xs text-muted normal-case">
                          Renews {formatDate(ad.ends_at)}
                        </p>
                      )}
                      <span className="text-xs" style={{ color: ACCENT }}>active</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Manage subscription */}
          <div className="mt-6 border-[3px] border-border p-5">
            <h2 className="text-base text-cream">Manage Subscription</h2>
            <p className="mt-2 text-sm text-muted normal-case">
              Update payment methods, cancel subscriptions, or view invoices on Stripe.
            </p>
            <button
              type="button"
              onClick={openStripePortal}
              disabled={portalLoading}
              className="btn-press mt-4 px-6 py-2.5 text-sm text-bg transition-opacity disabled:opacity-50"
              style={{ backgroundColor: ACCENT, boxShadow: "3px 3px 0 0 #5a7a00" }}
            >
              {portalLoading ? "Opening..." : "Open Stripe Portal"}
            </button>
            <p className="mt-4 text-sm text-muted normal-case">
              Need help?{" "}
              <a href="mailto:samuelrizzondev@gmail.com" className="transition-colors hover:text-cream" style={{ color: ACCENT }}>
                samuelrizzondev@gmail.com
              </a>
            </p>
          </div>

          {/* Past campaigns */}
          {inactiveAds.length > 0 && (
            <div className="mt-5">
              <h2 className="mb-3 text-base text-muted">Past Campaigns ({inactiveAds.length})</h2>
              <div className="space-y-1">
                {inactiveAds.map((ad) => (
                  <div key={ad.id} className="flex items-center justify-between border-[2px] border-border px-4 py-3 opacity-60">
                    <p className="text-xs text-muted normal-case">{ad.brand || ad.text.slice(0, 30)}</p>
                    <p className="text-xs text-muted normal-case">ended {formatDate(ad.ends_at)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
