"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Pencil, Settings, Share2, ShieldCheck, UserPlus } from "lucide-react";
import { HUD_BOX } from "./shared";

// Segments of one bar: hover tints in place (btn-press would shift a segment
// off its dividers); the press nudges only the content.
const SEG = "flex items-center transition-colors hover:bg-white/5 [&>*]:transition-transform active:[&>*]:translate-y-px";
const BTN = `${SEG} gap-2 px-3 py-2 text-[10px] sm:px-4`;
const ICON_BTN = `${SEG} w-10 justify-center py-2`;
const ICON = { size: 14, strokeWidth: 2.5 } as const;

export default function ActionBar({
  slug,
  canInvite,
  isAdmin,
  verifyHref,
  onInvite,
}: {
  slug: string;
  canInvite: boolean;
  isAdmin: boolean;
  verifyHref: string | null;
  onInvite: () => void;
}) {
  const [shared, setShared] = useState(false);
  const [coarse, setCoarse] = useState(false);
  const [editHint, setEditHint] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const on = () => setCoarse(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  useEffect(() => {
    if (!editHint) return;
    const t = setTimeout(() => setEditHint(false), 2200);
    return () => clearTimeout(t);
  }, [editHint]);

  async function share() {
    const url = `${window.location.origin}/league/${slug}`;
    if (coarse && navigator.share) {
      try {
        await navigator.share({ url });
        return;
      } catch {
        // cancelled: fall through to copy
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShared(true);
      setTimeout(() => setShared(false), 1800);
    } catch {
      setShared(false);
    }
  }

  const editLabel = coarse ? "Edit on a computer" : "Editor coming soon";

  return (
    <div className={`${HUD_BOX} flex items-stretch divide-x-2 divide-border`}>
      {canInvite && (
        <button type="button" onClick={onInvite} className={`${BTN} text-lime hover:text-cream`}>
          <UserPlus {...ICON} aria-hidden />
          <span>Invite</span>
        </button>
      )}
      {verifyHref && (
        <Link href={verifyHref} className={`${BTN} text-lime hover:text-cream`}>
          <ShieldCheck {...ICON} aria-hidden />
          <span>Work here? Verify</span>
        </Link>
      )}
      <button type="button" onClick={share} aria-live="polite" className={`${BTN} min-w-[92px] text-cream hover:text-lime`}>
        {shared ? <Check {...ICON} aria-hidden /> : <Share2 {...ICON} aria-hidden />}
        <span>{shared ? "Copied" : "Share"}</span>
      </button>
      {isAdmin && (
        <span className="relative flex">
          <button
            type="button"
            aria-disabled="true"
            aria-label={`Edit city. ${editLabel}`}
            onClick={() => setEditHint(true)}
            onMouseEnter={() => !coarse && setEditHint(true)}
            onMouseLeave={() => !coarse && setEditHint(false)}
            className={`${ICON_BTN} cursor-not-allowed text-dim hover:bg-transparent`}
          >
            <Pencil {...ICON} aria-hidden />
          </button>
          {editHint && (
            <span
              role="status"
              className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 animate-[fade-in_0.15s_ease-out] whitespace-nowrap border-2 border-border bg-bg px-2 py-1 text-[9px] text-muted"
            >
              {editLabel}
            </span>
          )}
        </span>
      )}
      {isAdmin && (
        <Link href={`/league/${slug}/settings`} aria-label="League settings" className={`${ICON_BTN} text-cream hover:text-lime`}>
          <Settings {...ICON} aria-hidden />
        </Link>
      )}
    </div>
  );
}
