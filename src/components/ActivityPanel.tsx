"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { formatEvent } from "./ActivityTicker";
import type { FeedEvent } from "./ActivityTicker";

const ACCENT = "#c8e64a";

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface Props {
  initialEvents: FeedEvent[];
  open: boolean;
  onClose: () => void;
  onNavigate?: (login: string) => void;
}

export default function ActivityPanel({ initialEvents, open, onClose, onNavigate }: Props) {
  const [events, setEvents] = useState<FeedEvent[]>(initialEvents);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setEvents(initialEvents);
  }, [initialEvents]);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore || events.length === 0) return;
    setLoading(true);
    try {
      const lastId = events[events.length - 1].id;
      const res = await fetch(`/api/feed?limit=20&before=${lastId}`);
      if (!res.ok) return;
      const data = await res.json();
      setEvents((prev) => [...prev, ...data.events]);
      setHasMore(data.has_more);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [events, loading, hasMore]);

  // Infinite scroll
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel || !open) return;

    const handleScroll = () => {
      if (panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 100) {
        loadMore();
      }
    };

    panel.addEventListener("scroll", handleScroll);
    return () => panel.removeEventListener("scroll", handleScroll);
  }, [open, loadMore]);

  if (!open) return null;

  return (
    <div className="fixed right-0 top-0 z-40 flex h-full w-80 flex-col border-l border-border bg-bg/95 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm" style={{ color: ACCENT }}>
          CITY ACTIVITY
        </h2>
        <button
          onClick={onClose}
          className="text-xs text-muted hover:text-cream"
        >
          &#10005;
        </button>
      </div>

      {/* Events */}
      <div ref={panelRef} className="flex-1 overflow-y-auto">
        {events.length === 0 ? (
          <div className="px-4 py-8 text-center text-[10px] text-dim normal-case">
            The city is quiet... be the first to make noise | 城市安静... 成为第一个噪音的人
          </div>
        ) : (
          events.map((e) => {
            const login = e.actor?.login;
            const avatarUrl = e.actor?.avatar_url;
            return (
              <div
                key={e.id}
                className="border-b border-border/30 px-4 py-3 hover:bg-bg-card/50 transition-colors"
              >
                <p className="text-[9px] text-dim">{relativeTime(e.created_at)}</p>
                <div className="mt-1 flex items-start gap-2">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={login ?? ""}
                      className="mt-0.5 h-5 w-5 shrink-0 border border-border"
                      style={{ imageRendering: "pixelated" }}
                    />
                  ) : (
                    <div className="mt-0.5 h-5 w-5 shrink-0 border border-border bg-bg-card" />
                  )}
                  <p className="text-[10px] text-cream normal-case">
                    {formatEvent(e)}
                  </p>
                </div>
                {login && (
                  <button
                    onClick={() => onNavigate?.(login)}
                    className="mt-1 ml-7 text-[9px] hover:underline"
                    style={{ color: ACCENT }}
                  >
                    View building | 查看建筑物 →
                  </button>
                )}
              </div>
            );
          })
        )}

        {loading && (
          <div className="px-4 py-3 text-center text-[9px] text-dim animate-pulse">
            Loading... | 正在加载...
          </div>
        )}

        {!hasMore && events.length > 0 && (
          <div className="px-4 py-3 text-center text-[9px] text-dim">
            End of activity | 活动结束
          </div>
        )}
      </div>
    </div>
  );
}
