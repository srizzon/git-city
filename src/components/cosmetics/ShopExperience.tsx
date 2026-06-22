"use client";

import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import CurrencyIcon from "@/components/CurrencyIcon";
import StoreClient from "./StoreClient";
import type { ViewerContext } from "@/lib/cosmetics/viewer";
import type { Cosmetic, CosmeticSet } from "@/lib/cosmetics/types";

// The wallet/bank is the same panel used across the app — reuse it here so the
// PX pill opens it in place (top up without leaving the shop), and the balance
// stays live so a top-up immediately unlocks buying.
const BankPanel = dynamic(() => import("@/components/BankPanel"), { ssr: false });

const ACCENT = "#c8e64a";

export default function ShopExperience({
  viewer,
  initialItems,
  initialCursor,
  sets,
  ownedLookCosmetics,
  serverCountry,
}: {
  viewer: ViewerContext | null;
  initialItems: Cosmetic[];
  initialCursor: string | null;
  sets: CosmeticSet[];
  ownedLookCosmetics: Cosmetic[];
  serverCountry: string | null;
}) {
  const [balance, setBalance] = useState(viewer?.pxBalance ?? 0);
  const [bankOpen, setBankOpen] = useState(false);

  const liveViewer = viewer ? { ...viewer, pxBalance: balance } : null;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/" className="mb-2 inline-block text-sm text-muted transition-colors hover:text-cream">&larr; Back to City</Link>
          <h1 className="text-lg text-cream">Shop</h1>
          <p className="mt-0.5 text-[10px] text-muted normal-case">Preview anything live before you buy.</p>
        </div>
        <div className="flex items-center gap-2">
          {viewer && (
            <button
              onClick={() => setBankOpen(true)}
              title="Your Pixels balance — tap to add more"
              className="flex shrink-0 items-center gap-1.5 whitespace-nowrap border-2 border-border bg-bg-raised py-1.5 pl-3 pr-1.5 text-xs text-cream transition-colors hover:border-cream/40"
            >
              <CurrencyIcon currency="pixels" size={15} />
              <span>{balance.toLocaleString()}</span>
              <span className="text-[9px] uppercase tracking-wide text-muted">PX</span>
              <span className="ml-1 flex h-5 w-5 items-center justify-center border border-lime/50 text-[13px] leading-none text-lime">+</span>
            </button>
          )}
          {viewer ? (
            <Link href={`/shop/${viewer.githubLogin}/customize`} className="btn-press px-4 py-2 text-xs text-bg" style={{ backgroundColor: ACCENT, boxShadow: "3px 3px 0 0 #5a7a00" }}>
              Customize
            </Link>
          ) : (
            <Link href="/api/auth/github?redirect=/shop" className="btn-press px-4 py-2 text-xs text-bg" style={{ backgroundColor: ACCENT, boxShadow: "3px 3px 0 0 #5a7a00" }}>
              Sign in with GitHub
            </Link>
          )}
        </div>
      </div>

      <StoreClient
        viewer={liveViewer}
        initialItems={initialItems}
        initialCursor={initialCursor}
        sets={sets}
        ownedLookCosmetics={ownedLookCosmetics}
        onBalanceDelta={(d) => setBalance((b) => b + d)}
        onTopUp={() => setBankOpen(true)}
      />

      {viewer && bankOpen && (
        <BankPanel
          open
          onClose={() => setBankOpen(false)}
          isAuthenticated
          githubLogin={viewer.githubLogin}
          initialBalance={balance}
          onBalanceChange={setBalance}
          serverCountry={serverCountry}
        />
      )}
    </>
  );
}
