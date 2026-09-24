"use client";

import { useState } from "react";
import { Check, Link2 } from "lucide-react";

// Copies this league's link, so teammates can come drive (and race for the
// crown) here. Blurs after the click so Space keeps drifting instead of
// pressing the button again.

export default function CopyLink({ className = "" }: { className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.blur();
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      aria-live="polite"
      className={`btn-press inline-flex items-center gap-1.5 border-2 px-2 py-1 text-[9px] uppercase transition-colors ${
        copied ? "border-lime text-lime" : "border-border text-cream hover:border-lime hover:text-lime"
      } ${className}`}
    >
      {copied ? <Check size={11} strokeWidth={3} aria-hidden /> : <Link2 size={11} strokeWidth={3} aria-hidden />}
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}
