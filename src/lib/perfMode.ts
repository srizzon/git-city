"use client";

import { useCallback, useEffect, useState } from "react";
import { getGPUTier } from "@pmndrs/detect-gpu";

export type PerfMode = "low" | "high";
export type PerfPreference = PerfMode | "auto";

const STORAGE_KEY = "gitcity.perfMode";
// Bump the version to force re-detection after tier-mapping changes.
const AUTO_TIER_KEY = "gitcity.autoTier.v1";

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

function readCachedAutoTier(): PerfMode | null {
  try {
    const v = localStorage.getItem(AUTO_TIER_KEY);
    if (v === "low" || v === "high") return v;
  } catch {}
  return null;
}

function cacheAutoTier(tier: PerfMode) {
  try { localStorage.setItem(AUTO_TIER_KEY, tier); } catch {}
}

// Instant guess used while the GPU benchmark lookup runs (and as fallback when
// it fails). Coarse on purpose: RAM/cores say little about the GPU.
function heuristicTier(): PerfMode {
  if (typeof window === "undefined") return "high";

  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (memory !== undefined && memory < 4) return "low";

  if (navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4) return "low";

  if (isMobileUA()) return "low";

  return "high";
}

function isMobileUA(): boolean {
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

// Classifies the actual GPU model against detect-gpu's benchmark database
// (self-hosted under public/gpu-benchmarks). Tier 2 means the GPU sustains
// >= 30 fps in the reference benchmark — below that, the SF map chugs.
async function detectAutoTier(): Promise<PerfMode> {
  try {
    const result = await getGPUTier({ benchmarksURL: "/gpu-benchmarks" });
    // Mobile is always low: thermals + the SF map's 169k buildings.
    if (result.isMobile) return "low";
    if (result.type === "BENCHMARK") return result.tier >= 2 ? "high" : "low";
  } catch {}
  return heuristicTier();
}

export interface PerfModeApi {
  mode: PerfMode;
  preference: PerfPreference;
  setPreference: (p: PerfPreference) => void;
  // Pins the auto tier to low and persists it. Called when real frames drop
  // while the city is still hidden behind the loading screen — a measured
  // signal that beats any benchmark lookup. Never called after reveal: from
  // then on quality only changes by user action.
  downgradeAutoTier: () => void;
}

// Quality tier resolution, in priority order:
//   1. ?perf= URL override
//   2. user preference pinned via the graphics control (localStorage)
//   3. cached auto-detection from a previous visit
//   4. GPU benchmark lookup (detect-gpu), heuristic guess while it resolves
// The result is fixed for the session — the runtime may *suggest* switching
// (toast), but only the user flips it. Automatic mid-session downgrades swap
// the city's whole look (bloom, DPR), which was jarring during the intro.
export function usePerfMode(): PerfModeApi {
  // Lazy initializers are SSR-safe (readers guard window access), but they
  // resolve to different values on the server ("auto"/"high") vs the client's
  // first render (stored/cached tier). Components that render the resulting
  // mode during hydration — e.g. GraphicsControl's HIGH/LOW label — must use
  // suppressHydrationWarning, since the tier is intentionally read synchronously
  // (the scene needs it before the first frame) rather than deferred to an effect.
  const [preference, setPreferenceState] = useState<PerfPreference>(
    () => readUrlOverride() ?? readStoredPreference(),
  );
  const [autoTier, setAutoTier] = useState<PerfMode>(
    () => readCachedAutoTier() ?? heuristicTier(),
  );

  useEffect(() => {
    if (readCachedAutoTier()) return; // settled on a previous visit
    let cancelled = false;
    // First visit: the benchmark resolves in ~100-300ms, well within the
    // loading screen, so the tier settles before the city is ever visible.
    detectAutoTier().then((tier) => {
      if (cancelled) return;
      cacheAutoTier(tier);
      setAutoTier(tier);
    });
    return () => { cancelled = true; };
  }, []);

  const setPreference = useCallback((p: PerfPreference) => {
    setPreferenceState(p);
    try { localStorage.setItem(STORAGE_KEY, p); } catch {}
  }, []);

  const downgradeAutoTier = useCallback(() => {
    cacheAutoTier("low");
    setAutoTier("low");
  }, []);

  const mode: PerfMode = preference === "auto" ? autoTier : preference;
  return { mode, preference, setPreference, downgradeAutoTier };
}
