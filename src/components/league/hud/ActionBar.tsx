"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { HUD_BOX } from "./shared";

const BTN = "btn-press px-3 py-2 text-[10px] transition-colors sm:px-4";

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
          Invite
        </button>
      )}
      {verifyHref && (
        <Link href={verifyHref} className={`${BTN} text-lime hover:text-cream`}>
          Work here? Verify
        </Link>
      )}
      <button type="button" onClick={share} aria-live="polite" className={`${BTN} min-w-[76px] text-cream hover:text-lime`}>
        {shared ? "Copied" : "Share"}
      </button>
      {isAdmin && (
        <span className="relative flex">
          <button
            type="button"
            aria-disabled="true"
            aria-label={`Edit city. ${editLabel}`}
            title={editLabel}
            onClick={() => setEditHint((v) => !v)}
            onBlur={() => setEditHint(false)}
            className={`${BTN} cursor-not-allowed text-dim`}
          >
            ✎
          </button>
          {editHint && (
            <span className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap border-2 border-border bg-bg px-2 py-1 text-[9px] text-muted">
              {editLabel}
            </span>
          )}
        </span>
      )}
      {isAdmin && (
        <Link href={`/league/${slug}/settings`} aria-label="League settings" title="Settings" className={`${BTN} text-cream hover:text-lime`}>
          ⚙
        </Link>
      )}
    </div>
  );
}
