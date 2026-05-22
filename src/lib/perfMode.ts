"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type PerfMode = "low" | "high";
export type PerfPreference = PerfMode | "auto";

const STORAGE_KEY = "gitcity.perfMode";

function readUrlOverride(): PerfPreference | null {
  if (typeof window === "undefined") return null;
  const param = new URLSearchParams(window.location.search).get("perf");
  if (param === "low" || param === "high" || param === "auto") return param;
  return null;
}

function readStoredPreference(): PerfPreference {
  if (typeof window === "undefined") return "auto";
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "low" || stored === "high" || stored === "auto") return stored;
  } catch {}
  return "auto";
}

function detectInitialTier(): PerfMode {
  if (typeof window === "undefined") return "high";

  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (memory !== undefined && memory < 4) return "low";

  if (navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4) return "low";

  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (isMobile) return "low";

  return "high";
}

export interface PerfModeApi {
  mode: PerfMode;
  preference: PerfPreference;
  setPreference: (p: PerfPreference) => void;
  // Called by the runtime when it detects sustained frame drops.
  // Promotes "auto" users to "low" and persists, so they don't
  // suffer through the same downgrade dance on every session.
  markDecline: () => void;
}

export function usePerfMode(): PerfModeApi {
  const [preference, setPreferenceState] = useState<PerfPreference>("auto");
  const [autoTier, setAutoTier] = useState<PerfMode>("high");
  const declineCount = useRef(0);

  useEffect(() => {
    const url = readUrlOverride();
    const stored = readStoredPreference();
    setPreferenceState(url ?? stored);
    setAutoTier(detectInitialTier());
  }, []);

  const setPreference = useCallback((p: PerfPreference) => {
    setPreferenceState(p);
    try { localStorage.setItem(STORAGE_KEY, p); } catch {}
  }, []);

  const markDecline = useCallback(() => {
    declineCount.current += 1;
    // Two declines in a session is enough signal to lock in low mode
    if (declineCount.current >= 2 && readStoredPreference() === "auto") {
      try { localStorage.setItem(STORAGE_KEY, "low"); } catch {}
      setPreferenceState("low");
    }
  }, []);

  const mode: PerfMode = preference === "auto" ? autoTier : preference;
  return { mode, preference, setPreference, markDecline };
}
