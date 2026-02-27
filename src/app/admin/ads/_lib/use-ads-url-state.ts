"use client";

import { useCallback, useEffect, useRef, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { AdsFilters, Period, StatusFilter, VehicleFilter, SourceFilter, SortKey, SortDir } from "./types";
import { STORAGE_KEY } from "./constants";

const DEFAULTS: AdsFilters = {
  period: "30d",
  status: "active",
  vehicle: "all",
  source: "paid",
  q: "",
  sort: "impressions",
  dir: "desc",
};

function loadLocalStorage(): Partial<AdsFilters> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function parseParams(params: URLSearchParams): Partial<AdsFilters> {
  const result: Partial<AdsFilters> = {};
  const p = params.get("period");
  if (p === "7d" || p === "30d" || p === "all") result.period = p;
  const s = params.get("status");
  if (s === "all" || s === "active" || s === "paused" || s === "expired") result.status = s;
  const v = params.get("vehicle");
  if (v === "all" || v === "plane" || v === "blimp" || v === "billboard" || v === "rooftop_sign" || v === "led_wrap") result.vehicle = v;
  const src = params.get("source");
  if (src === "all" || src === "paid" || src === "manual") result.source = src;
  const q = params.get("q");
  if (q) result.q = q;
  const sort = params.get("sort");
  if (sort) result.sort = sort as SortKey;
  const dir = params.get("dir");
  if (dir === "asc" || dir === "desc") result.dir = dir;
  return result;
}

function filtersToParams(filters: AdsFilters): string {
  const params = new URLSearchParams();
  if (filters.period !== DEFAULTS.period) params.set("period", filters.period);
  if (filters.status !== DEFAULTS.status) params.set("status", filters.status);
  if (filters.vehicle !== DEFAULTS.vehicle) params.set("vehicle", filters.vehicle);
  if (filters.source !== DEFAULTS.source) params.set("source", filters.source);
  if (filters.q) params.set("q", filters.q);
  if (filters.sort !== DEFAULTS.sort) params.set("sort", filters.sort);
  if (filters.dir !== DEFAULTS.dir) params.set("dir", filters.dir);
  const str = params.toString();
  return str ? `?${str}` : "";
}

export function useAdsUrlState() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const initializedRef = useRef(false);

  // Build current filters from URL (or localStorage fallback on first load)
  const filters: AdsFilters = useMemo(() => {
    const fromUrl = parseParams(searchParams);
    const hasUrlParams = Object.keys(fromUrl).length > 0;

    if (hasUrlParams || initializedRef.current) {
      initializedRef.current = true;
      return { ...DEFAULTS, ...fromUrl };
    }

    // First load with empty URL: check localStorage fallback
    const saved = loadLocalStorage();
    if (saved) {
      initializedRef.current = true;
      return { ...DEFAULTS, ...saved };
    }

    initializedRef.current = true;
    return { ...DEFAULTS };
  }, [searchParams]);

  // Sync localStorage fallback to URL on first load
  useEffect(() => {
    const fromUrl = parseParams(searchParams);
    const hasUrlParams = Object.keys(fromUrl).length > 0;
    if (!hasUrlParams) {
      const saved = loadLocalStorage();
      if (saved) {
        const merged = { ...DEFAULTS, ...saved };
        const qs = filtersToParams(merged);
        if (qs) {
          router.replace(`/admin/ads${qs}`);
        }
      }
    }
    // Only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setFilter = useCallback(
    <K extends keyof AdsFilters>(key: K, value: AdsFilters[K]) => {
      const next = { ...filters, [key]: value };

      // Persist to localStorage
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}

      // Debounce search query, immediate for everything else
      if (key === "q") {
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          router.replace(`/admin/ads${filtersToParams(next)}`);
        }, 300);
      } else {
        router.replace(`/admin/ads${filtersToParams(next)}`);
      }
    },
    [filters, router],
  );

  const handleSort = useCallback(
    (key: SortKey) => {
      if (filters.sort === key) {
        setFilter("dir", filters.dir === "asc" ? "desc" : "asc");
      } else {
        const next = { ...filters, sort: key, dir: "desc" as SortDir };
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {}
        router.replace(`/admin/ads${filtersToParams(next)}`);
      }
    },
    [filters, setFilter, router],
  );

  return { filters, setFilter, handleSort };
}
