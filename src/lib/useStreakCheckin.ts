"use client";

import { useState, useEffect } from "react";
import type { Session } from "@supabase/supabase-js";

export interface StreakData {
  checked_in: boolean;
  already_today: boolean;
  streak: number;
  longest: number;
  was_frozen: boolean;
  new_achievements: string[];
  unseen_count: number;
  kudos_since_last: number;
}

const CACHE_KEY = "gc_checkin";

export function useStreakCheckin(
  session: Session | null,
  hasClaimed: boolean,
) {
  const [streakData, setStreakData] = useState<StreakData | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        const data = JSON.parse(cached) as StreakData;
        data.checked_in = false; // no pulse on cached load
        return data;
      }
    } catch {}
    return null;
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!session || !hasClaimed) return;
    // Already fetched this session
    if (typeof window !== "undefined" && sessionStorage.getItem(CACHE_KEY)) return;

    setLoading(true);

    fetch("/api/checkin", { method: "POST" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: StreakData | null) => {
        if (data) {
          setStreakData(data);
          if (typeof window !== "undefined") {
            sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
          }
          if (data.unseen_count > 0) {
            fetch("/api/achievements/mark-seen", { method: "POST" }).catch(() => {});
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [session, hasClaimed]);

  return { streakData, loading };
}
