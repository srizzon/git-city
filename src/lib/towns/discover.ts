import "server-only";
import { unstable_cache } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getDevLeagues, getTownRanking, type TownRankingRow } from "@/lib/leagues/queries";
import type { Viewer } from "@/lib/leagues/service";
import { leagueAssetUrl } from "@/lib/league-city/identity";
import {
  pickFeatured,
  selectRows,
  surpriseCandidates,
  toCard,
  type FeaturedReason,
  type RowId,
  type TownCard,
  type TownEntry,
} from "./rows";

export interface FeaturedTown extends TownCard {
  id: string;
  /** Real count for the hero line; the card rules still hide it under 10. */
  totalBuildings: number;
  reason: FeaturedReason;
}

/** A card in the one Discover grid: the town, its picture, and what it is to the viewer. */
export interface GridTown extends TownCard {
  kind: "company" | "custom";
  /** The photo of the city (see lib/towns/cover); null until one is taken. */
  cover: string | null;
  logoUrl: string | null;
  /** The town's sky (THEMES index), for the card before it has a photo. */
  sky: number;
  /** A country town's ISO code (BR), else null. */
  country: string | null;
  yours: boolean;
}

/** A row of the "This week" ranking: the town's place and its score. */
export interface RankedTown extends TownRankingRow {
  logoUrl: string | null;
}

export interface Discover {
  featured: FeaturedTown | null;
  /** This week's town ranking (3+ members coding), best first, top 10. */
  week: RankedTown[];
  yours: TownCard[];
  rows: Record<RowId, TownCard[]>;
  /** Every listed town, each once: biggest first. */
  all: GridTown[];
}

/** Each town's cover photo and logo, for the grid's cards. */
type CoverInfo = { cover: string | null; logoUrl: string | null; sky: number; country: string | null };

async function loadCovers(ids: string[]): Promise<Map<string, CoverInfo>> {
  const out = new Map<string, CoverInfo>();
  if (ids.length === 0) return out;
  const sb = getSupabaseAdmin();
  const [{ data }, { data: leagues }] = await Promise.all([
    sb
      .from("league_cities")
      .select("league_id, sky, cover_path, logo:league_assets!league_cities_logo_asset_id_fkey(path, status)")
      .in("league_id", ids)
      .returns<{ league_id: string; sky: number; cover_path: string | null; logo: { path: string; status: string } | null }[]>(),
    sb.from("leagues").select("id, slug, country, map").in("id", ids),
  ]);
  const byId = new Map((leagues ?? []).map((l) => [l.id as string, l as { slug: string; country: string | null; map: string | null }]));
  for (const c of data ?? []) {
    const l = byId.get(c.league_id);
    out.set(c.league_id, {
      // The Brasil map has no lot city to photograph: its card draws the live map.
      cover: l?.map === "brasil" ? `/town/${l.slug}/brasil-cover` : c.cover_path ? leagueAssetUrl(c.cover_path) : null,
      logoUrl: c.logo?.status === "active" ? leagueAssetUrl(c.logo.path) : null,
      sky: c.sky,
      country: l?.country ?? null,
    });
  }
  return out;
}

async function loadCatalog(): Promise<TownEntry[]> {
  const { data, error } = await getSupabaseAdmin().rpc("town_catalog");
  // PGRST202: a database without migration 141 yet (staging before its push).
  if (error?.code === "PGRST202") return withBrasilResidents(await loadBasicCatalog());
  if (error) throw error;
  return withBrasilResidents(
    ((data ?? []) as (Omit<TownEntry, "id"> & { league_id: string })[]).map(({ league_id, ...t }) => ({
      ...t,
      id: league_id,
    })),
  );
}

/** A Brasil map town's buildings are its residents, not the lot objects it had before the map. */
async function withBrasilResidents(towns: TownEntry[]): Promise<TownEntry[]> {
  const sb = getSupabaseAdmin();
  const { data: maps } = await sb.from("leagues").select("id").eq("map", "brasil");
  if (!maps?.length) return towns;
  const counts = new Map<string, number>();
  await Promise.all(
    maps.map(async ({ id }) => {
      const { count } = await sb.from("brasil_residents").select("developer_id", { count: "exact", head: true }).eq("league_id", id);
      counts.set(id as string, count ?? 0);
    }),
  );
  return towns.map((t) => (counts.has(t.id) ? { ...t, buildings: counts.get(t.id)! } : t));
}

/** Towns and building counts only, no visits or edits: before migration 141. */
async function loadBasicCatalog(): Promise<TownEntry[]> {
  const sb = getSupabaseAdmin();
  const [{ data: leagues, error }, { data: objects }] = await Promise.all([
    sb.from("leagues").select("id, slug, name, kind, github_org, created_at").eq("hidden", false),
    sb.from("league_objects").select("league_id").eq("kind", "building").limit(50_000),
  ]);
  if (error) throw error;
  const buildings = new Map<string, number>();
  for (const o of objects ?? []) buildings.set(o.league_id, (buildings.get(o.league_id) ?? 0) + 1);
  return (leagues ?? []).map((l) => ({
    ...(l as Pick<TownEntry, "slug" | "name" | "kind" | "github_org" | "created_at">),
    id: l.id as string,
    featured_week: null,
    buildings: buildings.get(l.id as string) ?? 0,
    ops_7d: 0,
    visitors_7d: 0,
    visitors_prev: 0,
  }));
}

const cachedCatalog = unstable_cache(loadCatalog, ["towns-catalog-v2"], { revalidate: 300 });

/**
 * Every listed town, shared by Discover, search and Surprise me. 5 minutes.
 * A failed read isn't cached and shows no towns rather than an error page.
 */
export async function getTownCatalog(): Promise<TownEntry[]> {
  try {
    return await cachedCatalog();
  } catch (err) {
    console.error("[towns] catalog failed:", err);
    return [];
  }
}

const WEEK_LIMIT = 10;

const getSharedRows = unstable_cache(
  async () => {
    const [towns, ranking] = await Promise.all([getTownCatalog(), getTownRanking()]);
    const now = new Date();
    const staff = process.env.TOWN_OF_WEEK_OVERRIDE?.trim().toLowerCase() || null;
    const pick = pickFeatured(towns, now, staff);
    const ranked = ranking.rows.map((r) => r.league_id);
    const top = ranking.rows.slice(0, WEEK_LIMIT);
    const rest = towns
      .filter((t) => t.buildings > 0)
      .sort((a, b) => b.buildings - a.buildings || b.visitors_7d - a.visitors_7d || a.slug.localeCompare(b.slug))
      .slice(0, 60);
    const covers = await loadCovers([...new Set([...rest.map((t) => t.id), ...top.map((r) => r.league_id)])]).catch((err) => {
      console.error("[towns] covers failed:", err);
      return new Map<string, CoverInfo>();
    });
    return {
      featured: pick
        ? { ...toCard(pick.town, now), id: pick.town.id, totalBuildings: pick.town.buildings, reason: pick.reason }
        : null,
      week: top.map((r) => ({ ...r, logoUrl: covers.get(r.league_id)?.logoUrl ?? null })),
      rows: selectRows(towns, { now, featuredId: pick?.town.id ?? null, ranked }),
      all: rest.map((t) => {
        const c = covers.get(t.id);
        return { ...toCard(t, now), kind: t.kind, cover: c?.cover ?? null, logoUrl: c?.logoUrl ?? null, sky: c?.sky ?? 1, country: c?.country ?? null };
      }),
    };
  },
  ["towns-discover-v8"],
  { revalidate: 300 },
);

export async function getDiscover(viewer: Viewer | null): Promise<Discover> {
  const [shared, mine, towns] = await Promise.all([
    getSharedRows(),
    viewer ? getDevLeagues(viewer.id) : Promise.resolve([]),
    viewer ? getTownCatalog() : Promise.resolve([]),
  ]);
  const bySlug = new Map(towns.map((t) => [t.slug, t]));
  const now = new Date();
  const yours = mine
    .map((m) => bySlug.get(m.slug))
    .filter((t): t is TownEntry => !!t)
    .map((t) => toCard(t, now));
  const mySlugs = new Set(yours.map((c) => c.slug));
  return { ...shared, yours, all: shared.all.map((c) => ({ ...c, yours: mySlugs.has(c.slug) })) };
}

/** Town name or GitHub org, case-insensitive, up to 10. */
export async function searchTowns(q: string): Promise<TownCard[]> {
  const needle = q.trim().toLowerCase();
  if (needle.length < 2) return [];
  const now = new Date();
  const towns = await getTownCatalog();
  return towns
    .filter((t) => t.name.toLowerCase().includes(needle) || (t.github_org ?? "").includes(needle))
    .sort((a, b) => Number(b.name.toLowerCase().startsWith(needle)) - Number(a.name.toLowerCase().startsWith(needle)) || b.buildings - a.buildings)
    .slice(0, 10)
    .map((t) => toCard(t, now));
}

export async function surpriseTown(): Promise<string | null> {
  const pool = surpriseCandidates(await getTownCatalog());
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)].slug;
}
