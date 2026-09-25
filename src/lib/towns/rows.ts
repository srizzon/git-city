import { townDisplayName } from "./names";

/** One town as the catalog returns it (town_catalog, migration 141). */
export interface TownEntry {
  id: string;
  slug: string;
  name: string;
  kind: "company" | "custom";
  github_org: string | null;
  created_at: string;
  featured_week: string | null;
  buildings: number;
  ops_7d: number;
  visitors_7d: number;
  visitors_prev: number;
}

export interface TownCard {
  slug: string;
  name: string;
  /** Null under 10: the card never says "3 buildings" or "0 visitors". */
  buildings: number | null;
  verified: boolean;
  tag: "trending" | "new" | null;
}

export type RowId = "trending" | "new" | "updated" | "companies" | "biggest";

export const ROW_LIMIT = 20;
/** A town shows in at most this many rows, the featured spot included. */
export const MAX_ROWS_PER_TOWN = 2;
export const TRENDING_MIN_VISITORS = 5;
export const NEW_DAYS = 14;
export const NEW_MIN_BUILDINGS = 3;
export const UPDATED_MIN_OPS = 10;
export const SURPRISE_MIN_BUILDINGS = 5;

export function displayCount(n: number): number | null {
  return n >= 10 ? n : null;
}

export function isTrending(t: TownEntry): boolean {
  return t.visitors_7d >= TRENDING_MIN_VISITORS && t.visitors_7d > t.visitors_prev;
}

export function isNew(t: TownEntry, now: Date): boolean {
  return now.getTime() - new Date(t.created_at).getTime() <= NEW_DAYS * 86_400_000 && t.buildings >= NEW_MIN_BUILDINGS;
}

export function toCard(t: TownEntry, now: Date): TownCard {
  return {
    slug: t.slug,
    name: townDisplayName(t.name),
    buildings: displayCount(t.buildings),
    verified: t.kind === "company",
    tag: isTrending(t) ? "trending" : isNew(t, now) ? "new" : null,
  };
}

/** Monday (UTC) of the week `d` falls in, as YYYY-MM-DD. */
export function mondayOf(d: Date): string {
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  m.setUTCDate(m.getUTCDate() - ((m.getUTCDay() + 6) % 7));
  return m.toISOString().slice(0, 10);
}

export type FeaturedReason = "week" | "staff" | "biggest";

/**
 * The live town at the top of Discover, never empty while any town has a
 * building: Town of the week (this week's pick, else the latest past one),
 * else the staff pick (TOWN_OF_WEEK_OVERRIDE slug), else the biggest town.
 */
export function pickFeatured(
  towns: TownEntry[],
  now: Date,
  staffSlug: string | null = null,
): { town: TownEntry; reason: FeaturedReason } | null {
  const built = towns.filter((t) => t.buildings > 0);
  const thisWeek = mondayOf(now);
  const week = built
    .filter((t) => t.featured_week && t.featured_week <= thisWeek)
    .sort((a, b) => (b.featured_week ?? "").localeCompare(a.featured_week ?? ""))[0];
  if (week) return { town: week, reason: "week" };
  const staff = staffSlug ? built.find((t) => t.slug === staffSlug) : undefined;
  if (staff) return { town: staff, reason: "staff" };
  const biggest = [...built].sort((a, b) => b.buildings - a.buildings || a.slug.localeCompare(b.slug))[0];
  return biggest ? { town: biggest, reason: "biggest" } : null;
}

/**
 * Discover's shared rows, in priority order. Each town lands in at most two
 * rows (the featured spot counts as one); a lower row skips a town that
 * already used its two. `companies` is the ranked company order (ids).
 */
export function selectRows(
  towns: TownEntry[],
  opts: { now: Date; featuredId: string | null; companies: string[] },
): Record<RowId, TownCard[]> {
  const { now } = opts;
  const byId = new Map(towns.map((t) => [t.id, t]));
  const used = new Map<string, number>();
  if (opts.featuredId) used.set(opts.featuredId, 1);

  const take = (candidates: TownEntry[]): TownCard[] => {
    const out: TownCard[] = [];
    for (const t of candidates) {
      if (out.length >= ROW_LIMIT) break;
      const n = used.get(t.id) ?? 0;
      if (n >= MAX_ROWS_PER_TOWN) continue;
      used.set(t.id, n + 1);
      out.push(toCard(t, now));
    }
    return out;
  };

  const trending = take(
    towns
      .filter(isTrending)
      .sort((a, b) => b.visitors_7d - b.visitors_prev - (a.visitors_7d - a.visitors_prev) || b.visitors_7d - a.visitors_7d),
  );
  const fresh = take(
    towns.filter((t) => isNew(t, now)).sort((a, b) => b.created_at.localeCompare(a.created_at)),
  );
  const updated = take(
    towns.filter((t) => t.ops_7d >= UPDATED_MIN_OPS).sort((a, b) => b.ops_7d - a.ops_7d),
  );
  const companies = take(
    opts.companies.map((id) => byId.get(id)).filter((t): t is TownEntry => !!t && t.kind === "company"),
  );
  const biggest = take(
    towns.filter((t) => t.buildings > 0).sort((a, b) => b.buildings - a.buildings || a.slug.localeCompare(b.slug)),
  );
  return { trending, new: fresh, updated, companies, biggest };
}

/** Towns Surprise me can land in. */
export function surpriseCandidates(towns: TownEntry[]): TownEntry[] {
  return towns.filter((t) => t.buildings >= SURPRISE_MIN_BUILDINGS);
}
