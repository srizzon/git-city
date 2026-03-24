"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createBrowserSupabase } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

export interface LiveSession {
  githubLogin: string;
  avatarUrl: string;
  status: "active" | "idle";
  language?: string;
}

export function useCodingPresence() {
  const [liveByLogin, setLiveByLogin] = useState<Map<string, LiveSession>>(new Map());
  const channelRef = useRef<RealtimeChannel | null>(null);
  const mapRef = useRef<Map<string, LiveSession>>(new Map());

  // Stable setter that creates a new Map reference for React
  const updateMap = useCallback(() => {
    setLiveByLogin(new Map(mapRef.current));
  }, []);

  useEffect(() => {
    // Bootstrap: fetch current active sessions
    fetch("/api/presence")
      .then((r) => r.json())
      .then((data) => {
        if (data.developers) {
          const map = new Map<string, LiveSession>();
          for (const d of data.developers) {
            map.set(d.githubLogin, {
              githubLogin: d.githubLogin,
              avatarUrl: d.avatarUrl,
              status: d.status,
              language: d.language,
            });
          }
          mapRef.current = map;
          updateMap();
        }
      })
      .catch(() => {});

    // Subscribe to realtime broadcast
    const supabase = createBrowserSupabase();
    const channel = supabase.channel("coding-presence");
    channelRef.current = channel;

    channel
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on("broadcast", { event: "heartbeat" }, ({ payload }: { payload: any }) => {
        if (!payload?.githubLogin) return;

        // Offline signal: remove dev from live map immediately
        if (payload.status === "offline") {
          mapRef.current.delete(payload.githubLogin);
          updateMap();
          return;
        }

        mapRef.current.set(payload.githubLogin, {
          githubLogin: payload.githubLogin,
          avatarUrl: payload.avatarUrl,
          status: payload.status ?? "active",
          language: payload.language,
        });
        updateMap();
      })
      .subscribe();

    // Periodically re-fetch to stay in sync with server state
    const pruneRef = { current: null as ReturnType<typeof setInterval> | null };

    function fetchPresenceData() {
      fetch("/api/presence")
        .then((r) => r.json())
        .then((data) => {
          if (data.developers) {
            const map = new Map<string, LiveSession>();
            for (const d of data.developers) {
              map.set(d.githubLogin, {
                githubLogin: d.githubLogin,
                avatarUrl: d.avatarUrl,
                status: d.status,
                language: d.language,
              });
            }
            mapRef.current = map;
            updateMap();
          }
        })
        .catch(() => {});
    }

    function startPruning() {
      fetchPresenceData();
      pruneRef.current = setInterval(fetchPresenceData, 30_000);
    }

    function stopPruning() {
      if (pruneRef.current) {
        clearInterval(pruneRef.current);
        pruneRef.current = null;
      }
    }

    function onVisibilityChange() {
      if (document.hidden) {
        stopPruning();
      } else {
        startPruning();
      }
    }

    startPruning();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
      stopPruning();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [updateMap]);

  const liveCount = liveByLogin.size;
  const liveLogins = new Set(
    Array.from(liveByLogin.values()).map((s) => s.githubLogin),
  );

  return { liveCount, liveLogins, liveByLogin };
}
