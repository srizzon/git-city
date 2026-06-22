/**
 * Client-side fetch for the pre-computed city snapshot.
 *
 * Fetches `city-data/snapshot.json` straight from Supabase storage (CDN in
 * prod). If that fails — typically a 404 on a fresh environment where the
 * bucket/snapshot doesn't exist yet — it asks the server to generate the
 * snapshot (`/api/city/ensure-snapshot`) and retries once. This way a brand-new
 * local/staging/preview environment renders the city without anyone manually
 * triggering the snapshot cron.
 *
 * Returns the parsed snapshot ({ developers, stats, _d }) or null on failure;
 * callers fall back to their existing per-page paths when null.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchCitySnapshot(): Promise<any | null> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const path = "storage/v1/object/public/city-data/snapshot.json";

  async function get(cacheBust: number) {
    const res = await fetch(`${base}/${path}?v=${cacheBust}`);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const ds = new DecompressionStream("gzip");
    const stream = new Blob([buf]).stream().pipeThrough(ds);
    return new Response(stream).json();
  }

  try {
    // Aligned with the cron cadence (changes every 5 min) for CDN cache reuse.
    const snapshot = await get(Math.floor(Date.now() / 300_000));
    if (snapshot) return snapshot;

    // Snapshot missing — self-heal: have the server build it, then retry once.
    await fetch("/api/city/ensure-snapshot");
    return await get(Date.now());
  } catch {
    return null;
  }
}
