"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Camera, Car, Check, Clock, Flag, LogIn, LogOut, Pencil, Play, Settings, Share2, ShieldCheck, UserPlus } from "lucide-react";
import { Pending } from "@/components/leagues/PixelSpinner";
import { HUD_BOX } from "./shared";

// Segments of one bar: hover tints in place (btn-press would shift a segment
// off its dividers); the press nudges only the content.
const SEG = "flex items-center transition-colors hover:bg-white/5 [&>*]:transition-transform active:[&>*]:translate-y-px";
const BTN = `${SEG} gap-2 px-3 py-2 text-[10px] sm:px-4`;
const ICON_BTN = `${SEG} w-10 justify-center py-2`;
// The lime call to action keeps its fill on hover (SEG's white tint would wash it out).
const PRIMARY_BTN =
  "flex items-center gap-2 bg-lime px-3 py-2 text-[10px] text-bg transition-[filter] hover:brightness-110 sm:px-4 [&>*]:transition-transform active:[&>*]:translate-y-px";
const ICON = { size: 14, strokeWidth: 2.5 } as const;
// The race track stays reachable by URL; the button is hidden for now.
const SHOW_RACE = false;

export default function ActionBar({
  slug,
  canInvite,
  isAdmin,
  verifyHref,
  onInvite,
  onEdit,
  onCover,
  onDrive,
  onRace,
  raceRecord = null,
  onLeave,
  join,
  requests = 0,
  onReplay,
  drivingNow = 0,
}: {
  slug: string;
  canInvite: boolean;
  isAdmin: boolean;
  verifyHref: string | null;
  onInvite: () => void;
  onEdit?: () => void;
  /** Admin: this view on screen becomes the town's Discover cover. Resolves to whether it saved. */
  onCover?: () => Promise<boolean>;
  onDrive?: () => void;
  /** The town's race track (with a screen over the load). */
  onRace?: () => void;
  /** "Record @x 0:22.912", for the tooltip. */
  raceRecord?: string | null;
  /** Leaves the league; resolves to an error message, or null when done. */
  onLeave?: () => Promise<string | null>;
  /** Non-members: join, ask to join, or the pending request. */
  join?: { kind: "join" | "ask" | "pending"; onClick: () => void };
  /** Admin: open join requests, shown on the settings icon. */
  requests?: number;
  /** Replays the town intro. */
  onReplay?: () => void;
  /** People driving the city right now (their cars are on screen). */
  drivingNow?: number;
}) {
  const [shared, setShared] = useState(false);
  const [cover, setCover] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [coarse, setCoarse] = useState(false);
  const [editHint, setEditHint] = useState(false);
  const [driveHint, setDriveHint] = useState(false);
  const [leave, setLeave] = useState<"idle" | "confirm" | "leaving">("idle");
  const [leaveError, setLeaveError] = useState<string | null>(null);
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
    const url = `${window.location.origin}/town/${slug}`;
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

  async function takeCover() {
    if (!onCover || cover === "saving") return;
    setCover("saving");
    const ok = await onCover();
    setCover(ok ? "saved" : "failed");
    setTimeout(() => setCover("idle"), 2200);
  }

  async function confirmLeave() {
    if (!onLeave) return;
    setLeave("leaving");
    setLeaveError(null);
    const error = await onLeave();
    setLeave(error ? "confirm" : "idle");
    setLeaveError(error);
  }

  const editLabel = "Edit on a computer";
  const canEdit = desktop && !!onEdit;
  const driveLabel = "Drive on a computer";

  return (
    <div className={`${HUD_BOX} flex items-stretch divide-x-2 divide-border`}>
      {join && (
        <button
          type="button"
          onClick={join.onClick}
          className={join.kind === "pending" ? `${BTN} text-muted hover:text-cream` : PRIMARY_BTN}
        >
          {join.kind === "pending" ? <Clock {...ICON} aria-hidden /> : <LogIn {...ICON} aria-hidden />}
          <span>{join.kind === "join" ? "Join" : join.kind === "ask" ? "Ask to join" : "Requested"}</span>
        </button>
      )}
      {onDrive && desktop && (
        <button
          type="button"
          onClick={onDrive}
          title={drivingNow > 0 ? `Drive with the ${drivingNow} ${drivingNow === 1 ? "person" : "people"} out there` : "Drive through the city"}
          className={`${BTN} text-lime hover:text-cream`}
        >
          <Car {...ICON} aria-hidden />
          <span>Drive</span>
          {drivingNow > 0 && (
            <span className="flex items-center gap-1 text-[9px] text-cream">
              <span className="h-1.5 w-1.5 animate-pulse bg-lime" aria-hidden />
              {drivingNow} on the road
            </span>
          )}
        </button>
      )}
      {SHOW_RACE && onDrive && desktop && (
        <Link
          href={`/town/${slug}/race`}
          onClick={(e) => {
            if (!onRace || e.metaKey || e.ctrlKey || e.shiftKey) return;
            e.preventDefault();
            onRace();
          }}
          title={raceRecord ? `The town's race track · ${raceRecord}` : "The town's race track"}
          className={`${BTN} text-lime hover:text-cream`}
        >
          <Flag {...ICON} aria-hidden />
          <span>Race</span>
        </Link>
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
      {onReplay && (
        <button type="button" onClick={onReplay} aria-label="Replay the town intro" title="Replay the intro" className={`${ICON_BTN} text-cream hover:text-lime`}>
          <Play {...ICON} aria-hidden />
        </button>
      )}
      {/* Members share from Invite, with a link that brings people in. */}
      {!canInvite && (
        <button type="button" onClick={share} aria-live="polite" className={`${BTN} min-w-[92px] text-cream hover:text-lime`}>
          {shared ? <Check {...ICON} aria-hidden /> : <Share2 {...ICON} aria-hidden />}
          <span>{shared ? "Copied" : "Share"}</span>
        </button>
      )}
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
      {isAdmin && onCover && (
        <span className="relative flex">
          <button
            type="button"
            onClick={takeCover}
            aria-label="Use this view as the town's cover"
            title="Use this view as the town's cover on Discover"
            className={`${ICON_BTN} ${cover === "saved" ? "text-lime" : cover === "failed" ? "text-red-400" : "text-cream hover:text-lime"}`}
          >
            {cover === "saved" ? <Check {...ICON} aria-hidden /> : <Camera {...ICON} aria-hidden />}
          </button>
          {cover !== "idle" && (
            <span
              role="status"
              className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 animate-[fade-in_0.15s_ease-out] whitespace-nowrap border-2 border-border bg-bg px-2 py-1 text-[9px] text-muted"
            >
              {cover === "saving" ? "Taking the picture…" : cover === "saved" ? "Cover saved" : "Couldn't save the cover"}
            </span>
          )}
        </span>
      )}
      {isAdmin && (
        <Link
          href={requests > 0 ? `/town/${slug}/settings#requests` : `/town/${slug}/settings`}
          aria-label={requests > 0 ? `Town settings, ${requests} join request${requests === 1 ? "" : "s"}` : "Town settings"}
          title={requests > 0 ? `${requests} join request${requests === 1 ? "" : "s"}` : "Town settings"}
          className={`${ICON_BTN} relative text-cream hover:text-lime`}
        >
          <Settings {...ICON} aria-hidden />
          {requests > 0 && (
            <span className="absolute right-1 top-0.5 min-w-[14px] bg-lime px-0.5 text-center text-[8px] leading-[14px] text-bg">
              {requests > 9 ? "9+" : requests}
            </span>
          )}
        </Link>
      )}
      {onLeave && leave === "idle" && (
        <button
          type="button"
          onClick={() => setLeave("confirm")}
          aria-label="Leave town"
          title="Leave town"
          className={`${ICON_BTN} text-muted hover:text-red-400`}
        >
          <LogOut {...ICON} aria-hidden />
        </button>
      )}
      {onLeave && leave !== "idle" && (
        <span className="relative flex divide-x-2 divide-border">
          <button
            type="button"
            disabled={leave === "leaving"}
            onClick={confirmLeave}
            className={`${BTN} min-w-[84px] text-red-400 disabled:opacity-50`}
          >
            {leave === "leaving" ? <Pending label="Leaving" /> : <span>Leave?</span>}
          </button>
          <button
            type="button"
            disabled={leave === "leaving"}
            onClick={() => {
              setLeave("idle");
              setLeaveError(null);
            }}
            className={`${BTN} text-muted hover:text-cream`}
          >
            <span>Stay</span>
          </button>
          {leaveError && (
            <span
              role="alert"
              className="pointer-events-none absolute bottom-full right-0 mb-2 whitespace-nowrap border-2 border-border bg-bg px-2 py-1 text-[9px] text-red-400 normal-case"
            >
              {leaveError}
            </span>
          )}
        </span>
      )}
    </div>
  );
}
