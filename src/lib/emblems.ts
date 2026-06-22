import { getSupabaseAdmin } from "./supabase";
import { sendEmblemNotification } from "./notification-senders/emblem";

// ─── Types ───────────────────────────────────────────────────
// The emblems honor layer. `evaluateEmblems` is the data-driven replacement for
// the old `checkAchievements` switch: instead of a hardcoded case per category,
// it interprets each emblem's declarative `criteria`. A new threshold emblem is
// now ONE catalog row, zero code.

/**
 * Stats a developer is measured against. Keys are the `metric` names a
 * threshold emblem's criteria can reference (criteria.metric must match a key).
 * Structurally identical to the old achievements DevStats, so existing call
 * sites pass the same object.
 */
export interface EmblemStats {
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
  purchases?: number;
  dailies_completed?: number;
}

/** The single supported criteria shape. Anything else stays push-only (null). */
interface ThresholdCriteria {
  type: "threshold";
  metric: string;
  gte: number;
}

interface CandidateEmblem {
  id: string;
  name: string;
  tier: string;
  criteria: ThresholdCriteria | null;
}

interface GrantResult {
  ok?: boolean;
  granted?: boolean;
  duplicate?: boolean;
}

// ─── PULL evaluator (threshold emblems) ──────────────────────

/**
 * Evaluate every active threshold emblem against a developer's stats and grant
 * the ones they now qualify for. Idempotent: grants flow through the
 * `grant_emblem` RPC, whose claim_key dedups replays — so the worst case of a
 * double call is a no-op, never a double count.
 *
 * Returns the IDs of emblems newly earned on this call.
 */
export async function evaluateEmblems(
  developerId: number,
  stats: EmblemStats,
  actorLogin?: string,
): Promise<string[]> {
  const sb = getSupabaseAdmin();

  // Active threshold emblems (criteria not null) + what the dev already holds.
  const [emblemsRes, grantsRes] = await Promise.all([
    sb
      .from("emblems")
      .select("id, name, tier, criteria")
      .eq("active", true)
      .not("criteria", "is", null),
    sb.from("emblem_grants").select("emblem_id").eq("developer_id", developerId),
  ]);

  const owned = new Set((grantsRes.data ?? []).map((r) => r.emblem_id));
  const candidates = ((emblemsRes.data ?? []) as CandidateEmblem[]).filter(
    (e) => !owned.has(e.id),
  );
  if (candidates.length === 0) return [];

  // One interpreter, one shape. `metric` indexes the stats object by name.
  const statValues = stats as unknown as Record<string, number | undefined>;
  const qualifying = candidates.filter((e) => {
    const c = e.criteria;
    if (!c || c.type !== "threshold") return false;
    return (statValues[c.metric] ?? 0) >= c.gte;
  });
  if (qualifying.length === 0) return [];

  // Grant through the chokepoint, sequentially (grant_emblem takes a per-dev
  // advisory lock; parallel calls would just serialize on it anyway).
  const newlyEarned: { id: string; name: string; tier: string }[] = [];
  for (const e of qualifying) {
    const { data, error } = await sb.rpc("grant_emblem", {
      p_developer_id: developerId,
      p_emblem_id: e.id,
      p_claim_key: `threshold:${e.id}:${developerId}`,
      p_meta: {},
      p_source: "threshold",
    });
    if (error) {
      console.error("[emblems] grant failed", e.id, error.message);
      continue;
    }
    if ((data as GrantResult | null)?.granted) {
      newlyEarned.push({ id: e.id, name: e.name, tier: e.tier });
    }
  }

  if (newlyEarned.length === 0) return [];

  // Notify on notable tiers (fire-and-forget; sender filters to gold/diamond).
  if (actorLogin) {
    void (async () => {
      try {
        sendEmblemNotification(developerId, actorLogin, newlyEarned);
      } catch (err: unknown) {
        console.error("[emblems] notification failed", err);
      }
    })();
  }

  return newlyEarned.map((e) => e.id);
}
