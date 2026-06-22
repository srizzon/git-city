"use client";

import { useEffect, useRef, useState } from "react";
import { tierFromLevel } from "@/lib/xp";
import ActivityCard from "./ActivityCard";
import {
  type FeedEvent,
  eventMeta,
  formatEvent,
  primaryLogin,
  devFor,
  relativeTime,
} from "./feed";

interface Props {
  events: FeedEvent[];
  viewerLogin?: string | null;
  onOpenHub: () => void;
  onNavigate?: (login: string) => void;
  onCounterAttack?: (login: string) => void;
  hasBottomBar?: boolean;
  /** Whether the activity drawer is currently open (styles the launcher). */
  hubOpen?: boolean;
}

const MAX_STACK = 3;
const DISMISS_MS = 9000;
const ROTATE_MS = 4000;
const MAX_HIGHLIGHTS = 8;

export default function CityPulse({
  events,
  viewerLogin,
  onOpenHub,
  onNavigate,
  onCounterAttack,
  hasBottomBar = false,
  hubOpen = false,
}: Props) {
  const [stack, setStack] = useState<FeedEvent[]>([]);
  const [index, setIndex] = useState(0);
  const seenRef = useRef<Set<string>>(new Set());
  const firstRunRef = useRef(true);
  const timeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Recent real events that rotate through the bar.
  const highlights = events.filter((e) => !e.id.startsWith("syn-")).slice(0, MAX_HIGHLIGHTS);

  // Detect genuinely new events and pop them as floating toast cards.
  useEffect(() => {
    const seen = seenRef.current;
    if (firstRunRef.current) {
      events.forEach((e) => seen.add(e.id));
      firstRunRef.current = false;
      return;
    }
    const fresh = events.filter((e) => !seen.has(e.id) && !e.id.startsWith("syn-"));
    if (fresh.length === 0) return;
    fresh.forEach((e) => seen.add(e.id));

    const toShow = fresh.slice(0, MAX_STACK);
    setStack((prev) => {
      const merged = [...toShow, ...prev];
      return merged.filter((e, i) => merged.findIndex((x) => x.id === e.id) === i).slice(0, MAX_STACK);
    });
    for (const e of toShow) {
      const t = setTimeout(() => {
        setStack((prev) => prev.filter((x) => x.id !== e.id));
        timeoutsRef.current.delete(e.id);
      }, DISMISS_MS);
      timeoutsRef.current.set(e.id, t);
    }
  }, [events]);

  // Rotate the bar highlight.
  useEffect(() => {
    if (highlights.length <= 1) return;
    const t = setInterval(() => setIndex((i) => i + 1), ROTATE_MS);
    return () => clearInterval(t);
  }, [highlights.length]);

  useEffect(() => {
    const timeouts = timeoutsRef.current;
    return () => {
      timeouts.forEach((t) => clearTimeout(t));
      timeouts.clear();
    };
  }, []);

  const dismiss = (id: string) => {
    setStack((prev) => prev.filter((x) => x.id !== id));
    const t = timeoutsRef.current.get(id);
    if (t) {
      clearTimeout(t);
      timeoutsRef.current.delete(id);
    }
  };

  const current = highlights.length ? highlights[index % highlights.length] : null;
  const curNav = current ? primaryLogin(current, viewerLogin) : null;
  const curDev = current ? devFor(current, curNav) : null;
  const curMeta = current ? eventMeta(current) : null;
  const curTier = curDev?.level ? tierFromLevel(curDev.level).color : "#2a2a2a";

  const barBottom = hasBottomBar ? "bottom-11.5 sm:bottom-0" : "bottom-0";

  return (
    <>
      {/* Floating toast cards (genuinely new events) — top-right, below the
          LIVE/CODING chips, stacking downward with the newest on top. */}
      <div className="pointer-events-none fixed right-3 top-16 z-30 flex flex-col gap-2">
        {stack.map((e) => (
          <div key={e.id} className="pulse-card pointer-events-auto relative">
            <button
              onClick={() => dismiss(e.id)}
              aria-label="Dismiss"
              className="absolute -right-1.5 -top-1.5 z-10 flex h-4 w-4 items-center justify-center border border-border bg-bg text-[8px] text-muted hover:text-cream"
            >
              &#10005;
            </button>
            <ActivityCard
              event={e}
              viewerLogin={viewerLogin}
              variant="pulse"
              onNavigate={onNavigate}
              onCounterAttack={onCounterAttack}
            />
          </div>
        ))}
      </div>

      {/* Persistent bottom bar */}
      <div
        className={`fixed ${barBottom} left-0 right-0 z-30 flex h-7 items-center border-t border-border/30 bg-bg/90 backdrop-blur-sm`}
      >
        {/* Launcher (toggles the drawer) */}
        <button
          onClick={onOpenHub}
          className="flex shrink-0 items-center gap-1.5 border-r border-border/30 px-3 text-[9px] transition-colors hover:text-[#c8e64a]"
          style={{ color: hubOpen ? "#c8e64a" : undefined }}
          aria-expanded={hubOpen}
        >
          <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-[#c8e64a]" />
          <span className={hubOpen ? "" : "text-cream"}>CITY ACTIVITY</span>
        </button>

        {/* Rotating live highlight */}
        {current && (
          <button
            onClick={onOpenHub}
            className="flex min-w-0 flex-1 items-center gap-2 px-3 text-left"
            title="Open city activity"
          >
            <span key={current.id} className="highlight-fade flex min-w-0 items-center gap-2">
              {curDev?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={curDev.avatar_url}
                  alt=""
                  className="h-4 w-4 shrink-0 border"
                  style={{ imageRendering: "pixelated", borderColor: curTier }}
                />
              ) : (
                <span className="h-4 w-4 shrink-0 border" style={{ borderColor: curTier }} />
              )}
              {curMeta && (
                <span className="hidden h-1.5 w-1.5 shrink-0 rounded-full sm:inline-block" style={{ backgroundColor: curMeta.color }} />
              )}
              <span className="truncate text-[10px] text-muted normal-case">
                {formatEvent(current, viewerLogin)}
              </span>
              <span className="hidden shrink-0 text-[8px] text-dim sm:inline">
                {relativeTime(current.created_at)}
              </span>
            </span>
          </button>
        )}

        {/* Footer links */}
        <div className="hidden shrink-0 items-center gap-2 border-l border-border/30 pl-2 pr-3 sm:flex">
          <a href="/terms" className="text-[8px] text-cream/20 transition-colors hover:text-cream/50">Terms</a>
          <span className="text-[8px] text-cream/10">·</span>
          <a href="/privacy" className="text-[8px] text-cream/20 transition-colors hover:text-cream/50">Privacy</a>
          <span className="text-[8px] text-cream/10">·</span>
          <a href="/support" className="text-[8px] text-cream/20 transition-colors hover:text-cream/50">Support</a>
        </div>
      </div>

      <style jsx>{`
        .pulse-card {
          animation: pulse-in 0.35s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes pulse-in {
          0% {
            opacity: 0;
            transform: translateY(12px) scale(0.96);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .highlight-fade {
          animation: highlight-fade 0.5s ease;
        }
        @keyframes highlight-fade {
          0% {
            opacity: 0;
            transform: translateY(4px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .live-dot {
          animation: live-pulse 2s ease-in-out infinite;
        }
        @keyframes live-pulse {
          0%,
          100% {
            opacity: 1;
            box-shadow: 0 0 0 0 rgba(200, 230, 74, 0.5);
          }
          50% {
            opacity: 0.6;
            box-shadow: 0 0 0 3px rgba(200, 230, 74, 0);
          }
        }
      `}</style>
    </>
  );
}
