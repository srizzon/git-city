import { getSupabaseAdmin } from "@/lib/supabase";
import type { Cosmetic, CosmeticSet, CosmeticSeason, CosmeticSlot, RenderKind, RenderSpec, CosmeticRarity, ShopSection } from "./types";

// ─── Catalog query layer ──────────────────────────────────────────────────
// The store renders itself from a parameterised query over the catalog, never
// by loading the whole table. Keyset pagination on (sort_order, id) keeps it
// O(page) regardless of catalog size — the Roblox CatalogPages pattern. All
// filtering happens in Postgres against the migration-101 indexes.

// The catalog lives in `items`; its slot column is historically named `zone`.
const CATALOG_COLUMNS =
  "id,name,description,zone,shop_section,set_id,season_id,rarity,tags,render_kind,render_spec,thumbnail_url,sort_order,price_pixels,price_usd_cents,price_brl_cents,pixels_only,available_from,available_until,max_quantity,is_exclusive,is_active,created_at";

interface ItemRow {
  id: string;
  name: string;
  description: string | null;
  zone: string | null;
  shop_section: string | null;
  set_id: string | null;
  season_id: string | null;
  rarity: string | null;
  tags: string[] | null;
  render_kind: string | null;
  render_spec: RenderSpec | null;
  thumbnail_url: string | null;
  sort_order: number | null;
  price_pixels: number | null;
  price_usd_cents: number | null;
  price_brl_cents: number | null;
  pixels_only: boolean | null;
  available_from: string | null;
  available_until: string | null;
  max_quantity: number | null;
  is_exclusive: boolean | null;
  is_active: boolean | null;
  created_at: string | null;
}

/** Map a raw items row to the Cosmetic domain shape (zone -> slot, defaults). */
export function rowToCosmetic(r: ItemRow): Cosmetic {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    slot: (r.zone as CosmeticSlot | null) ?? null,
    shop_section: (r.shop_section as ShopSection | null) ?? null,
    set_id: r.set_id,
    season_id: r.season_id,
    rarity: (r.rarity as CosmeticRarity | null) ?? null,
    tags: r.tags ?? [],
    render_kind: (r.render_kind as RenderKind | null) ?? "code",
    render_spec: r.render_spec ?? { key: r.id },
    thumbnail_url: r.thumbnail_url,
    sort_order: r.sort_order ?? 0,
    price_pixels: r.price_pixels,
    price_usd_cents: r.price_usd_cents ?? 0,
    price_brl_cents: r.price_brl_cents ?? 0,
    pixels_only: r.pixels_only ?? false,
    available_from: r.available_from,
    available_until: r.available_until,
    max_quantity: r.max_quantity,
    remaining: null,
    is_exclusive: r.is_exclusive ?? false,
    is_active: r.is_active ?? false,
    created_at: r.created_at,
  };
}

/** Fill `remaining` for limited (max_quantity) items by counting sales. One
 *  extra query, and only when the page actually contains limited items. */
async function attachRemaining(items: Cosmetic[]): Promise<void> {
  const limited = items.filter((c) => c.max_quantity != null);
  if (limited.length === 0) return;
  const sb = getSupabaseAdmin();
  const ids = limited.map((c) => c.id);
  const { data } = await sb.from("purchases").select("item_id").in("item_id", ids).eq("status", "completed");
  const sold: Record<string, number> = {};
  for (const row of (data ?? []) as { item_id: string }[]) sold[row.item_id] = (sold[row.item_id] ?? 0) + 1;
  for (const c of items) {
    if (c.max_quantity != null) c.remaining = Math.max(0, c.max_quantity - (sold[c.id] ?? 0));
  }
}

export interface CatalogCursor {
  sort_order: number;
  id: string;
}

export interface CatalogFilters {
  section?: string;
  slot?: string;
  set?: string;
  season?: string;
  rarity?: string;
  tags?: string[];
  q?: string;
  /** Restrict to cosmetics buyable right now (active + inside availability window). */
  availableOnly?: boolean;
  cursor?: CatalogCursor | null;
  limit?: number;
}

export interface CatalogPage {
  items: Cosmetic[];
  nextCursor: CatalogCursor | null;
}

/** Opaque base64 cursor shared by the API route and the SSR seed. */
export function encodeCursor(c: CatalogCursor | null): string | null {
  return c ? Buffer.from(JSON.stringify(c)).toString("base64") : null;
}
// Item ids are constrained to this charset (see admin create validation). The
// cursor id is interpolated into a PostgREST `.or()` filter, so we re-validate
// it here — a hand-crafted cursor can't smuggle commas/parens into the query.
const SAFE_ID = /^[a-z0-9_-]{1,64}$/i;
export function decodeCursor(raw: string | null): CatalogCursor | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
    if (Number.isFinite(obj?.sort_order) && typeof obj?.id === "string" && SAFE_ID.test(obj.id)) {
      return { sort_order: obj.sort_order, id: obj.id };
    }
  } catch { /* malformed → start from the beginning */ }
  return null;
}

const MAX_LIMIT = 60;

/** Query one page of the catalog. Stable order (sort_order, id) so the keyset
 *  cursor is exact and there are no dupes/gaps across pages. */
export async function queryCatalog(filters: CatalogFilters = {}): Promise<CatalogPage> {
  const sb = getSupabaseAdmin();
  const limit = Math.min(Math.max(1, filters.limit ?? 24), MAX_LIMIT);

  let q = sb.from("items").select(CATALOG_COLUMNS);

  if (filters.section) q = q.eq("shop_section", filters.section);
  if (filters.slot) q = q.eq("zone", filters.slot);
  if (filters.set) q = q.eq("set_id", filters.set);
  if (filters.season) q = q.eq("season_id", filters.season);
  if (filters.rarity) q = q.eq("rarity", filters.rarity);
  if (filters.tags && filters.tags.length) q = q.contains("tags", filters.tags);
  if (filters.q) q = q.ilike("name", `%${filters.q}%`);

  if (filters.availableOnly) {
    const nowIso = new Date().toISOString();
    q = q
      .eq("is_active", true)
      .or(`available_from.is.null,available_from.lte.${nowIso}`)
      .or(`available_until.is.null,available_until.gte.${nowIso}`);
  }

  // Keyset: rows strictly after the cursor in (sort_order, id) order.
  if (filters.cursor) {
    const { sort_order, id } = filters.cursor;
    q = q.or(`sort_order.gt.${sort_order},and(sort_order.eq.${sort_order},id.gt.${id})`);
  }

  q = q.order("sort_order", { ascending: true }).order("id", { ascending: true }).limit(limit + 1);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as ItemRow[];
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const items = pageRows.map(rowToCosmetic);
  await attachRemaining(items);
  const last = items[items.length - 1];
  const nextCursor = hasMore && last ? { sort_order: last.sort_order, id: last.id } : null;

  return { items, nextCursor };
}

/** Fetch specific cosmetics by id (e.g. the player's owned set for the Collection). */
export async function getCosmeticsByIds(ids: string[]): Promise<Cosmetic[]> {
  if (ids.length === 0) return [];
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from("items").select(CATALOG_COLUMNS).in("id", ids);
  if (error) throw new Error(error.message);
  return ((data ?? []) as ItemRow[]).map(rowToCosmetic);
}

export async function listSets(): Promise<CosmeticSet[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("cosmetic_sets")
    .select("id,name,description,sort_order")
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as CosmeticSet[];
}

export async function listSeasons(): Promise<CosmeticSeason[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("cosmetic_seasons")
    .select("id,name,starts_at,ends_at,sort_order")
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as CosmeticSeason[];
}
