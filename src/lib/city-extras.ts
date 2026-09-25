import type { SupabaseClient } from "@supabase/supabase-js";

// ─── Building extras ────────────────────────────────────────
// Per-dev data layered on top of the developers row for rendering a building:
// owned items, customizations, loadout, emblems, raid tag, pixel spend and
// league crown. Shared by /api/city, the city snapshot cron and league pages.

export const CITY_DEV_COLUMNS =
  "id, github_login, name, avatar_url, contributions, total_stars, public_repos, primary_language, rank, claimed, claimed_at, created_at, kudos_count, visit_count, contributions_total, contribution_years, total_prs, total_reviews, repos_contributed_to, followers, following, organizations_count, account_created_at, current_streak, active_days_last_year, language_diversity, app_streak, rabbit_completed, district, district_chosen, xp_total, xp_level, lot_id";

const PAGE_SIZE = 1000; // PostgREST caps at 1000 rows per request

type Loadout = { crown: string | null; roof: string | null; aura: string | null };
type RaidTag = { attacker_login: string; tag_style: string; expires_at: string };
export type LeagueCrown = { league_slug: string; league_name: string; week_start: string; expires_at: string };

export interface CityExtras {
  ownedItems: Record<number, string[]>;
  customColor: Record<number, string>;
  billboardImages: Record<number, string[]>;
  loadout: Record<number, Loadout>;
  achievements: Record<number, string[]>;
  raidTag: Record<number, RaidTag>;
  walletSpent: Record<number, number>;
  leagueCrown: Record<number, LeagueCrown>;
}

// PostgREST filter builders are deeply generic; this is the one place we let
// a query flow through untyped so the same select can run scoped or paginated.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Query = any;

/**
 * Runs `select` on `table`, either scoped to `devIds` via `idColumn` (one
 * request, like a /api/city page) or paginated over the whole table ("all",
 * like the snapshot).
 */
async function rows<T>(
  sb: SupabaseClient,
  table: string,
  select: string,
  devIds: number[] | "all",
  idColumn: string,
  apply?: (q: Query) => Query,
  optional = false,
): Promise<T[]> {
  if (devIds !== "all") {
    if (devIds.length === 0) return [];
    let q: Query = sb.from(table).select(select).in(idColumn, devIds);
    if (apply) q = apply(q);
    const { data } = await q;
    return (data ?? []) as T[];
  }
  const all: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let q: Query = sb.from(table).select(select).range(from, from + PAGE_SIZE - 1);
    if (apply) q = apply(q);
    const { data, error } = await q;
    if (error) {
      if (optional) return [];
      throw new Error(`city-extras ${table}: ${error.message}`);
    }
    if (!data || data.length === 0) break;
    all.push(...(data as T[]));
    if (data.length < PAGE_SIZE) break;
  }
  return all;
}

export async function loadCityExtras(sb: SupabaseClient, devIds: number[] | "all"): Promise<CityExtras> {
  const now = new Date().toISOString();
  const [purchases, giftPurchases, customizations, achievements, raidTags, wallets, crowns] = await Promise.all([
    rows<{ developer_id: number; item_id: string }>(sb, "purchases", "developer_id, item_id", devIds, "developer_id", (q) =>
      q.is("gifted_to", null).eq("status", "completed"),
    ),
    rows<{ gifted_to: number; item_id: string }>(sb, "purchases", "gifted_to, item_id", devIds, "gifted_to", (q) =>
      q.not("gifted_to", "is", null).eq("status", "completed"),
    ),
    rows<{ developer_id: number; item_id: string; config: Record<string, unknown> }>(
      sb,
      "developer_customizations",
      "developer_id, item_id, config",
      devIds,
      "developer_id",
      (q) => q.in("item_id", ["custom_color", "billboard", "loadout"]),
    ),
    rows<{ developer_id: number; achievement_id: string }>(
      sb,
      "emblem_grants",
      "developer_id, achievement_id:emblem_id",
      devIds,
      "developer_id",
    ),
    rows<{ building_id: number } & RaidTag>(
      sb,
      "raid_tags",
      "building_id, attacker_login, tag_style, expires_at",
      devIds,
      "building_id",
      (q) => q.eq("active", true),
    ),
    rows<{ developer_id: number; lifetime_spent: number }>(sb, "wallets", "developer_id, lifetime_spent", devIds, "developer_id"),
    rows<{ developer_id: number; week_start: string; expires_at: string; leagues: { slug: string; name: string } | null }>(
      sb,
      "league_crowns",
      "developer_id, week_start, expires_at, leagues(slug, name)",
      devIds,
      "developer_id",
      (q) => q.gt("expires_at", now),
      true, // never break the city if the leagues migration hasn't landed yet
    ),
  ]);

  const extras: CityExtras = {
    ownedItems: {},
    customColor: {},
    billboardImages: {},
    loadout: {},
    achievements: {},
    raidTag: {},
    walletSpent: {},
    leagueCrown: {},
  };

  for (const row of purchases) (extras.ownedItems[row.developer_id] ??= []).push(row.item_id);
  for (const row of giftPurchases) (extras.ownedItems[row.gifted_to] ??= []).push(row.item_id);

  for (const row of customizations) {
    const config = row.config;
    if (row.item_id === "custom_color" && typeof config?.color === "string") {
      extras.customColor[row.developer_id] = config.color;
    }
    if (row.item_id === "billboard") {
      if (Array.isArray(config?.images)) {
        extras.billboardImages[row.developer_id] = config.images as string[];
      } else if (typeof config?.image_url === "string") {
        extras.billboardImages[row.developer_id] = [config.image_url];
      }
    }
    if (row.item_id === "loadout") {
      extras.loadout[row.developer_id] = {
        crown: (config?.crown as string) ?? null,
        roof: (config?.roof as string) ?? null,
        aura: (config?.aura as string) ?? null,
      };
    }
  }

  for (const row of achievements) (extras.achievements[row.developer_id] ??= []).push(row.achievement_id);

  // 1 active tag per building
  for (const row of raidTags) {
    extras.raidTag[row.building_id] = {
      attacker_login: row.attacker_login,
      tag_style: row.tag_style,
      expires_at: row.expires_at,
    };
  }

  // Cumulative pixels spent → centrality signal
  for (const row of wallets) extras.walletSpent[row.developer_id] = Number(row.lifetime_spent) || 0;

  // One crown per dev per week; keep the latest if a dev somehow has two live.
  for (const row of crowns) {
    if (!row.leagues) continue;
    const prev = extras.leagueCrown[row.developer_id];
    if (prev && prev.week_start >= row.week_start) continue;
    extras.leagueCrown[row.developer_id] = {
      league_slug: row.leagues.slug,
      league_name: row.leagues.name,
      week_start: row.week_start,
      expires_at: row.expires_at,
    };
  }

  return extras;
}

type DevRow = { id: number } & Record<string, unknown>;

/** Merges extras into developer rows (the /api/city and snapshot shape). */
export function mergeCityExtras<T extends DevRow>(devs: T[], extras: CityExtras) {
  return devs.map((dev) => ({
    ...dev,
    kudos_count: dev.kudos_count ?? 0,
    visit_count: dev.visit_count ?? 0,
    owned_items: extras.ownedItems[dev.id] ?? [],
    custom_color: extras.customColor[dev.id] ?? null,
    billboard_images: extras.billboardImages[dev.id] ?? [],
    achievements: extras.achievements[dev.id] ?? [],
    loadout: extras.loadout[dev.id] ?? null,
    app_streak: dev.app_streak ?? 0,
    raid_xp: dev.raid_xp ?? 0,
    current_week_contributions: dev.current_week_contributions ?? 0,
    current_week_kudos_given: dev.current_week_kudos_given ?? 0,
    current_week_kudos_received: dev.current_week_kudos_received ?? 0,
    active_raid_tag: extras.raidTag[dev.id] ?? null,
    rabbit_completed: dev.rabbit_completed ?? false,
    xp_total: dev.xp_total ?? 0,
    xp_level: dev.xp_level ?? 1,
    pixels_spent: extras.walletSpent[dev.id] ?? 0,
    active_league_crown: extras.leagueCrown[dev.id] ?? null,
  }));
}

export type ActiveDropRow = {
  id: string;
  building_id: number;
  rarity: string;
  points: number;
  max_pulls: number;
  pull_count: number;
  expires_at: string;
};

/** Active drops as a separate obfuscated array, keyed by dev rank. */
export function buildDropsArray(devs: { id: number; rank: number }[], drops: ActiveDropRow[]) {
  const idToRank = new Map<number, number>();
  for (const dev of devs) idToRank.set(dev.id, dev.rank);
  const _d: { n: number; id: string; r: string; p: number; m: number; c: number; x: string }[] = [];
  for (const row of drops) {
    if (row.pull_count < row.max_pulls) {
      const rank = idToRank.get(row.building_id);
      if (rank !== undefined) {
        _d.push({ n: rank, id: row.id, r: row.rarity, p: row.points, m: row.max_pulls, c: row.pull_count, x: row.expires_at });
      }
    }
  }
  return _d;
}
