"use client";

import { useEffect, useState } from "react";

// Every city in Brazil (lib/towns/br-cities: ~90 KB gzipped) for the search
// and the picker, fetched the first time either opens, then kept.

type BrCitiesModule = typeof import("@/lib/towns/br-cities");

let loaded: BrCitiesModule | null = null;
let loading: Promise<BrCitiesModule> | null = null;

export function useBrCities(when = true): BrCitiesModule | null {
  const [mod, setMod] = useState<BrCitiesModule | null>(loaded);
  useEffect(() => {
    if (!when || mod) return;
    loading ??= import("@/lib/towns/br-cities").then((m) => (loaded = m));
    let live = true;
    loading.then((m) => live && setMod(m)).catch(() => {});
    return () => {
      live = false;
    };
  }, [when, mod]);
  return mod;
}
