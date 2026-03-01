"use client";

import { useState } from "react";

interface Props {
  login: string;
  accent: string;
}

export default function ReferralCTA({ login, accent }: Props) {
  const [copied, setCopied] = useState(false);

  const referralUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/?ref=${login}`
      : `/?ref=${login}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(referralUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border-[3px] border-border bg-bg-card p-4 sm:p-5 whitespace-pre-line">
      <p className="text-sm text-cream">Invite a dev to the city \n 邀请一个开发者加入城市</p>
      <p className="mt-1 text-[10px] text-muted normal-case whitespace-pre-line">
        Share your link — when they join, you get credit \n 分享您的链接 — 当他们加入时，您将获得积分
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
