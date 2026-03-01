import { getSupabaseAdmin } from "./supabase";
import { sendAchievementNotification } from "./notification-senders/achievement";

// ─── Types ───────────────────────────────────────────────────

export interface Achievement {
  id: string;
  category: string;
  name: string;
  description: string;
  threshold: number;
  tier: "bronze" | "silver" | "gold" | "diamond";
  reward_type: "unlock_item" | "exclusive_badge";
  reward_item_id: string | null;
  sort_order: number;
}

export interface DeveloperAchievement {
  developer_id: number;
  achievement_id: string;
  unlocked_at: string;
  seen: boolean;
}

export const TIER_COLORS: Record<string, string> = {
  bronze: "#cd7f32",
  silver: "#c0c0c0",
  gold: "#ffd700",
  diamond: "#b9f2ff",
};

export const TIER_EMOJI: Record<string, string> = {
  bronze: "\u{1F7E4}", // brown circle
  silver: "\u{26AA}",  // white circle
  gold: "\u{1F7E1}",   // yellow circle
  diamond: "\u{1F48E}", // gem
};

// ─── Core Logic ──────────────────────────────────────────────

interface DevStats {
  contributions: number;
  public_repos: number;
  total_stars: number;
  referral_count: number;
  kudos_count: number;
  gifts_sent: number;
  gifts_received: number;
  app_streak?: number;
  kudos_streak?: number;
  raid_xp?: number;
}

/**
 * Check and unlock new achievements for a developer.
 * - Finds all achievements the dev qualifies for but hasn't unlocked yet
 * - Batch inserts unlocks
 * - Grants free items for unlock_item rewards
 * - Inserts feed events
 * Returns array of newly unlocked achievement IDs.
 */
export async function checkAchievements(
  developerId: number,
  stats: DevStats,
  actorLogin?: string
): Promise<string[]> {
  const sb = getSupabaseAdmin();

  // Fetch all achievements not yet unlocked by this dev
  const [allRes, unlockedRes] = await Promise.all([
    sb.from("achievements").select("id, category, threshold, tier, name, reward_type, reward_item_id"),
    sb
      .from("developer_achievements")
      .select("achievement_id")
      .eq("developer_id", developerId),
  ]);

  const unlocked = new Set(
    (unlockedRes.data ?? []).map((r) => r.achievement_id)
  );
  const eligible = (allRes.data ?? []).filter(
    (a) => !unlocked.has(a.id)
  ) as Achievement[];

  // Filter by stats thresholds
  const newUnlocks = eligible.filter((a) => {
    switch (a.category) {
      case "commits":
        return stats.contributions >= a.threshold;
      case "repos":
        return stats.public_repos >= a.threshold;
      case "stars":
        return stats.total_stars >= a.threshold;
      case "social":
        return stats.referral_count >= a.threshold;
      case "kudos":
        return stats.kudos_count >= a.threshold;
      case "gifts_sent":
        return stats.gifts_sent >= a.threshold;
      case "gifts_received":
        return stats.gifts_received >= a.threshold;
      case "streak":
        return (stats.app_streak ?? 0) >= a.threshold;
      case "kudos_streak":
        return (stats.kudos_streak ?? 0) >= a.threshold;
      case "raid":
        return (stats.raid_xp ?? 0) >= a.threshold;
      default:
        return false;
    }
  });

  if (newUnlocks.length === 0) return [];

  // Batch insert developer_achievements
  const unlockRows = newUnlocks.map((a) => ({
    developer_id: developerId,
    achievement_id: a.id,
  }));

  await sb
    .from("developer_achievements")
    .upsert(unlockRows, { onConflict: "developer_id,achievement_id" });

  // Grant free items for unlock_item rewards
  const itemRewards = newUnlocks.filter(
    (a) => a.reward_type === "unlock_item" && a.reward_item_id
  );

  if (itemRewards.length > 0) {
    const purchaseRows = itemRewards.map((a) => ({
      developer_id: developerId,
      item_id: a.reward_item_id!,
      provider: "achievement",
      provider_tx_id: `achievement_${developerId}_${a.id}`,
      amount_cents: 0,
      currency: "usd",
      status: "completed",
    }));

    // Insert one by one, skip if already owned (unique index handles dedup)
    for (const row of purchaseRows) {
      await sb.from("purchases").insert(row);
    }
  }

  // Insert feed events
  if (newUnlocks.length === 1) {
    const a = newUnlocks[0];
    await sb.from("activity_feed").insert({
      event_type: "achievement_unlocked",
      actor_id: developerId,
      metadata: {
        login: actorLogin,
        achievement_id: a.id,
        achievement_name: a.name,
        tier: a.tier,
      },
    });
  } else {
    // Aggregated: "@user unlocked N achievements"
    await sb.from("activity_feed").insert({
      event_type: "achievement_unlocked",
      actor_id: developerId,
      metadata: {
        login: actorLogin,
        count: newUnlocks.length,
        achievements: newUnlocks.map((a) => ({
          id: a.id,
          name: a.name,
          tier: a.tier,
        })),
      },
    });
  }

  // Notify developer of gold/diamond achievements
  if (actorLogin) {
    sendAchievementNotification(
      developerId,
      actorLogin,
      newUnlocks.map((a) => ({ id: a.id, name: a.name, tier: a.tier })),
    );
  }

  return newUnlocks.map((a) => a.id);
}

/**
 * Batch fetch achievements for multiple developers (for city API).
 */
export async function getAchievementsForDevelopers(
  developerIds: number[]
): Promise<Record<number, string[]>> {
  if (developerIds.length === 0) return {};

  const sb = getSupabaseAdmin();
  const { data } = await sb
    .from("developer_achievements")
    .select("developer_id, achievement_id")
    .in("developer_id", developerIds);

  const result: Record<number, string[]> = {};
  for (const row of data ?? []) {
    if (!result[row.developer_id]) result[row.developer_id] = [];
    result[row.developer_id].push(row.achievement_id);
  }
  return result;
}
