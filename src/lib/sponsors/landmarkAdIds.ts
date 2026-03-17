/**
 * Fetches and caches the slug → sky_ads ID map for sponsored landmarks.
 * Called once on page load, cached in memory for the session.
 */

let cache: Record<string, string> | null = null;
let fetching: Promise<Record<string, string>> | null = null;

export async function getLandmarkAdIds(): Promise<Record<string, string>> {
  if (cache) return cache;
  if (fetching) return fetching;

  fetching = fetch("/api/ads/landmark-ids")
    .then((res) => (res.ok ? res.json() : {}))
    .then((data: Record<string, string>) => {
      cache = data;
      fetching = null;
      return data;
    })
    .catch(() => {
      fetching = null;
      return {};
    });

  return fetching;
}

export function getLandmarkAdId(slug: string): string | undefined {
  return cache?.[slug];
}
