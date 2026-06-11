"use client";

import { useEffect, useState } from "react";
import CurrencyIcon from "@/components/CurrencyIcon";

interface Props {
  login: string;
  accent: string;
}

/** Must match the "referral" earn rule (105_referral_pixels_rule.sql). */
const REFERRAL_PX = 25;

export default function ReferralCTA({ login, accent }: Props) {
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");

  // Set after mount — keeps SSR and first client render identical
  useEffect(() => setOrigin(window.location.origin), []);
  const referralUrl = `${origin}/?ref=${login}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(referralUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex h-full flex-col border-[3px] border-border bg-bg-raised p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm text-cream">Invite a Dev</h2>
        <span className="inline-flex shrink-0 items-center gap-1.5 border-2 border-lime/50 bg-lime/10 px-2 py-1 text-[10px] text-lime">
          <CurrencyIcon currency="pixels" size={14} />
          +{REFERRAL_PX} PX
        </span>
      </div>
      <p className="mt-1.5 text-[10px] leading-relaxed text-dim normal-case">
        Share your link — you earn{" "}
        <span className="text-lime">{REFERRAL_PX} pixels</span> for every dev
        who joins the city through it.
      </p>
      <div className="mt-auto flex gap-2 pt-4">
        <input
          type="text"
          readOnly
          value={referralUrl}
          className="min-w-0 flex-1 border-[3px] border-border bg-bg px-3 py-2.5 text-[10px] text-muted normal-case focus:border-border-light focus:outline-none"
          onClick={(e) => (e.target as HTMLInputElement).select()}
        />
        <button
          onClick={handleCopy}
          className="btn-press shrink-0 border-[3px] border-border px-4 py-2.5 text-[10px] text-cream transition-colors hover:border-border-light"
          style={{
            borderColor: copied ? accent : undefined,
            color: copied ? accent : undefined,
          }}
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
}
