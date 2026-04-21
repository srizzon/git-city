// Base URL for Cozy/arcade runtime assets.
// Dev: falls back to "/cozy" (served from public/cozy/).
// Prod: set NEXT_PUBLIC_COZY_BASE_URL to the Supabase Storage public URL, e.g.
//   https://<project>.supabase.co/storage/v1/object/public/arcade-assets
export const COZY_BASE = process.env.NEXT_PUBLIC_COZY_BASE_URL || "/cozy";

/** Build a full URL for a cozy asset. Path may or may not start with "/". */
export function cozyUrl(path: string): string {
  const p = path.startsWith("/") ? path.slice(1) : path;
  return `${COZY_BASE}/${p}`;
}
