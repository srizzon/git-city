"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { GitcPayButton } from "@/components/GitcPayButton";
import { PaymentMethodTabs, type PaymentMethodOption } from "@/components/PaymentMethodTabs";
import { isGitcEnabled } from "@/lib/gitc";
import { isBrazilClient } from "@/lib/geo";

type PayMethod = "card" | "pix" | "gitc";

interface PixelPackage {
  id: string;
  name: string;
  pixels: number;
  bonus_pixels: number;
  price_usd_cents: number;
  price_brl_cents: number | null;
  sort_order: number;
}

interface PixModalData {
  brCode: string;
  brCodeBase64: string;
  pixId: string;
  packageName: string;
  totalPx: number;
}

interface Props {
  packages: PixelPackage[];
  balance: number;
  isAuthenticated: boolean;
  githubLogin: string;
  serverCountry?: string | null;
}

const BADGES: Record<string, { label: string; color: string }> = {
  popular: { label: "Most Popular", color: "#c8e64a" },
  mega: { label: "Best Value", color: "#f7931a" },
};

const PIX_EXPIRY_SECONDS = 900; // 15 min

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ─── PIX Modal ───────────────────────────────────────────────
function PixModal({
  data,
  onClose,
}: {
  data: PixModalData;
  onClose: (purchased: boolean) => void;
}) {
  const [countdown, setCountdown] = useState(PIX_EXPIRY_SECONDS);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<"polling" | "completed" | "expired">("polling");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          setStatus("expired");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  useEffect(() => {
    if (status !== "polling") return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/pixels/purchase-status?pix_id=${data.pixId}`);
        if (!res.ok) return;
        const json = await res.json();
        if (json.status === "completed") setStatus("completed");
      } catch { /* ignore */ }
    }, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [status, data.pixId]);

  useEffect(() => {
    if (status === "completed" || status === "expired") {
      if (pollRef.current) clearInterval(pollRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [status]);

  const copyCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(data.brCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* fallback */ }
  }, [data.brCode]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="relative mx-4 w-full max-w-sm border-[3px] border-border bg-bg p-6 font-pixel uppercase">
        <button
          onClick={() => onClose(false)}
          className="absolute right-3 top-3 text-sm text-muted hover:text-cream cursor-pointer"
        >
          &#10005;
        </button>

        <h3 className="mb-1 text-sm text-lime">PIX Payment</h3>
        <p className="mb-4 text-xs text-muted normal-case">
          {data.totalPx.toLocaleString()} PX — {data.packageName}
        </p>

        {status === "completed" ? (
          <div className="py-6 text-center">
            <p className="mb-2 text-base text-lime">Payment confirmed!</p>
            <p className="text-sm text-muted normal-case mb-4">
              {data.totalPx.toLocaleString()} PX added to your balance.
            </p>
            <button
              onClick={() => onClose(true)}
              className="btn-press px-6 py-2 text-sm text-bg"
              style={{ backgroundColor: "#c8e64a", boxShadow: "2px 2px 0 0 #5a7a00" }}
            >
              Done
            </button>
          </div>
        ) : status === "expired" ? (
          <div className="py-6 text-center">
            <p className="mb-2 text-sm text-red-400">QR code expired</p>
            <p className="text-xs text-muted normal-case mb-3">
              Close and try again to generate a new code.
            </p>
            <button
              onClick={() => onClose(false)}
              className="border-2 border-border px-4 py-2 text-xs text-cream hover:border-border-light cursor-pointer"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <div className="mb-4 flex justify-center">
              {data.brCodeBase64 ? (
                <img
                  src={data.brCodeBase64}
                  alt="PIX QR Code"
                  className="h-48 w-48"
                  style={{ imageRendering: "pixelated" }}
                />
              ) : (
                <div className="flex h-48 w-48 items-center justify-center border-2 border-border text-xs text-muted">
                  QR code unavailable
                </div>
              )}
            </div>

            <div className="mb-4">
              <p className="mb-1 text-[10px] text-muted">PIX code (copy &amp; paste):</p>
              <div className="flex items-stretch gap-1">
                <div className="flex-1 overflow-hidden border-2 border-border bg-bg-card px-2 py-1.5">
                  <p className="truncate text-[10px] text-cream normal-case">
                    {data.brCode}
                  </p>
                </div>
                <button
                  onClick={copyCode}
                  className="shrink-0 border-2 px-3 text-xs transition-colors cursor-pointer"
                  style={{
                    borderColor: copied ? "#c8e64a" : "var(--color-border)",
                    color: copied ? "#c8e64a" : "var(--color-cream)",
                  }}
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-xs text-muted normal-case">
                Expires in{" "}
                <span style={{ color: countdown < 60 ? "#ef4444" : "#c8e64a" }}>
                  {formatCountdown(countdown)}
                </span>
              </p>
              <p className="text-xs text-muted normal-case animate-pulse">
                Checking payment...
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main Store Client ───────────────────────────────────────
export default function PixelsStoreClient({
  packages,
  balance,
  isAuthenticated,
  githubLogin,
  serverCountry,
}: Props) {
  const [buying, setBuying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pixModal, setPixModal] = useState<PixModalData | null>(null);
  const [successPkg, setSuccessPkg] = useState<string | null>(null);
  const [, setCurrentBalance] = useState(balance);
  const [checkoutPkgId, setCheckoutPkgId] = useState<string | null>(null);
  const [payMethod, setPayMethod] = useState<PayMethod>("card");
  const [isBR, setIsBR] = useState(false);

  // BR detection: server header (Vercel) → timezone → language fallback.
  useEffect(() => {
    if (isBrazilClient(serverCountry)) {
      setIsBR(true);
      setPayMethod("pix");
    }
  }, [serverCountry]);

  // Check for Stripe success redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const purchased = params.get("pixels_purchased");
    if (purchased) {
      setSuccessPkg(purchased);
      window.history.replaceState({}, "", "/pixels");
      fetch("/api/pixels/balance")
        .then((r) => r.json())
        .then((d) => setCurrentBalance(d.balance ?? 0))
        .catch(() => {});
    }
  }, []);

  const handleStripeBuy = async (pkgId: string) => {
    if (buying || !isAuthenticated) return;
    setBuying(pkgId);
    setError(null);
    try {
      const res = await fetch("/api/pixels/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ package_id: pkgId, provider: "stripe" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Checkout failed. Try again.");
        setBuying(null);
        return;
      }
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setError("Network error. Please try again.");
      setBuying(null);
    }
  };

  const handlePixBuy = async (pkgId: string) => {
    if (buying || !isAuthenticated) return;
    setBuying(pkgId);
    setError(null);
    try {
      const res = await fetch("/api/pixels/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ package_id: pkgId, provider: "abacatepay" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Checkout failed. Try again.");
        setBuying(null);
        return;
      }
      if (data.brCode) {
        const pkg = packages.find((p) => p.id === pkgId);
        const totalPx = pkg ? pkg.pixels + pkg.bonus_pixels : 0;
        setPixModal({
          brCode: data.brCode,
          brCodeBase64: data.brCodeBase64,
          pixId: data.pixId,
          packageName: pkg?.name ?? pkgId,
          totalPx,
        });
        setCheckoutPkgId(null);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBuying(null);
    }
  };

  const handlePixClose = (purchased: boolean) => {
    setPixModal(null);
    if (purchased) {
      fetch("/api/pixels/balance")
        .then((r) => r.json())
        .then((d) => setCurrentBalance(d.balance ?? 0))
        .catch(() => {});
    }
  };

  const gitcEnabled = isGitcEnabled();
  const highlightId = "popular";
  const checkoutPkg = checkoutPkgId ? packages.find((p) => p.id === checkoutPkgId) : null;

  return (
    <div>
      {/* PIX Modal */}
      {pixModal && <PixModal data={pixModal} onClose={handlePixClose} />}

      {/* Success banner (post-Stripe redirect) */}
      {successPkg && (
        <div className="mb-6 border-[3px] border-lime/40 bg-lime/10 p-4 text-center">
          <p className="text-base text-lime font-bold mb-1">Purchase confirmed!</p>
          <p className="text-sm text-muted normal-case">
            Your Pixels have been added to your balance.
          </p>
        </div>
      )}

      {/* Not authenticated */}
      {!isAuthenticated && (
        <div className="mb-6 border-[3px] border-border bg-bg-raised p-6 text-center">
          <p className="text-base text-cream mb-2">Sign in to buy Pixels</p>
          <p className="text-sm text-muted normal-case mb-4">
            You need a claimed building in Git City to purchase Pixels.
          </p>
          <Link
            href="/"
            className="btn-press inline-block px-6 py-2.5 text-sm text-bg"
            style={{ backgroundColor: "#c8e64a", boxShadow: "2px 2px 0 0 #5a7a00" }}
          >
            Go to City & Sign In
          </Link>
        </div>
      )}

      {error && (
        <div className="mb-4 border-2 border-red-500/40 bg-red-500/10 p-3 text-center">
          <p className="text-sm text-red-400 normal-case">{error}</p>
        </div>
      )}

      {/* Package grid — 1 col mobile, 2 col desktop */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {packages.map((pkg) => {
          const total = pkg.pixels + pkg.bonus_pixels;
          const isHighlight = pkg.id === highlightId;
          const badge = BADGES[pkg.id];
          const isBuying = buying === pkg.id;
          const bonusPercent =
            pkg.bonus_pixels > 0
              ? Math.round((pkg.bonus_pixels / pkg.pixels) * 100)
              : 0;

          return (
            <div
              key={pkg.id}
              className={[
                "relative border-[3px] p-6 sm:p-8 transition-all",
                isHighlight
                  ? "border-lime bg-lime/5"
                  : "border-border bg-bg-raised hover:border-border-light",
              ].join(" ")}
            >
              {/* Badge */}
              {badge && (
                <div
                  className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 text-xs font-bold text-bg whitespace-nowrap"
                  style={{ backgroundColor: badge.color }}
                >
                  {badge.label}
                </div>
              )}

              {/* Top row: name + price */}
              <div className="flex items-center justify-between mb-6 mt-1">
                <p className="text-base text-muted">{pkg.name}</p>
                <p className="text-base text-cream font-bold">
                  ${(pkg.price_usd_cents / 100).toFixed(2)}
                </p>
              </div>

              {/* Center: big PX number */}
              <div className="text-center mb-6">
                <p className="text-5xl sm:text-6xl text-cream font-bold leading-none">
                  {total.toLocaleString()}
                </p>
                <p className="text-lg text-lime/60 mt-2">PX</p>
              </div>

              {/* Bonus (or empty space to keep alignment) */}
              <div className="text-center mb-6 min-h-[30px] flex items-center justify-center">
                {pkg.bonus_pixels > 0 && (
                  <span
                    className="inline-block px-4 py-1.5 text-sm font-bold text-bg"
                    style={{ backgroundColor: "#39d353" }}
                  >
                    +{pkg.bonus_pixels} BONUS ({bonusPercent}%)
                  </span>
                )}
              </div>

              {/* Buy button — opens checkout modal */}
              <button
                onClick={() => {
                  setError(null);
                  setCheckoutPkgId(pkg.id);
                }}
                disabled={!!buying || !isAuthenticated}
                className="btn-press w-full py-3.5 text-sm font-bold text-bg disabled:opacity-40 transition-all cursor-pointer"
                style={{
                  backgroundColor: "#c8e64a",
                  boxShadow: "2px 2px 0 0 #5a7a00",
                }}
              >
                {isBuying ? "Processing..." : "Buy"}
              </button>
            </div>
          );
        })}
      </div>

      {/* ── Checkout Modal ── */}
      {checkoutPkg && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !buying) setCheckoutPkgId(null);
          }}
        >
          <div className="w-full max-w-sm border-[3px] border-border bg-bg p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-base text-cream sm:text-lg">
                {checkoutPkg.name}{" "}
                <span className="text-sm text-muted">
                  · {(checkoutPkg.pixels + checkoutPkg.bonus_pixels).toLocaleString()} PX
                </span>
              </h3>
              <button
                onClick={() => !buying && setCheckoutPkgId(null)}
                className="text-sm text-muted transition-colors hover:text-cream cursor-pointer"
              >
                &times;
              </button>
            </div>

            <p className="mt-2 text-[10px] text-dim normal-case">
              ${(checkoutPkg.price_usd_cents / 100).toFixed(2)}
              {checkoutPkg.price_brl_cents && (
                <> · R${(checkoutPkg.price_brl_cents / 100).toFixed(2)} via PIX</>
              )}
            </p>

            {error && (
              <div className="mt-3 border-2 border-red-500/40 bg-red-500/10 p-2 text-center">
                <p className="text-[10px] text-red-400 normal-case">{error}</p>
              </div>
            )}

            <div className="mt-4">
              {(() => {
                const methods: PaymentMethodOption<PayMethod>[] = [
                  { id: "card", label: "Card" },
                  { id: "pix", label: "PIX", visible: isBR && !!checkoutPkg.price_brl_cents },
                  { id: "gitc", label: "GITC", visible: gitcEnabled },
                ];
                const visibleIds = methods.filter((m) => m.visible !== false).map((m) => m.id);
                const safeSelected = visibleIds.includes(payMethod) ? payMethod : visibleIds[0];

                return (
                  <PaymentMethodTabs<PayMethod>
                    methods={methods}
                    selected={safeSelected}
                    onChange={setPayMethod}
                  >
                    {safeSelected === "card" && (
                      <button
                        onClick={() => handleStripeBuy(checkoutPkg.id)}
                        disabled={!!buying || !isAuthenticated}
                        className="btn-press w-full py-3 text-sm text-bg disabled:opacity-40 transition-all cursor-pointer"
                        style={{
                          backgroundColor: "#c8e64a",
                          boxShadow: "2px 2px 0 0 #5a7a00",
                        }}
                      >
                        {buying === checkoutPkg.id
                          ? "Redirecting..."
                          : `Pay $${(checkoutPkg.price_usd_cents / 100).toFixed(2)} with card`}
                      </button>
                    )}

                    {safeSelected === "pix" && checkoutPkg.price_brl_cents && (
                      <button
                        onClick={() => handlePixBuy(checkoutPkg.id)}
                        disabled={!!buying || !isAuthenticated}
                        className="btn-press w-full py-3 text-sm transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
                        style={{
                          backgroundColor: "transparent",
                          border: "2px solid #c8e64a",
                          color: "#c8e64a",
                          boxShadow: "2px 2px 0 0 #5a7a00",
                        }}
                      >
                        {buying === checkoutPkg.id
                          ? "Generating PIX..."
                          : `Pay R$${(checkoutPkg.price_brl_cents / 100).toFixed(2)} with PIX`}
                      </button>
                    )}

                    {safeSelected === "gitc" && (
                      <GitcPayButton
                        disabled={!!buying}
                        onError={(msg) => setError(msg)}
                        onRequestQuote={async (wallet) => {
                          const res = await fetch("/api/pixels/checkout/gitc-quote", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ package_id: checkoutPkg.id, wallet }),
                          });
                          const data = await res.json().catch(() => ({}));
                          if (!res.ok) throw new Error(data.error || "Could not get a quote");
                          return {
                            quoteId: data.quoteId,
                            gitcAmountWei: data.gitcAmountWei,
                            redirectUrl: `/pixels?pixels_purchased=${encodeURIComponent(checkoutPkg.id)}`,
                          };
                        }}
                        onConfirm={async ({ quoteId, txHash }) => {
                          const res = await fetch("/api/pixels/checkout/gitc-confirm", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ quoteId, txHash }),
                          });
                          const data = await res.json().catch(() => ({}));
                          return { ok: res.ok, error: data.error };
                        }}
                      />
                    )}
                  </PaymentMethodTabs>
                );
              })()}
            </div>

            <p className="mt-3 text-center text-[9px] text-muted normal-case">
              {payMethod === "card" && "One-time payment via Stripe."}
              {payMethod === "pix" && "Brazilian PIX via AbacatePay."}
              {payMethod === "gitc" && "GITC sent on Base."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
