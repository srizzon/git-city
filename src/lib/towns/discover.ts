import "server-only";
import { unstable_cache } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getDevLeagues, getGlobalRanking } from "@/lib/leagues/queries";
import type { Viewer } from "@/lib/leagues/service";
import { pickFeatured, selectRows, surpriseCandidates, toCard, type RowId, type TownCard, type TownEntry } from "./rows";

export interface FeaturedTown extends TownCard {
  id: string;
  /** Real count for the hero line; the card rules still hide it under 10. */
  totalBuildings: number;
}

export interface Discover {
  featured: FeaturedTown | null;
  yours: TownCard[];
  rows: Record<RowId, TownCard[]>;
}

async function loadCatalog(): Promise<TownEntry[]> {
  const { data, error } = await getSupabaseAdmin().rpc("town_catalog");
  if (error) throw error;
  return ((data ?? []) as (Omit<TownEntry, "id"> & { league_id: string })[]).map(({ league_id, ...t }) => ({
    ...t,
    id: league_id,
  }));
}

/** Every listed town, shared by Discover, search and Surprise me. 5 minutes. */
export const getTownCatalog = unstable_cache(loadCatalog, ["towns-catalog"], { revalidate: 300 });

const getSharedRows = unstable_cache(
  async () => {
    const [towns, ranking] = await Promise.all([getTownCatalog(), getGlobalRanking()]);
    const now = new Date();
    const featured = pickFeatured(towns, now);
    const companies = ranking.rows.filter((r) => r.rank !== null).map((r) => r.league_id);
    return {
      featured: featured ? { ...toCard(featured, now), id: featured.id, totalBuildings: featured.buildings } : null,
      rows: selectRows(towns, { now, featuredId: featured?.id ?? null, companies }),
    };
  },
  ["towns-discover"],
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
  return { ...shared, yours };
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
