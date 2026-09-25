import { NextRequest, NextResponse } from "next/server";
import { gzipSync } from "zlib";
import { getSupabaseAdmin } from "@/lib/supabase";
import { buildDropsArray, CITY_DEV_COLUMNS, loadCityExtras, mergeCityExtras } from "@/lib/city-extras";
import { selectPlacedDevelopers, type CityLot, type DeveloperRecord, type SFMapAsset } from "@/lib/github";
import { seedLotsFromLayout } from "@/lib/city-sf-layout";
import { computeLayoutNorms } from "@/lib/city-layout-core";
import { encodeSnapshotV2, SNAPSHOT_V2_PATH } from "@/lib/city-snapshot-format";
import sfMapJson from "../../../../../public/maps/sf.json";

export const maxDuration = 300;

const STORAGE_BUCKET = "city-data";
const STORAGE_PATH = "snapshot.json";
const PAGE_SIZE = 1000; // Supabase PostgREST caps at 1000 rows per request
const SEED_BATCH = 4000;
const LOT_COLUMNS = "id, x, z, max_w, max_d, downtown";

type LotRow = { id: number; x: number; z: number; max_w: number; max_d: number; downtown: boolean };
type DevRow = { id: number; rank: number; lot_id: number | null } & Record<string, unknown>;

/**
 * Keyset-paginate a table by its integer `id`. OFFSET pagination re-scans every
 * skipped row, and on `developers` (~88k rows) the deep pages took 7-8s each —
 * right at the statement timeout — which failed the whole snapshot.
 */
async function fetchAllById<T extends { id: number }>(
  sb: ReturnType<typeof getSupabaseAdmin>,
  table: string,
  select: string,
): Promise<T[]> {
  const all: T[] = [];
  let lastId = 0;
  while (true) {
    const { data, error } = await sb
      .from(table)
      .select(select)
      .gt("id", lastId)
      .order("id", { ascending: true })
      .limit(PAGE_SIZE);
    if (error) throw new Error(`fetchAllById ${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    all.push(...(data as unknown as T[]));
    if (data.length < PAGE_SIZE) break;
    lastId = (data[data.length - 1] as unknown as T).id;
  }
  return all;
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  const sb = getSupabaseAdmin();

  // Ensure public bucket exists (idempotent)
  await sb.storage.createBucket(STORAGE_BUCKET, { public: true }).catch(() => {});

  const loadDevs = () =>
    fetchAllById<DevRow>(sb, "developers", CITY_DEV_COLUMNS).then((rows) =>
      // Snapshot order stays rank ascending (nulls last), as before.
      rows.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity)),
    );

  // A failed lots read falls back to the greedy trim below instead of failing the snapshot.
  const loadLots = () => fetchAllById<LotRow>(sb, "city_lots", LOT_COLUMNS).catch((err: Error) => {
    console.error(err.message);
    return null;
  });

  // Fetch everything in parallel
  let [devs, lots] = await Promise.all([loadDevs(), loadLots()]);

  // First run after migration 146 (or a fresh environment): freeze today's
  // layout into city_lots, then read developers and lots again.
  let seeded = 0;
  if (lots && lots.length === 0 && devs.length > 0) {
    const seed = seedLotsFromLayout(devs as unknown as DeveloperRecord[], sfMapJson as unknown as SFMapAsset);
    for (let i = 0; i < seed.length; i += SEED_BATCH) {
      const { data, error } = await sb.rpc("seed_city_lots", { p_map: "sf", p_lots: seed.slice(i, i + SEED_BATCH) });
      if (error) return NextResponse.json({ error: `seed_city_lots: ${error.message}` }, { status: 500 });
      seeded += (data as number) ?? 0;
    }
    [devs, lots] = await Promise.all([loadDevs(), loadLots()]);
  }

  // Each developer carries their lot, so clients place buildings instead of
  // computing a layout.
  const lotById = new Map<number, CityLot>(
    (lots ?? []).map((l) => [l.id, { x: l.x, z: l.z, w: l.max_w, d: l.max_d, downtown: l.downtown }]),
  );
  for (const d of devs) {
    const lot = d.lot_id != null ? lotById.get(d.lot_id) : undefined;
    (d as Record<string, unknown>).lot = lot ?? null;
    delete (d as Record<string, unknown>).lot_id;
  }

  const [extras, activeDropsResult, statsResult] = await Promise.all([
    loadCityExtras(sb, "all"),
    sb
      .from("building_drops")
      .select("id, building_id, rarity, points, max_pulls, pull_count, expires_at")
      .gt("expires_at", new Date().toISOString()),
    sb.from("city_stats").select("*").eq("id", 1).single(),
  ]);

  const _d = buildDropsArray(devs, activeDropsResult.data ?? []);
  const developers = mergeCityExtras(devs, extras);

  const stats = statsResult.data ?? { total_developers: 0, total_contributions: 0 };
  const generatedAt = new Date().toISOString();
  const snapshot = JSON.stringify({ developers, _d, stats, generated_at: generatedAt });

  // v2: only the developers with a building, column-encoded (~1 MB gz vs
  // ~9 MB). With lots that is exactly the developers holding one; without
  // lots (seeding failed) it falls back to trimming by the greedy layout. The
  // home page reads this; v1 stays for the wallpaper page and old bundles.
  const placed = lotById.size > 0
    ? {
        devs: developers.filter((d) => (d as Record<string, unknown>).lot),
        norms: computeLayoutNorms(developers as unknown as DeveloperRecord[]),
      }
    : selectPlacedDevelopers(
        developers as unknown as DeveloperRecord[],
        sfMapJson as unknown as SFMapAsset,
      );
  const compressedV2 = gzipSync(
    Buffer.from(
      JSON.stringify(
        encodeSnapshotV2(placed.devs as unknown as Record<string, unknown>[], {
          norms: placed.norms,
          stats,
          _d,
          generated_at: generatedAt,
        }),
      ),
    ),
    { level: 9 },
  );

  const compressed = gzipSync(Buffer.from(snapshot));

  // Upload gzip bytes directly via Supabase SDK (avoids Content-Encoding issues).
  // The frontend decompresses with DecompressionStream.
  const { error: uploadError } = await sb.storage
    .from(STORAGE_BUCKET)
    .upload(STORAGE_PATH, compressed, {
      contentType: "application/gzip",
      upsert: true,
      cacheControl: "no-cache",
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  // Clients key the URL by 5-minute bucket, so a 5-minute browser/CDN cache is
  // safe and lets reloads within the window skip the download entirely.
  const { error: uploadErrorV2 } = await sb.storage
    .from(STORAGE_BUCKET)
    .upload(SNAPSHOT_V2_PATH, compressedV2, {
      contentType: "application/gzip",
      upsert: true,
      cacheControl: "300",
    });

  if (uploadErrorV2) {
    return NextResponse.json({ error: uploadErrorV2.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    developers: developers.length,
    size_kb: Math.round(compressed.length / 1024),
    uncompressed_kb: Math.round(snapshot.length / 1024),
    v2_developers: placed.devs.length,
    lots: lotById.size,
    lots_seeded: seeded,
    v2_size_kb: Math.round(compressedV2.length / 1024),
    duration_ms: Date.now() - started,
  });
}
