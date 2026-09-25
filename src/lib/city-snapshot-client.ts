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
import { decodeSnapshotV2, SNAPSHOT_V2_PATH, type SnapshotV2 } from "./city-snapshot-format";
import type { CityLayout, LayoutNorms, SFMapAsset } from "./github";
import type { CityWorkerRequest } from "./city-load.worker";

const STORAGE_PREFIX = "storage/v1/object/public/city-data";

// Aligned with the cron cadence (vercel.json: every 10 min) for CDN cache reuse.
const cacheBucket = () => Math.floor(Date.now() / 600_000);

export function snapshotUrl(path: string, cacheBust: number = cacheBucket()): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/${STORAGE_PREFIX}/${path}?v=${cacheBust}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function gunzipJson(buf: ArrayBuffer): Promise<any> {
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).json();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getGzipJson(url: string): Promise<any | null> {
  const res = await fetch(url);
  if (!res.ok) return null;
  return gunzipJson(await res.arrayBuffer());
}

// San Francisco map asset (baked from OSM). Fetched once, shared by every
// layout recompute. Falls back to undefined (procedural layout) if missing.
let sfMapPromise: Promise<SFMapAsset | undefined> | null = null;
export function loadSFMap(): Promise<SFMapAsset | undefined> {
  if (!sfMapPromise) {
    sfMapPromise = fetch("/maps/sf.json")
      .then((r) => (r.ok ? r.json() : undefined))
      .catch(() => undefined);
  }
  return sfMapPromise;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchCitySnapshot(): Promise<any | null> {
  try {
    const snapshot = await getGzipJson(snapshotUrl("snapshot.json"));
    if (snapshot) return snapshot;

    // Snapshot missing — self-heal: have the server build it, then retry once.
    await fetch("/api/city/ensure-snapshot");
    return await getGzipJson(snapshotUrl("snapshot.json", Date.now()));
  } catch {
    return null;
  }
}

export interface HomeSnapshot {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  developers: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stats: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _d: any[];
  /** City-wide layout maxima (v2 only; v1 carries every developer instead). */
  norms?: LayoutNorms;
  /** SF layout computed in the worker (without `sfMap`, which the caller has). */
  layout?: Omit<CityLayout, "sfMap">;
}

const LOADOUT_OVERRIDE_KEY = "gitcity:loadout_override";
const LOADOUT_OVERRIDE_TTL_MS = 10 * 60 * 1000;

/** Loadout just saved in the shop, applied before the snapshot catches up. */
function readLoadoutOverride(): CityWorkerRequest["loadoutOverride"] {
  try {
    const raw = localStorage.getItem(LOADOUT_OVERRIDE_KEY);
    if (!raw) return null;
    const { developerId, loadout, ts } = JSON.parse(raw);
    return Date.now() - ts < LOADOUT_OVERRIDE_TTL_MS ? { developerId, loadout } : null;
  } catch {
    return null;
  }
}

const WORKER_TIMEOUT_MS = 20_000;

function buildInWorker(snapshot: ArrayBuffer, sf: SFMapAsset): Promise<HomeSnapshot> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./city-load.worker.ts", import.meta.url));
    const done = () => { clearTimeout(timer); worker.terminate(); };
    const timer = setTimeout(() => { done(); reject(new Error("city worker timeout")); }, WORKER_TIMEOUT_MS);
    worker.onmessage = (e) => {
      done();
      if (e.data?.ok) resolve({ ...e.data.snapshot, layout: e.data.layout });
      else reject(new Error(e.data?.error ?? "city worker failed"));
    };
    worker.onerror = (e) => { done(); reject(new Error(e.message || "city worker error")); };
    const msg: CityWorkerRequest = { snapshot, sf, loadoutOverride: readLoadoutOverride() };
    worker.postMessage(msg, [snapshot]);
  });
}

/**
 * Home-page snapshot: the compact v2 file (only placed developers, ~1.4 MB gz),
 * decoded and laid out in a Web Worker. Falls back to decoding on the main
 * thread if the worker fails, and to v1 when v2 isn't there yet (fresh
 * environment, or the first minutes after deploy before the cron wrote it).
 */
export async function fetchHomeSnapshot(): Promise<HomeSnapshot | null> {
  let bytes: ArrayBuffer | null = null;
  try {
    const res = await fetch(snapshotUrl(SNAPSHOT_V2_PATH));
    if (res.ok) bytes = await res.arrayBuffer();
  } catch {
    /* fall through to v1 */
  }
  if (!bytes) return fetchCitySnapshot();

  const sf = typeof Worker !== "undefined" ? await loadSFMap() : undefined;
  if (sf) {
    try {
      // Transfer a copy: the original stays usable for the fallback below.
      return await buildInWorker(bytes.slice(0), sf);
    } catch {
      /* decode on the main thread instead */
    }
  }
  try {
    const v2 = (await gunzipJson(bytes)) as SnapshotV2;
    if (v2?.v === 2) return decodeSnapshotV2(v2);
  } catch {
    /* fall through to v1 */
  }
  return fetchCitySnapshot();
}

// Started as soon as the home bundle evaluates (and preloaded from the HTML),
// so the download overlaps JS parse/hydration instead of following it.
let pending: Promise<HomeSnapshot | null> | null = null;

/** First caller gets the prefetched download; later calls (reloads) fetch fresh. */
export function loadHomeSnapshot(): Promise<HomeSnapshot | null> {
  const p = pending ?? fetchHomeSnapshot();
  pending = null;
  return p;
}

if (typeof window !== "undefined" && window.location.pathname === "/") {
  loadSFMap();
  pending = fetchHomeSnapshot();
}
