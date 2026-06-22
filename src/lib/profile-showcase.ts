// ─── Profile showcase (trophy case + equipped title) ─────────
// Client-safe — no server imports. Shared by the profile page,
// TrophyCase/TitlePicker components and /api/profile/showcase.

import { XP_RANKS, rankFromLevel } from "./xp";
import { TIER_ORDER } from "./achievement-tiers";

export const MAX_FEATURED = 6;

/**
 * An earned emblem with everything the trophy case renders. (Field names kept
 * `achievement_id`/`unlocked_at` for back-compat — emblem ids equal the old
 * achievement ids after the backfill, so saved showcases keep resolving.)
 */
export interface ShowcaseAchievement {
  achievement_id: string;
  name: string;
  tier: string;
  description: string | null;
  unlocked_at: string | null;
  /** Glyph key for the data-driven badge. Null falls back to a default glyph. */
  glyph?: string | null;
  /** Live count for counter emblems (Veteran "10", placements "3×"). */
  count?: number;
  /** Whether to show the count overlay. */
  is_counter?: boolean;
}

/** Shape of the developer_customizations row with item_id = "profile". */
export interface ProfileShowcaseConfig {
  featured_achievements?: string[];
  equipped_title?: string | null;
}

/** Sort by tier desc, then unlock recency desc. */
export function sortByPrestige(achievements: ShowcaseAchievement[]): ShowcaseAchievement[] {
  return [...achievements].sort((a, b) => {
    const tierDiff = (TIER_ORDER[b.tier] ?? 0) - (TIER_ORDER[a.tier] ?? 0);
    if (tierDiff !== 0) return tierDiff;
    return (b.unlocked_at ?? "").localeCompare(a.unlocked_at ?? "");
  });
}

/**
 * Titles the dev may equip: all rank titles up to their level,
 * plus names of unlocked gold/diamond achievements.
 */
export function buildTitlePool(level: number, achievements: ShowcaseAchievement[]): string[] {
  const rankTitles = XP_RANKS.filter((r) => r.level <= level).map((r) => r.title);
  const prestigeTitles = achievements
    .filter((a) => a.tier === "gold" || a.tier === "diamond")
    .map((a) => a.name);
  return [...new Set([...rankTitles, ...prestigeTitles])];
}

/** Equipped title, falling back to the rank title when unset or no longer in the pool. */
export function resolveTitle(
  saved: string | null | undefined,
  level: number,
  achievements: ShowcaseAchievement[]
): string {
  if (saved && buildTitlePool(level, achievements).includes(saved)) return saved;
  return rankFromLevel(level).title;
}

/**
 * Featured achievement ids: valid pinned ids first (stale ones filtered out),
 * remaining slots auto-filled by prestige. With no curation this is the
 * automatic top-6.
 */
export function resolveFeatured(
  saved: string[] | undefined,
  achievements: ShowcaseAchievement[]
): string[] {
  const owned = new Set(achievements.map((a) => a.achievement_id));
  const pinned = (saved ?? [])
    .filter((id, i, arr) => owned.has(id) && arr.indexOf(id) === i)
    .slice(0, MAX_FEATURED);
  const fill = sortByPrestige(achievements)
    .map((a) => a.achievement_id)
    .filter((id) => !pinned.includes(id));
  return [...pinned, ...fill].slice(0, MAX_FEATURED);
}
