// ─── Raid System Utilities ────────────────────────────────────
// Pure functions for raid calculations, titles, and estimates.

export const RAID_TITLES = [
  { xp: 0, title: null },
  { xp: 100, title: "Pickpocket" },
  { xp: 500, title: "Burglar" },
  { xp: 2000, title: "Heist Master" },
  { xp: 10000, title: "Kingpin" },
] as const;

export function getRaidTitle(xp: number): string | null {
  let title: string | null = null;
  for (const t of RAID_TITLES) {
    if (xp >= t.xp) title = t.title;
  }
  return title;
}

export type StrengthEstimate = "weak" | "medium" | "strong";

export function getStrengthEstimate(score: number): StrengthEstimate {
  if (score <= 15) return "weak";
  if (score <= 40) return "medium";
  return "strong";
}

// ─── Score Calculation ────────────────────────────────────────

export interface AttackInputs {
  weeklyContributions: number;
  appStreak: number;
  weeklyKudosGiven: number;
  boostBonus?: number;
}

export interface DefenseInputs {
  weeklyContributions: number;
  appStreak: number;
  weeklyKudosReceived: number;
}

export interface ScoreBreakdown {
  commits: number;
  streak: number;
  kudos: number;
  boost?: number;
  boost_item?: string;
}

export function calculateAttackScore(inputs: AttackInputs): {
  total: number;
  breakdown: ScoreBreakdown;
} {
  const commits = inputs.weeklyContributions * 3;
  const streak = inputs.appStreak * 1;
  const kudos = inputs.weeklyKudosGiven * 2;
  const boost = inputs.boostBonus ?? 0;
  return {
    total: commits + streak + kudos + boost,
    breakdown: {
      commits,
      streak,
      kudos,
      ...(boost > 0 ? { boost } : {}),
    },
  };
}

export function calculateDefenseScore(inputs: DefenseInputs): {
  total: number;
  breakdown: ScoreBreakdown;
} {
  const commits = inputs.weeklyContributions * 3;
  const streak = inputs.appStreak * 1;
  const kudos = inputs.weeklyKudosReceived * 1;
  return {
    total: commits + streak + kudos,
    breakdown: { commits, streak, kudos },
  };
}

// ─── Raid Constants ───────────────────────────────────────────

export const MAX_RAIDS_PER_DAY = 3;
export const RAID_TAG_DURATION_DAYS = 3;

// ─── Special Events ──────────────────────────────────────────

/** Check if today is Friday the 13th (UTC) */
export function isFridayThe13th(): boolean {
  const now = new Date();
  return now.getUTCDay() === 5 && now.getUTCDate() === 13;
}

/** Effective daily raid limit (unlimited on special event days) */
export function getEffectiveMaxRaids(): number {
  return isFridayThe13th() ? 999 : MAX_RAIDS_PER_DAY;
}

/** Whether the weekly per-target cooldown is active */
export function isWeeklyCooldownActive(): boolean {
  return !isFridayThe13th();
}
export const XP_WIN_ATTACKER = 50;
export const XP_WIN_DEFENDER = 30;
export const XP_LOSE_DEFENDER = 30;

// ─── Types ────────────────────────────────────────────────────

export interface RaidVehicleOption {
  item_id: string;
  name: string;
  emoji: string;
}

export interface RaidPreviewResponse {
  can_raid: boolean;
  raids_today: number;
  raids_max: number;
  target_raided_this_week: boolean;
  special_event: "friday13" | null;
  attack_estimate: StrengthEstimate;
  defense_estimate: StrengthEstimate;
  attack_score: number;
  defense_score: number;
  attack_breakdown: ScoreBreakdown;
  defense_breakdown: ScoreBreakdown;
  attacker_login: string;
  attacker_avatar: string | null;
  defender_login: string;
  defender_avatar: string | null;
  defender_building_height: number;
  available_boosts: RaidBoostItem[];
  available_vehicles: RaidVehicleOption[];
  vehicle: string;
}

export interface RaidBoostItem {
  purchase_id: number;
  item_id: string;
  name: string;
  bonus: number;
}

export interface RaidExecuteResponse {
  raid_id: string;
  success: boolean;
  attack_score: number;
  defense_score: number;
  attack_breakdown: ScoreBreakdown;
  defense_breakdown: ScoreBreakdown;
  attacker: {
    login: string;
    avatar: string | null;
    position: [number, number, number];
    height: number;
  };
  defender: {
    login: string;
    avatar: string | null;
    position: [number, number, number];
    height: number;
  };
  xp_earned: number;
  new_raid_xp: number;
  new_title: string | null;
  new_achievements: string[];
  vehicle: string;
  tag_style: string;
}

export interface RaidHistoryEntry {
  id: string;
  attacker_login: string;
  defender_login: string;
  success: boolean;
  created_at: string;
}

export interface RaidHistoryResponse {
  raids: RaidHistoryEntry[];
  total: number;
  active_tag: {
    attacker_login: string;
    tag_style: string;
    expires_at: string;
  } | null;
}
