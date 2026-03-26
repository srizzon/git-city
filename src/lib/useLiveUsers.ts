"use client";

import { useState, useEffect, useRef } from "react";

const HEARTBEAT_INTERVAL = 30_000; // 30s
const COUNT_INTERVAL = 10_000; // 10s (CDN-cached)

export function useLiveUsers() {
  const [count, setCount] = useState(1);
  const sessionId = useRef("");

  useEffect(() => {
    if (!sessionId.current) {
      sessionId.current = crypto.randomUUID();
    }

    let cancelled = false;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let countTimer: ReturnType<typeof setInterval> | null = null;

    // Fire-and-forget heartbeat (keeps session alive)
    async function heartbeat() {
      try {
        await fetch("/api/online", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: sessionId.current }),
        });
      } catch {
        // ignore
      }
    }

    // Fetch cached count from CDN
    async function fetchCount() {
      try {
        const res = await fetch("/api/online");
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
      fetchCount();
      heartbeatTimer = setInterval(heartbeat, HEARTBEAT_INTERVAL);
      countTimer = setInterval(fetchCount, COUNT_INTERVAL);
    }

    function stop() {
      if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
      if (countTimer) { clearInterval(countTimer); countTimer = null; }
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
