"use client";

import { Web3Provider } from "@/components/Web3Provider";
import { GitcPayButton } from "@/components/GitcPayButton";
import CurrencyIcon from "@/components/CurrencyIcon";
import { GITC_ADDRESS } from "@/lib/gitc";
import { type PixelPackage, type usePixelCheckout } from "@/components/pixels/usePixelCheckout";

interface Props {
  pkg: PixelPackage;
  buying: string | null;
  buildGitcCallbacks: ReturnType<typeof usePixelCheckout>["buildGitcCallbacks"];
  onConfirmed: () => void;
  onError: (msg: string) => void;
  /** Jump to the Exchange screen to acquire GITC first. */
  onNeedGitc: () => void;
}

/**
 * "Pay with GITC" payment method for the Add Pixels screen. Mounts its own
 * (lazy-loaded) Web3Provider so the wallet bundle only loads when a player
 * actually chooses to pay with crypto — card/PIX buyers never pay that cost.
 */
export default function GitcPayPanel({ pkg, buying, buildGitcCallbacks, onConfirmed, onError, onNeedGitc }: Props) {
  return (
    <Web3Provider>
      <GitcPayButton
        disabled={!!buying}
        onError={onError}
        onDone={onConfirmed}
        {...buildGitcCallbacks(pkg, { redirectUrl: "/", onConfirmed })}
      />
      <div className="mt-2 flex items-center justify-between text-[9px] text-dim">
        <span className="flex items-center gap-1">
          <CurrencyIcon currency="gitc" size={10} /> GITC on Base · {GITC_ADDRESS.slice(0, 6)}…{GITC_ADDRESS.slice(-4)}
        </span>
        <button type="button" onClick={onNeedGitc} className="text-muted underline normal-case hover:text-cream cursor-pointer">
          Need GITC? Exchange →
        </button>
      </div>
    </Web3Provider>
  );
}
