import { THEMES, type CityTheme } from "@/components/city/theme";

// Towns use Midnight with more light: brighter ambient and sky, a lighter
// ground and sidewalks, so the city reads at a glance. Same buildings and
// window colors as the main city.
const MIDNIGHT = THEMES[1];
const TOWN_MIDNIGHT: CityTheme = {
  ...MIDNIGHT,
  fogColor: "#10203a",
  fogNear: 700,
  fogFar: 5000,
  ambientColor: "#6a88d0",
  ambientIntensity: 1.0,
  sunColor: "#a8c0f0",
  sunIntensity: 1.15,
  fillColor: "#5068b0",
  fillIntensity: 0.55,
  hemiSky: "#7aa0d0",
  hemiGround: "#34404e",
  hemiIntensity: 0.95,
  groundColor: "#2f3b50",
  grid1: "#465670",
  grid2: "#3a4860",
  roadMarkingColor: "#b8c4d4",
  sidewalkColor: "#646a7c",
};
// Keys the tuned Midnight's lights and sky (a value of its own, apart from the main city's).
const TOWN_MIDNIGHT_KEY = 11;
export const EXPOSURE = 1.65;
const DEFAULT_SKY = 1; // Midnight

/**
 * The town's sky from settings (THEMES order: Emerald, Midnight, Sunset,
 * Neon). Midnight is the brighter town tuning above; the others are the main
 * city's themes as they are.
 */
export function townTheme(sky: number): { theme: CityTheme; key: number; fx: 0 | 1 | 2 | 3 } {
  // ThemeSkyFX orders its moons and stars Midnight, Sunset, Neon, Emerald.
  const fx = ([3, 0, 1, 2] as const)[sky] ?? 0;
  if (sky === DEFAULT_SKY || !THEMES[sky]) return { theme: TOWN_MIDNIGHT, key: TOWN_MIDNIGHT_KEY, fx: 0 };
  return { theme: THEMES[sky], key: sky, fx };
}
