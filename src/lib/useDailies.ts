"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { Session } from "@supabase/supabase-js";

export interface DailyMission {
  id: string;
  title: string;
  description: string;
  threshold: number;
  progress: number;
  completed: boolean;
}

export interface DailiesData {
  missions: DailyMission[];
  completed_count: number;
  all_completed: boolean;
  reward_claimed: boolean;
  dailies_streak: number;
  dailies_completed: number;
  has_github_star?: boolean;
}

export function useDailies(session: Session | null, hasClaimed: boolean) {
  const [data, setData] = useState<DailiesData | null>(null);
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef(false);

  const fetchDailies = useCallback(async () => {
    try {
      const r = await fetch("/api/dailies");
      if (!r.ok) return;
      const json = (await r.json()) as DailiesData;
      setData(json);
    } catch {}
  }, []);

  // Initial fetch on mount
  useEffect(() => {
    if (!session || !hasClaimed) return;
    if (fetchedRef.current) return;

    fetchedRef.current = true;
    setLoading(true);
    fetchDailies().finally(() => setLoading(false));
  }, [session, hasClaimed, fetchDailies]);

  const refresh = useCallback(async () => {
    await fetchDailies();
  }, [fetchDailies]);

  // Toast queue for mission progress notifications
  const [toasts, setToasts] = useState<{ id: number; title: string; done: boolean }[]>([]);
  const toastIdRef = useRef(0);

  const addToast = useCallback((title: string, done: boolean) => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, title, done }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2500);
  }, []);

  const trackClientMission = useCallback(
    async (missionId: string) => {
      if (!data) return;
      const mission = data.missions.find((m) => m.id === missionId);
      if (!mission || mission.completed) return;

      const newProgress = Math.min(mission.progress + 1, mission.threshold);
      const justCompleted = newProgress >= mission.threshold;

      // Show toast
      if (mission.threshold > 1) {
        addToast(`${mission.title} (${newProgress}/${mission.threshold})`, justCompleted);
      } else {
        addToast(mission.title, justCompleted);
      }

      // Optimistic update
      setData((prev) => {
        if (!prev) return prev;
        const updated = prev.missions.map((m) => {
          if (m.id !== missionId) return m;
          return {
            ...m,
            progress: newProgress,
            completed: justCompleted,
          };
        });
        const completedCount = updated.filter((m) => m.completed).length;
        return {
          ...prev,
          missions: updated,
          completed_count: completedCount,
          all_completed: completedCount === 3,
        };
      });

      // Fire-and-forget to server
      fetch("/api/dailies/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mission_id: missionId }),
      }).catch(() => {});
    },
    [data, addToast],
  );

  const claim = useCallback(async () => {
    try {
      const r = await fetch("/api/dailies/claim", { method: "POST" });
      if (!r.ok) return null;
      const result = await r.json();

      // Update local state
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          reward_claimed: true,
          dailies_streak: result.streak,
          dailies_completed: result.total,
        };
      });

      return result as { ok: boolean; streak: number; total: number; freeze_granted: boolean };
    } catch {
      return null;
    }
  }, []);

  return { data, loading, refresh, trackClientMission, claim, toasts };
}
