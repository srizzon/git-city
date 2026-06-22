// ─── Event type registry (the plugin system) ────────────────────
// Each event "kind" registers what makes it unique: the metric it scores, the
// server RPC that credits progress, the client variant(s) it renders, and a
// sensible default reward config. The framework (lifecycle, scoring, reward
// engine, leaderboard, metrics, admin) is shared; a new mechanic = a new entry
// here + its credit RPC + its renderer.
//
// boss_raid is plugin #1 (the duck boss). Future: build_comp, tournament, etc.

import type { BossVariant, RewardsConfig } from "./schema";

export interface EventTypeDef {
  kind: string;
  label: string;
  description: string;
  /** Which participation column the reward engine ranks by. */
  metric: "damage_dealt" | "score";
  /** Server RPC that credits a player's progress (mechanic-specific). */
  creditRpc: string;
  /** Client render variants this type supports (boss_raid → duck/cafetopia). */
  variants: BossVariant[];
  /** Starting rewards for a freshly created event of this kind. */
  defaultConfig: () => RewardsConfig;
}

// Default duck-boss rewards = the meeting's decision: 500/250/100 Pixels to the
// top 3, plus a participation cosmetic for everyone who shows up (≥100 damage).
function bossRaidDefaults(): RewardsConfig {
  return {
    scoring: { metric: "damage_dealt", aggregation: "competitive" },
    rails: [
      { id: "rank1", selector: { type: "rank", min_rank: 1, max_rank: 1 }, bundle: { pixels: 500, item_id: "duck_gold_animated", xp: 1000 } },
      { id: "rank2", selector: { type: "rank", min_rank: 2, max_rank: 2 }, bundle: { pixels: 250, item_id: null, xp: 500 } },
      { id: "rank3", selector: { type: "rank", min_rank: 3, max_rank: 3 }, bundle: { pixels: 100, item_id: null, xp: 300 } },
      { id: "participation", selector: { type: "all", min_score: 100 }, bundle: { pixels: 0, item_id: "companion_duck", xp: 50 } },
    ],
  };
}

const REGISTRY: Record<string, EventTypeDef> = {
  boss_raid: {
    kind: "boss_raid",
    label: "Boss Raid",
    description: "Players attack a shared boss; ranked by damage. (Duck Boss, Cafetopia…)",
    metric: "damage_dealt",
    creditRpc: "credit_event_damage",
    variants: ["duck", "cafetopia"],
    defaultConfig: bossRaidDefaults,
  },
};

export const DEFAULT_EVENT_KIND = "boss_raid";

export function getEventType(kind: string): EventTypeDef | null {
  return REGISTRY[kind] ?? null;
}

export function listEventTypes(): EventTypeDef[] {
  return Object.values(REGISTRY);
}

export function isKnownEventKind(kind: unknown): kind is string {
  return typeof kind === "string" && kind in REGISTRY;
}
