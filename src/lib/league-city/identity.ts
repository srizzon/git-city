// ─── League identity ────────────────────────────────────────
// Shared constants for the league's look: sky, hill sign, logo. Objects point
// at "the league logo", never at a file: replacing the logo updates every
// billboard, flag and floor at once.

import type { SignSide } from "./types";

export const LEAGUE_ASSETS_BUCKET = "league-assets";

/** Labels for THEMES by index (components/city/theme). */
export const SKY_LABELS = ["Emerald", "Midnight", "Sunset", "Neon"] as const;
export const DEFAULT_SKY = 1;
/** Settings swatches (top → horizon), from each theme's sky stops. */
export const SKY_SWATCHES = [
  ["#000804", "#003c1c", "#004828"],
  ["#020814", "#0c2040", "#102850"],
  ["#1c0e30", "#a05068", "#f0b070"],
  ["#100028", "#380650", "#500860"],
] as const;

export const SIGN_SIDES: readonly SignSide[] = ["north", "east", "west"];

/** Uploaded logos: PNG or JPG, never SVG (scripts). */
export const LOGO_MAX_BYTES = 1024 * 1024;
export const LOGO_TYPES_ALLOWED = ["image/png", "image/jpeg"] as const;
/** Pixelized to this square and palette. */
export const LOGO_SIZE = 64;
export const LOGO_COLORS = 16;

export function leagueAssetUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return `${base}/storage/v1/object/public/${LEAGUE_ASSETS_BUCKET}/${path}`;
}

/** First visit intro, per league. */
export function introSeenKey(slug: string): string {
  return `gc:town-intro:${slug}`;
}
