"use client";

import { useState } from "react";

interface Props {
  login: string;
  accent: string;
}

export default function ReferralCTA({ login, accent }: Props) {
  const [copied, setCopied] = useState(false);

  const referralUrl =
    typeof window !== "undefined" ? `${window.location.origin}/?ref=${login}` : `/?ref=${login}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(referralUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border-[3px] border-border bg-bg-card p-4 sm:p-5">
      <p className="text-sm text-cream">Invite a dev to the city</p>
      <p className="mt-1 text-[10px] text-muted normal-case">
        Share your link — when they join, you get credit
      </p>
      <div className="mt-3 flex gap-2">
        <input
          type="text"
          readOnly
          value={referralUrl}
          className="min-w-0 flex-1 border-[3px] border-border bg-bg px-3 py-2.5 text-[10px] text-muted"
          onClick={(e) => (e.target as HTMLInputElement).select()}
        />
        <button
          onClick={handleCopy}
          className="btn-press shrink-0 border-[3px] px-4 py-2.5 text-[10px] transition-colors"
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
