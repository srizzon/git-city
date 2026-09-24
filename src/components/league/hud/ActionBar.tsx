"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Car, Check, Pencil, Settings, Share2, ShieldCheck, UserPlus } from "lucide-react";
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
  onEdit,
  onDrive,
}: {
  slug: string;
  canInvite: boolean;
  isAdmin: boolean;
  verifyHref: string | null;
  onInvite: () => void;
  onEdit?: () => void;
  onDrive?: () => void;
}) {
  const [shared, setShared] = useState(false);
  const [coarse, setCoarse] = useState(false);
  const [editHint, setEditHint] = useState(false);
  const [driveHint, setDriveHint] = useState(false);
  // The editor and driving need a mouse (or pad) and room for their HUD.
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: fine) and (min-width: 1024px)");
    const on = () => setDesktop(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

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
  useEffect(() => {
    if (!driveHint) return;
    const t = setTimeout(() => setDriveHint(false), 2200);
    return () => clearTimeout(t);
  }, [driveHint]);

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

  const editLabel = "Edit on a computer";
  const canEdit = desktop && !!onEdit;
  const driveLabel = "Drive on a computer";

  return (
    <div className={`${HUD_BOX} flex items-stretch divide-x-2 divide-border`}>
      {onDrive && desktop && (
        <button type="button" onClick={onDrive} title="Drive through the city" className={`${BTN} text-lime hover:text-cream`}>
          <Car {...ICON} aria-hidden />
          <span>Drive</span>
        </button>
      )}
      {onDrive && !desktop && (
        <span className="relative flex">
          <button
            type="button"
            aria-disabled="true"
            aria-label={`Drive. ${driveLabel}`}
            onClick={() => setDriveHint(true)}
            onMouseEnter={() => !coarse && setDriveHint(true)}
            onMouseLeave={() => !coarse && setDriveHint(false)}
            className={`${ICON_BTN} cursor-not-allowed text-dim hover:bg-transparent`}
          >
            <Car {...ICON} aria-hidden />
          </button>
          {driveHint && (
            <span
              role="status"
              className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 animate-[fade-in_0.15s_ease-out] whitespace-nowrap border-2 border-border bg-bg px-2 py-1 text-[9px] text-muted"
            >
              {driveLabel}
            </span>
          )}
        </span>
      )}
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
      {isAdmin && canEdit && (
        <button type="button" onClick={onEdit} title="Edit the city" className={`${BTN} text-cream hover:text-lime`}>
          <Pencil {...ICON} aria-hidden />
          <span>Edit</span>
        </button>
      )}
      {isAdmin && !canEdit && (
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
