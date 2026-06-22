"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ActivityCard from "./ActivityCard";
import {
  type FeedEvent,
  type TimeBucket,
  BUCKET_LABEL,
  timeBucket,
  dedupeById,
} from "./feed";

const ACCENT = "#c8e64a";

type Tab = "city" | "you" | "circle";

const TAB_LABELS: Record<Tab, string> = { city: "CITY", you: "YOU", circle: "CIRCLE" };

const EMPTY_COPY: Record<Tab, string> = {
  city: "The city is quiet. Be the first to make some noise.",
  you: "Nothing about you yet. Climb the ranks, earn kudos, defend your building.",
  circle: "No activity yet from people you've crossed paths with.",
};

const BUCKET_ORDER: TimeBucket[] = ["now", "today", "week", "older"];

interface ListState {
  events: FeedEvent[];
  hasMore: boolean;
  loading: boolean;
  loaded: boolean;
}

const EMPTY_LIST: ListState = { events: [], hasMore: true, loading: false, loaded: false };

interface Props {
  initialEvents: FeedEvent[];
  open: boolean;
  onClose: () => void;
  onNavigate?: (login: string) => void;
  onCounterAttack?: (login: string) => void;
  viewerLogin?: string | null;
}

export default function ActivityHub({
  initialEvents,
  open,
  onClose,
  onNavigate,
  onCounterAttack,
  viewerLogin,
}: Props) {
  const [tab, setTab] = useState<Tab>("city");
  // City is derived from the live `initialEvents` (the same feed the Pulse
  // shows) plus any older pages fetched on scroll, so it stays in sync without
  // syncing props into state inside an effect.
  const [cityExtra, setCityExtra] = useState<{ events: FeedEvent[]; hasMore: boolean; loading: boolean }>({
    events: [],
    hasMore: true,
    loading: false,
  });
  const [you, setYou] = useState<ListState>(EMPTY_LIST);
  const [circle, setCircle] = useState<ListState>(EMPTY_LIST);

  const scrollRef = useRef<HTMLDivElement>(null);

  const loggedIn = !!viewerLogin;
  const visibleTabs: Tab[] = loggedIn ? ["city", "you", "circle"] : ["city"];

  const cityEvents = useMemo(
    () => dedupeById([...initialEvents, ...cityExtra.events]),
    [initialEvents, cityExtra.events]
  );

  const buildUrl = useCallback((scope: Tab, before?: string) => {
    // No `viewer` param — the server derives identity from the session, so the
    // personalized scopes can't be spoofed by passing someone else's login.
    const params = new URLSearchParams({ limit: "24" });
    if (scope !== "city") params.set("scope", scope);
    if (before) params.set("before", before);
    return `/api/feed?${params.toString()}`;
  }, []);

  // ── Fetchers (invoked from event handlers, never directly in an effect) ──

  const fetchPersonal = useCallback(
    async (scope: "you" | "circle", mode: "initial" | "more", cur: ListState) => {
      const set = scope === "you" ? setYou : setCircle;
      if (cur.loading) return;
      if (mode === "more" && (!cur.hasMore || cur.events.length === 0)) return;

      set((s) => ({ ...s, loading: true }));
      const before = mode === "more" && cur.events.length ? cur.events[cur.events.length - 1].id : undefined;
      try {
        const res = await fetch(buildUrl(scope, before));
        if (!res.ok) {
          set((s) => ({ ...s, loading: false, loaded: true }));
          return;
        }
        const data = await res.json();
        const incoming: FeedEvent[] = data.events ?? [];
        set((s) => ({
          events: dedupeById(mode === "more" ? [...s.events, ...incoming] : incoming),
          hasMore: !!data.has_more,
          loading: false,
          loaded: true,
        }));
      } catch {
        set((s) => ({ ...s, loading: false, loaded: true }));
      }
    },
    [buildUrl]
  );

  const fetchCityMore = useCallback(async () => {
    if (cityExtra.loading || !cityExtra.hasMore) return;
    // Page from the last *real* event. Synthetic rows (`syn-…`) aren't in the
    // DB and their ids aren't UUIDs, so using one as the cursor makes the
    // server reject it and re-return page 1 — an endless no-op scroll loop.
    const lastReal = [...cityEvents].reverse().find((e) => !e.id.startsWith("syn-"));
    const before = lastReal?.id;
    if (!before) {
      setCityExtra((s) => ({ ...s, hasMore: false }));
      return;
    }
    setCityExtra((s) => ({ ...s, loading: true }));
    try {
      const res = await fetch(buildUrl("city", before));
      if (!res.ok) {
        setCityExtra((s) => ({ ...s, loading: false }));
        return;
      }
      const data = await res.json();
      const incoming: FeedEvent[] = data.events ?? [];
      setCityExtra((s) => ({
        events: dedupeById([...s.events, ...incoming]),
        hasMore: !!data.has_more,
        loading: false,
      }));
    } catch {
      setCityExtra((s) => ({ ...s, loading: false }));
    }
  }, [buildUrl, cityExtra.loading, cityExtra.hasMore, cityEvents]);

  const loadMore = useCallback(() => {
    if (tab === "city") fetchCityMore();
    else if (tab === "you") fetchPersonal("you", "more", you);
    else fetchPersonal("circle", "more", circle);
  }, [tab, fetchCityMore, fetchPersonal, you, circle]);

  const selectTab = (t: Tab) => {
    setTab(t);
    if (t === "you" && !you.loaded) fetchPersonal("you", "initial", you);
    if (t === "circle" && !circle.loaded) fetchPersonal("circle", "initial", circle);
  };

  // Close on Escape (no setState in body).
  useEffect(() => {
    if (!open) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Infinite scroll (setState happens in the scroll callback, not the body).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !open) return;
    const onScroll = () => {
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 160) loadMore();
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, [open, loadMore]);

  if (!open) return null;

  const active: ListState =
    tab === "city"
      ? { events: cityEvents, hasMore: cityExtra.hasMore, loading: cityExtra.loading, loaded: true }
      : tab === "you"
      ? you
      : circle;

  const buckets = BUCKET_ORDER.map((b) => ({
    bucket: b,
    items: active.events.filter((e) => timeBucket(e.created_at) === b),
  })).filter((g) => g.items.length > 0);

  return (
    // Notification-style popover that rises from the CITY ACTIVITY launcher in
    // the bottom-left corner. Anchored bottom-left, opens upward, non-blocking
    // (no backdrop) so the city and the right-side building card stay usable.
    <div className="activity-pop fixed bottom-7 left-3 z-40 flex max-h-[72vh] w-[calc(100%-1.5rem)] flex-col border border-border bg-bg/95 shadow-2xl shadow-black/60 backdrop-blur-sm sm:left-4 sm:w-[380px]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="live-dot inline-block h-2 w-2 rounded-full bg-[#c8e64a]" />
            <h2 className="text-sm" style={{ color: ACCENT }}>
              CITY ACTIVITY
            </h2>
          </div>
          <button onClick={onClose} className="text-sm text-muted hover:text-cream">
            &#10005;
          </button>
        </div>

        {/* Tabs */}
        {visibleTabs.length > 1 && (
          <div className="flex gap-2 border-b border-border px-4 py-2.5">
            {visibleTabs.map((t) => {
              const isActive = t === tab;
              return (
                <button
                  key={t}
                  onClick={() => selectTab(t)}
                  className="border px-3 py-1 text-[10px] tracking-wider transition-colors"
                  style={{
                    color: isActive ? "#0d0d0d" : undefined,
                    backgroundColor: isActive ? ACCENT : "transparent",
                    borderColor: isActive ? ACCENT : "#2a2a2a",
                  }}
                >
                  <span className={isActive ? "" : "text-muted"}>{TAB_LABELS[t]}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Feed */}
        <div ref={scrollRef} className="scrollbar-thin flex-1 overflow-y-auto px-3 py-3">
          {active.loaded && active.events.length === 0 ? (
            <div className="px-4 py-16 text-center text-[11px] text-dim normal-case">
              {EMPTY_COPY[tab]}
            </div>
          ) : (
            buckets.map(({ bucket, items }) => (
              <div key={bucket} className="mb-4">
                <p className="mb-1 px-1 text-[8px] tracking-wider text-dim">{BUCKET_LABEL[bucket]}</p>
                <div className="divide-y divide-border/40 border border-border bg-bg-raised/30">
                  {items.map((e) => (
                    <ActivityCard
                      key={e.id}
                      event={e}
                      viewerLogin={viewerLogin}
                      variant="row"
                      onNavigate={onNavigate}
                      onCounterAttack={onCounterAttack}
                    />
                  ))}
                </div>
              </div>
            ))
          )}

          {active.loading && (
            <div className="py-4 text-center text-[10px] text-dim animate-pulse">Loading...</div>
          )}
          {!active.hasMore && active.events.length > 0 && (
            <div className="py-4 text-center text-[9px] text-dim">End of activity</div>
          )}
        </div>

      <style jsx>{`
        .activity-pop {
          animation: popover-up 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          transform-origin: bottom left;
        }
        @keyframes popover-up {
          from {
            opacity: 0;
            transform: translateY(14px) scale(0.97);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .live-dot {
          animation: live-pulse 2s ease-in-out infinite;
        }
        @keyframes live-pulse {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
      `}</style>
    </div>
  );
}
