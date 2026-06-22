"use client";

import { useCallback, useState } from "react";
import type { PixModalData } from "./PixModal";

export type PayMethod = "card" | "pix" | "gitc";

export interface PixelPackage {
  id: string;
  name: string;
  pixels: number;
  bonus_pixels: number;
  price_usd_cents: number;
  price_brl_cents: number | null;
  sort_order: number;
}

interface UsePixelCheckoutOptions {
  packages: PixelPackage[];
  isAuthenticated: boolean;
  /** Called after a balance-changing event (PIX/GitC confirmed) to refresh UI. */
  onPurchased?: () => void;
}

/**
 * Shared pixel-purchase logic (Stripe redirect, PIX QR generation, GitC
 * on-chain quote/confirm) used by both the /pixels store and the in-city Bank
 * panel. Holds the transient buying/error/PIX-modal state and exposes the
 * handlers; rendering is left to the caller so each surface keeps its own UI.
 */
export function usePixelCheckout({
  packages,
  isAuthenticated,
  onPurchased,
}: UsePixelCheckoutOptions) {
  const [buying, setBuying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pixModal, setPixModal] = useState<PixModalData | null>(null);

  const handleStripeBuy = useCallback(
    async (pkgId: string) => {
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
    },
    [buying, isAuthenticated],
  );

  const handlePixBuy = useCallback(
    async (pkgId: string) => {
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
        }
      } catch {
        setError("Network error. Please try again.");
      } finally {
        setBuying(null);
      }
    },
    [buying, isAuthenticated, packages],
  );

  const handlePixClose = useCallback(
    (purchased: boolean) => {
      setPixModal(null);
      if (purchased) onPurchased?.();
    },
    [onPurchased],
  );

  /**
   * Build the GitcPayButton callbacks for a package. `redirectUrl` is where the
   * button navigates after success — the /pixels store uses a success-banner
   * URL; the in-city panel passes its own `onConfirmed` and an `onDone` (no
   * redirect) so the player never leaves the city.
   */
  const buildGitcCallbacks = useCallback(
    (
      pkg: PixelPackage,
      opts: { redirectUrl: string; onConfirmed?: () => void },
    ) => ({
      onRequestQuote: async (wallet: `0x${string}`) => {
        const res = await fetch("/api/pixels/checkout/gitc-quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ package_id: pkg.id, wallet }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Could not get a quote");
        return {
          quoteId: data.quoteId,
          gitcAmountWei: data.gitcAmountWei,
          usdAmountCents: data.usdQuoteCents,
          redirectUrl: opts.redirectUrl,
        };
      },
      onConfirm: async ({ quoteId, txHash }: { quoteId: string; txHash: `0x${string}` }) => {
        const res = await fetch("/api/pixels/checkout/gitc-confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quoteId, txHash }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          setError(null);
          opts.onConfirmed?.();
        }
        return { ok: res.ok, error: data.error };
      },
    }),
    [],
  );

  return {
    buying,
    error,
    setError,
    pixModal,
    setPixModal,
    handleStripeBuy,
    handlePixBuy,
    handlePixClose,
    buildGitcCallbacks,
  };
}
