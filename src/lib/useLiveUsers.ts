"use client";

import { useState, useEffect, useRef } from "react";

const HEARTBEAT_INTERVAL = 30_000; // 30s

export function useLiveUsers() {
  const [count, setCount] = useState(1);
  const sessionId = useRef("");

  useEffect(() => {
    if (!sessionId.current) {
      sessionId.current = crypto.randomUUID();
    }

    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    async function heartbeat() {
      try {
        const res = await fetch("/api/online", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: sessionId.current }),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && typeof data.count === "number") {
          setCount(Math.max(1, data.count));
        }
      } catch {
        // ignore
      }
    }

    function start() {
      heartbeat();
      interval = setInterval(heartbeat, HEARTBEAT_INTERVAL);
    }

    function stop() {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    }

    function onVisibilityChange() {
      if (document.hidden) {
        stop();
      } else {
        start();
      }
    }

    start();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return { count, status: "connected" as const };
}
