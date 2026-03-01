import type {
  CityBuilding,
  CityPlaza,
  CityDecoration,
  CityRiver,
  CityBridge,
  DistrictZone,
} from "@/lib/github";

interface CityCache {
  buildings: CityBuilding[];
  plazas: CityPlaza[];
  decorations: CityDecoration[];
  river: CityRiver | null;
  bridges: CityBridge[];
  districtZones: DistrictZone[];
  stats: { total_developers: number; total_contributions: number };
  timestamp: number;
}

// Module-level singleton — survives Next.js client-side navigation
let cache: CityCache | null = null;

const MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

export function getCityCache(): CityCache | null {
  if (!cache) return null;
  if (Date.now() - cache.timestamp > MAX_AGE_MS) {
    cache = null;
    return null;
  }
  return cache;
}

export function setCityCache(data: Omit<CityCache, "timestamp">) {
  cache = { ...data, timestamp: Date.now() };
}

export function clearCityCache() {
  cache = null;
}
