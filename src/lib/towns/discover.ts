import "server-only";
import { unstable_cache } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getDevLeagues, getGlobalRanking } from "@/lib/leagues/queries";
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
  yours: boolean;
}

export interface Discover {
  featured: FeaturedTown | null;
  yours: TownCard[];
  rows: Record<RowId, TownCard[]>;
  /** Every listed town, each once: biggest first. */
  all: GridTown[];
}

/** Each town's cover photo and logo, for the grid's cards. */
async function loadCovers(ids: string[]): Promise<Map<string, { cover: string | null; logoUrl: string | null }>> {
  const out = new Map<string, { cover: string | null; logoUrl: string | null }>();
  if (ids.length === 0) return out;
  const { data } = await getSupabaseAdmin()
    .from("league_cities")
    .select("league_id, cover_path, logo:league_assets!league_cities_logo_asset_id_fkey(path, status)")
    .in("league_id", ids)
    .returns<{ league_id: string; cover_path: string | null; logo: { path: string; status: string } | null }[]>();
  for (const c of data ?? []) {
    out.set(c.league_id, {
      cover: c.cover_path ? leagueAssetUrl(c.cover_path) : null,
      logoUrl: c.logo?.status === "active" ? leagueAssetUrl(c.logo.path) : null,
    });
  }
  return out;
}

async function loadCatalog(): Promise<TownEntry[]> {
  const { data, error } = await getSupabaseAdmin().rpc("town_catalog");
  // PGRST202: a database without migration 141 yet (staging before its push).
  if (error?.code === "PGRST202") return loadBasicCatalog();
  if (error) throw error;
  return ((data ?? []) as (Omit<TownEntry, "id"> & { league_id: string })[]).map(({ league_id, ...t }) => ({
    ...t,
    id: league_id,
  }));
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

const cachedCatalog = unstable_cache(loadCatalog, ["towns-catalog"], { revalidate: 300 });

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

const getSharedRows = unstable_cache(
  async () => {
    const [towns, ranking] = await Promise.all([getTownCatalog(), getGlobalRanking()]);
    const now = new Date();
    const staff = process.env.TOWN_OF_WEEK_OVERRIDE?.trim().toLowerCase() || null;
    const pick = pickFeatured(towns, now, staff);
    const companies = ranking.rows.filter((r) => r.rank !== null).map((r) => r.league_id);
    const rest = towns
      .filter((t) => t.buildings > 0)
      .sort((a, b) => b.buildings - a.buildings || b.visitors_7d - a.visitors_7d || a.slug.localeCompare(b.slug))
      .slice(0, 60);
    const covers = await loadCovers(rest.map((t) => t.id)).catch((err) => {
      console.error("[towns] covers failed:", err);
      return new Map<string, { cover: string | null; logoUrl: string | null }>();
    });
    return {
      featured: pick
        ? { ...toCard(pick.town, now), id: pick.town.id, totalBuildings: pick.town.buildings, reason: pick.reason }
        : null,
      rows: selectRows(towns, { now, featuredId: pick?.town.id ?? null, companies }),
      all: rest.map((t) => ({ ...toCard(t, now), kind: t.kind, cover: covers.get(t.id)?.cover ?? null, logoUrl: covers.get(t.id)?.logoUrl ?? null })),
    };
  },
  ["towns-discover-v3"],
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
