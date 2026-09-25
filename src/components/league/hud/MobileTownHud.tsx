"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronLeft, Clock, Home, LogIn, LogOut, MoreHorizontal, Play, Settings, Share2, ShieldCheck, Trophy, UserPlus } from "lucide-react";
import { Pending } from "@/components/leagues/PixelSpinner";
import type { LeaguePageData } from "@/lib/leagues/queries";
import type { TownBadges } from "@/lib/towns/milestones";
import { townDisplayName } from "@/lib/towns/names";
import { HUD_BOX, fmt } from "./shared";

// The town HUD on phones (under 640px): one compact header row on top and one
// full-width action bar at the bottom, with a spot above it for the lo-fi
// player so nothing overlaps. Driving and editing need a computer, so they
// aren't offered here.

const ICON = { size: 16, strokeWidth: 2.5 } as const;
const SQUARE = "flex h-11 w-11 shrink-0 items-center justify-center transition-colors active:bg-white/10";

export function MobileTownHeader({
  data,
  badges,
  logoUrl,
  pendingRequests = 0,
  onRace,
}: {
  data: LeaguePageData;
  badges: TownBadges;
  logoUrl: string | null;
  pendingRequests?: number;
  onRace: () => void;
}) {
  const { league, counts } = data;
  return (
    <div className="pointer-events-none flex flex-col gap-2">
      <div className={`${HUD_BOX} flex items-stretch divide-x-2 divide-border`}>
        <Link href="/towns" aria-label="Back to towns" className={`${SQUARE} text-muted`}>
          <ChevronLeft {...ICON} aria-hidden />
        </Link>
        <div className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-1.5">
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" width={32} height={32} className="h-8 w-8 shrink-0 [image-rendering:pixelated]" />
          )}
          <div className="min-w-0">
            <h1 className="flex items-center gap-1.5 text-[13px] leading-tight text-cream normal-case">
              <span className="truncate">{townDisplayName(league.name)}</span>
              {league.kind === "company" && <Check size={12} strokeWidth={3} className="shrink-0 text-lime" aria-label="Verified" />}
            </h1>
            <p className="mt-1 truncate text-[9px] text-muted">
              {badges.townOfWeek && <span className="text-lime">&#9733; Town of the week · </span>}
              {fmt(counts.total)} buildings · {fmt(counts.joined)} joined
            </p>
          </div>
        </div>
        <button type="button" onClick={onRace} aria-label="This week's race" className={`${SQUARE} text-lime`}>
          <Trophy {...ICON} aria-hidden />
        </button>
      </div>
      {pendingRequests > 0 && (
        <Link
          href={`/town/${league.slug}/settings#requests`}
          className="pointer-events-auto flex items-center justify-between gap-3 border-2 border-lime bg-bg/80 px-3 py-2 text-[10px] text-lime backdrop-blur-sm"
        >
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 animate-pulse bg-lime" aria-hidden />
            {pendingRequests} join request{pendingRequests === 1 ? "" : "s"}
          </span>
          <span>Review &rarr;</span>
        </Link>
      )}
    </div>
  );
}

export function MobileActionBar({
  slug,
  canInvite,
  isAdmin,
  verifyHref,
  join,
  requests = 0,
  onInvite,
  onReplay,
  onLeave,
}: {
  slug: string;
  canInvite: boolean;
  isAdmin: boolean;
  /** Company towns, signed-in outsiders: verify you work there. */
  verifyHref: string | null;
  join?: { kind: "join" | "ask" | "pending"; onClick: () => void };
  requests?: number;
  onInvite: () => void;
  onReplay?: () => void;
  onLeave?: () => Promise<string | null>;
}) {
  const [menu, setMenu] = useState(false);
  const [shared, setShared] = useState(false);
  const [leave, setLeave] = useState<"idle" | "confirm" | "leaving">("idle");
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Tap outside closes the menu.
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) {
        setMenu(false);
        setLeave("idle");
      }
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [menu]);

  async function share() {
    const url = `${window.location.origin}/town/${slug}`;
    if (navigator.share) {
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

  async function confirmLeave() {
    if (!onLeave) return;
    setLeave("leaving");
    setLeaveError(null);
    const error = await onLeave();
    setLeave(error ? "confirm" : "idle");
    setLeaveError(error);
    if (!error) setMenu(false);
  }

  // One main action, the biggest thing in the bar.
  const primary: { label: string; icon: React.ReactNode; onClick?: () => void; href?: string; filled: boolean } = join
    ? {
        label: join.kind === "join" ? "Join" : join.kind === "ask" ? "Ask to join" : "Requested",
        icon: join.kind === "pending" ? <Clock {...ICON} aria-hidden /> : <LogIn {...ICON} aria-hidden />,
        onClick: join.onClick,
        filled: join.kind !== "pending",
      }
    : canInvite
      ? { label: "Invite", icon: <UserPlus {...ICON} aria-hidden />, onClick: onInvite, filled: false }
      : verifyHref
        ? { label: "Work here? Verify", icon: <ShieldCheck {...ICON} aria-hidden />, href: verifyHref, filled: false }
        : { label: shared ? "Copied" : "Share", icon: shared ? <Check {...ICON} aria-hidden /> : <Share2 {...ICON} aria-hidden />, onClick: share, filled: false };
  const showShare = primary.label !== "Share" && primary.label !== "Copied";
  const hasMenu = isAdmin || !!onLeave;

  return (
    <div ref={menuRef} className="pointer-events-none relative w-full">
      {menu && (
        <div className={`${HUD_BOX} absolute bottom-full right-0 mb-2 flex min-w-[200px] flex-col divide-y-2 divide-border text-[10px]`} role="menu">
          <Link href="/" role="menuitem" className="flex items-center gap-2.5 px-3 py-3 text-cream">
            <Home {...ICON} aria-hidden /> Git City
          </Link>
          {isAdmin && (
            <Link href={`/town/${slug}/settings`} role="menuitem" className="flex items-center gap-2.5 px-3 py-3 text-cream">
              <Settings {...ICON} aria-hidden /> Settings
              {requests > 0 && <span className="ml-auto bg-lime px-1 text-[9px] text-bg">{requests > 9 ? "9+" : requests}</span>}
            </Link>
          )}
          {onLeave &&
            (leave === "idle" ? (
              <button type="button" role="menuitem" onClick={() => setLeave("confirm")} className="flex items-center gap-2.5 px-3 py-3 text-left text-muted">
                <LogOut {...ICON} aria-hidden /> Leave town
              </button>
            ) : (
              <div className="flex flex-col gap-2 px-3 py-3">
                <span className="text-cream">Leave this town?</span>
                <div className="flex gap-2">
                  <button type="button" disabled={leave === "leaving"} onClick={confirmLeave} className="flex-1 border-2 border-red-400/70 py-2 text-red-400 disabled:opacity-50">
                    {leave === "leaving" ? <Pending label="Leaving" /> : "Leave"}
                  </button>
                  <button type="button" disabled={leave === "leaving"} onClick={() => setLeave("idle")} className="flex-1 border-2 border-border py-2 text-muted">
                    Stay
                  </button>
                </div>
                {leaveError && <span className="text-[9px] text-red-400 normal-case">{leaveError}</span>}
              </div>
            ))}
        </div>
      )}

      <div className={`${HUD_BOX} flex items-stretch divide-x-2 divide-border`}>
        {primary.href ? (
          <Link href={primary.href} className="flex h-11 min-w-0 flex-1 items-center justify-center gap-2 px-3 text-[11px] text-lime active:bg-white/10">
            {primary.icon}
            <span className="truncate">{primary.label}</span>
          </Link>
        ) : (
          <button
            type="button"
            onClick={primary.onClick}
            className={`flex h-11 min-w-0 flex-1 items-center justify-center gap-2 px-3 text-[11px] transition-colors ${
              primary.filled ? "bg-lime text-bg" : "text-lime active:bg-white/10"
            }`}
          >
            {primary.icon}
            <span className="truncate">{primary.label}</span>
          </button>
        )}
        {onReplay && (
          <button type="button" onClick={onReplay} aria-label="Replay the town intro" className={`${SQUARE} text-cream`}>
            <Play {...ICON} aria-hidden />
          </button>
        )}
        {showShare && (
          <button type="button" onClick={share} aria-label={shared ? "Link copied" : "Share town"} className={`${SQUARE} text-cream`}>
            {shared ? <Check {...ICON} aria-hidden /> : <Share2 {...ICON} aria-hidden />}
          </button>
        )}
        {hasMenu && (
          <button
            type="button"
            onClick={() => setMenu((m) => !m)}
            aria-label="More"
            aria-expanded={menu}
            className={`${SQUARE} relative ${menu ? "bg-white/10 text-cream" : "text-muted"}`}
          >
            <MoreHorizontal {...ICON} aria-hidden />
            {requests > 0 && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 bg-lime" aria-hidden />}
          </button>
        )}
      </div>
    </div>
  );
}
