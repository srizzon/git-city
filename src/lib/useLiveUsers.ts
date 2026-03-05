"use client";

import { useState, useEffect, useRef } from "react";
import { createBrowserSupabase, hasBrowserSupabaseEnv } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

type Status = "connecting" | "connected" | "error" | "disabled";

export function useLiveUsers() {
  const [count, setCount] = useState(1);
  const [status, setStatus] = useState<Status>("connecting");
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!hasBrowserSupabaseEnv()) {
      setStatus("disabled");
      return;
    }

    const supabase = createBrowserSupabase();
    const presenceKey = crypto.randomUUID();

    const channel = supabase.channel("city-presence", {
      config: { presence: { key: presenceKey } },
    });

    channelRef.current = channel;

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const total = Object.keys(state).length;
        setCount(Math.max(1, total));
        setStatus("connected");
      })
      .subscribe(async (status: string) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ online_at: new Date().toISOString() });
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setStatus("error");
        }
      });

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, []);

  return { count, status };
}
