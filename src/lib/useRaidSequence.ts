"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { CityBuilding } from "@/lib/github";
import type { RaidPreviewResponse, RaidExecuteResponse } from "@/lib/raid";
import { preloadRaidAudio, playRaidSound, stopRaidSound, fadeOutRaidSound, stopAllRaidSounds } from "@/lib/raidAudio";

// ─── Types ────────────────────────────────────────────────────

export type RaidPhase =
  | "idle"
  | "preview"
  | "intro"
  | "flight"
  | "attack"
  | "outro_win"
  | "outro_lose"
  | "share"
  | "done";

export interface RaidState {
  phase: RaidPhase;
  previewData: RaidPreviewResponse | null;
  raidData: RaidExecuteResponse | null;
  attackerBuilding: CityBuilding | null;
  defenderBuilding: CityBuilding | null;
  error: string | null;
  loading: boolean;
}

export interface RaidActions {
  startPreview: (targetLogin: string, buildings: CityBuilding[], myLogin: string) => void;
  executeRaid: (boostPurchaseId?: number, vehicleId?: string) => void;
  skipToShare: () => void;
  exitRaid: () => void;
  onPhaseComplete: (phase: RaidPhase) => void;
}

const INITIAL_STATE: RaidState = {
  phase: "idle",
  previewData: null,
  raidData: null,
  attackerBuilding: null,
  defenderBuilding: null,
  error: null,
  loading: false,
};

// Phase durations (ms) - used for auto-transitions
const PHASE_DURATIONS: Partial<Record<RaidPhase, number>> = {
  intro: 4500,
  outro_win: 3500,
  outro_lose: 3000,
};

// ─── Hook ─────────────────────────────────────────────────────

export function useRaidSequence(): [RaidState, RaidActions] {
  const [state, setState] = useState<RaidState>(INITIAL_STATE);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const targetLoginRef = useRef<string>("");
  const setPhaseRef = useRef<((phase: RaidPhase) => void) | null>(null);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      stopAllRaidSounds();
    };
  }, []);

  const setPhase = useCallback((phase: RaidPhase) => {
    setState((prev) => ({ ...prev, phase, error: null }));

    // Clear any pending timer
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    // Audio triggers
    switch (phase) {
      case "intro":
        preloadRaidAudio();
        playRaidSound("takeoff");
        break;
      case "flight":
        playRaidSound("flight");
        break;
      case "attack":
        stopRaidSound("flight");
        break;
      case "outro_win":
        stopAllRaidSounds();
        // explosion already played by 3D component at climax
        playRaidSound("victory");
        break;
      case "outro_lose":
        stopAllRaidSounds();
        playRaidSound("crash");
        setTimeout(() => playRaidSound("defeat"), 500);
        break;
      case "share":
      case "done":
      case "idle":
        stopAllRaidSounds();
        break;
    }

    // Auto-advance for timed phases
    const duration = PHASE_DURATIONS[phase];
    if (duration) {
      timerRef.current = setTimeout(() => {
        if (phase === "intro") setPhaseRef.current?.("flight");
        else if (phase === "outro_win") setPhaseRef.current?.("share");
        else if (phase === "outro_lose") setPhaseRef.current?.("share");
      }, duration);
    }
  }, []);

  // Keep ref updated
  useEffect(() => {
    setPhaseRef.current = setPhase;
  });

  // Visibility change handling
  useEffect(() => {
    if (state.phase === "idle" || state.phase === "preview" || state.phase === "share") return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Pause timer
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [state.phase]);

  const startPreview = useCallback(
    async (targetLogin: string, buildings: CityBuilding[], myLogin: string) => {
      targetLoginRef.current = targetLogin;
      setState((prev) => ({ ...prev, loading: true, error: null }));

      // Find buildings for position data
      const attackerBuilding = buildings.find((b) => b.login === myLogin) ?? null;
      const defenderBuilding = buildings.find((b) => b.login === targetLogin) ?? null;

      try {
        const res = await fetch("/api/raid/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target_login: targetLogin }),
        });

        if (!res.ok) {
          const data = await res.json();
          setState((prev) => ({
            ...prev,
            loading: false,
            error: data.error || "Failed to load raid preview",
          }));
          return;
        }

        const previewData = (await res.json()) as RaidPreviewResponse;

        setState({
          phase: "preview",
          previewData,
          raidData: null,
          attackerBuilding,
          defenderBuilding,
          error: null,
          loading: false,
        });
      } catch {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: "Network error",
        }));
      }
    },
    [],
  );

  const executeRaid = useCallback(
    async (boostPurchaseId?: number, vehicleId?: string) => {
      setState((prev) => ({ ...prev, loading: true }));

      try {
        const res = await fetch("/api/raid/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target_login: targetLoginRef.current,
            boost_purchase_id: boostPurchaseId,
            vehicle_id: vehicleId,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          setState((prev) => ({
            ...prev,
            loading: false,
            error: data.error || "Raid failed",
          }));
          return;
        }

        const raidData = (await res.json()) as RaidExecuteResponse;

        // Override positions with client-side building data
        setState((prev) => {
          if (prev.attackerBuilding) {
            raidData.attacker.position = prev.attackerBuilding.position;
            raidData.attacker.height = prev.attackerBuilding.height;
          }
          if (prev.defenderBuilding) {
            raidData.defender.position = prev.defenderBuilding.position;
            raidData.defender.height = prev.defenderBuilding.height;
          }
          return {
            ...prev,
            raidData,
            loading: false,
            phase: "intro",
          };
        });

        // Start audio
        preloadRaidAudio();
        playRaidSound("takeoff");

        // Auto-advance intro -> flight
        timerRef.current = setTimeout(() => setPhase("flight"), 4500);
      } catch {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: "Network error",
        }));
      }
    },
    [setPhase],
  );

  const onPhaseComplete = useCallback(
    (completedPhase: RaidPhase) => {
      switch (completedPhase) {
        case "intro":
          setPhase("flight");
          break;
        case "flight":
          setPhase("attack");
          break;
        case "attack":
          setState((prev) => {
            const nextPhase = prev.raidData?.success ? "outro_win" : "outro_lose";
            setPhase(nextPhase);
            return prev;
          });
          break;
        case "outro_win":
        case "outro_lose":
          setPhase("share");
          break;
        case "share":
          setPhase("done");
          break;
        default:
          break;
      }
    },
    [setPhase],
  );

  const skipToShare = useCallback(() => {
    setPhase("share");
  }, [setPhase]);

  const exitRaid = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    stopAllRaidSounds();
    setState(INITIAL_STATE);
  }, []);

  return [
    state,
    { startPreview, executeRaid, skipToShare, exitRaid, onPhaseComplete },
  ];
}
