// ─── Event config schema + validators ──────────────────────────
// Single source of truth for the shape of an event's config blobs
// (rewards_config / theme_config / boss_config), used by BOTH the admin API
// (validation on write) and the admin UI (form rendering).
//
// No zod — the codebase validates by hand (typeof/regex), so we match that and
// avoid a new dependency. Validators return a discriminated result so callers
// read like the existing routes:  const r = parseRewardsConfig(body); if (!r.ok) ...
//
// GUARD-RAIL: a reward Bundle only carries pixels | item_id | xp. There is no
// field for $GITC (the real on-chain token), and validateBundle explicitly
// rejects any currency-looking key, so no event config can ever pay real money.

export type BossVariant = "duck" | "cafetopia";

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

// ─── Reward selectors (who qualifies) ───────────────────────────
export type Selector =
  | { type: "all"; min_score?: number }
  | { type: "threshold"; min_score: number }
  | { type: "rank"; min_rank?: number; max_rank: number }
  | { type: "percentile"; cutoff_pct: number; min_qualified?: number }
  | { type: "collective_goal" };

export const SELECTOR_TYPES = ["all", "threshold", "rank", "percentile", "collective_goal"] as const;

// ─── Reward bundle (what they get) ──────────────────────────────
export interface Bundle {
  pixels: number;
  item_id: string | null;
  xp: number;
  /** Optional merit emblem granted to whoever qualifies for this rail. */
  emblem_id?: string | null;
}

export interface Rail {
  id: string;
  selector: Selector;
  bundle: Bundle;
}

export type ScoringMetric = "damage_dealt" | "score";
export type Aggregation = "competitive" | "cooperative" | "threshold" | "bracket";

export interface ScoringConfig {
  metric: ScoringMetric;
  aggregation?: Aggregation;
}

export interface RewardsConfig {
  scoring: ScoringConfig;
  rails: Rail[];
}

export interface ThemeConfig {
  boss_name?: string;
  lore?: string;
  variant?: BossVariant;
  primary_color?: string;
}

// Combat tuning — mirrors the constants that used to live in BossEvent.tsx.
// All optional; the client falls back to DEFAULT_BOSS_TUNING per field.
export interface BossTuning {
  base_hp?: number;
  damage_per_hit?: number;
  minion_kill_bonus?: number;
  telegraph_ms?: number;
  orbit_speed?: { 1: number; 2: number; 3: number; 4: number };
  attack_interval?: { 1: number; 2: number; 3: number; 4: number };
}

// Defaults = the current hardcoded values in BossEvent.tsx (single source now).
export const DEFAULT_BOSS_TUNING: Required<Pick<BossTuning,
  "damage_per_hit" | "minion_kill_bonus" | "telegraph_ms" | "orbit_speed" | "attack_interval">> = {
  damage_per_hit: 30,
  minion_kill_bonus: 50,
  telegraph_ms: 1500,
  orbit_speed: { 1: 0.04, 2: 0.09, 3: 0.16, 4: 0.28 },
  attack_interval: { 1: 7500, 2: 6000, 3: 4500, 4: 3000 },
};

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isFiniteNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

// Keys that would imply paying real money — rejected outright.
const FORBIDDEN_BUNDLE_KEYS = ["gitc", "usd", "usdc", "eth", "token", "crypto", "cash"];

function validateBundle(input: unknown, ctx: string): Result<Bundle> {
  if (!isObj(input)) return { ok: false, error: `${ctx}: bundle must be an object` };
  for (const k of Object.keys(input)) {
    if (FORBIDDEN_BUNDLE_KEYS.includes(k.toLowerCase())) {
      return { ok: false, error: `${ctx}: forbidden reward currency "${k}" — events grant only pixels/items/xp` };
    }
  }
  const pixels = input.pixels === undefined ? 0 : input.pixels;
  const xp = input.xp === undefined ? 0 : input.xp;
  if (!isFiniteNum(pixels) || pixels < 0 || pixels > 1_000_000)
    return { ok: false, error: `${ctx}: pixels must be 0..1000000` };
  if (!isFiniteNum(xp) || xp < 0 || xp > 1_000_000)
    return { ok: false, error: `${ctx}: xp must be 0..1000000` };
  let item_id: string | null = null;
  if (input.item_id !== undefined && input.item_id !== null) {
    if (typeof input.item_id !== "string" || input.item_id.length > 64)
      return { ok: false, error: `${ctx}: item_id must be a string ≤64 chars or null` };
    item_id = input.item_id.trim() || null;
  }
  let emblem_id: string | null = null;
  if (input.emblem_id !== undefined && input.emblem_id !== null) {
    if (typeof input.emblem_id !== "string" || input.emblem_id.length > 64)
      return { ok: false, error: `${ctx}: emblem_id must be a string ≤64 chars or null` };
    emblem_id = input.emblem_id.trim() || null;
  }
  return { ok: true, value: { pixels: Math.floor(pixels), item_id, xp: Math.floor(xp), ...(emblem_id ? { emblem_id } : {}) } };
}

function validateSelector(input: unknown, ctx: string): Result<Selector> {
  if (!isObj(input)) return { ok: false, error: `${ctx}: selector must be an object` };
  const type = input.type;
  if (typeof type !== "string" || !SELECTOR_TYPES.includes(type as (typeof SELECTOR_TYPES)[number]))
    return { ok: false, error: `${ctx}: selector.type must be one of ${SELECTOR_TYPES.join("|")}` };
  switch (type) {
    case "all": {
      const min = input.min_score;
      if (min !== undefined && (!isFiniteNum(min) || min < 0)) return { ok: false, error: `${ctx}: min_score ≥ 0` };
      return { ok: true, value: { type: "all", ...(min !== undefined ? { min_score: min } : {}) } };
    }
    case "threshold": {
      if (!isFiniteNum(input.min_score) || input.min_score < 0)
        return { ok: false, error: `${ctx}: threshold needs min_score ≥ 0` };
      return { ok: true, value: { type: "threshold", min_score: input.min_score } };
    }
    case "rank": {
      if (!isFiniteNum(input.max_rank) || input.max_rank < 1)
        return { ok: false, error: `${ctx}: rank needs max_rank ≥ 1` };
      const min_rank = input.min_rank;
      if (min_rank !== undefined && (!isFiniteNum(min_rank) || min_rank < 1 || min_rank > input.max_rank))
        return { ok: false, error: `${ctx}: min_rank must be 1..max_rank` };
      return { ok: true, value: { type: "rank", max_rank: Math.floor(input.max_rank), ...(min_rank !== undefined ? { min_rank: Math.floor(min_rank) } : {}) } };
    }
    case "percentile": {
      if (!isFiniteNum(input.cutoff_pct) || input.cutoff_pct <= 0 || input.cutoff_pct > 1)
        return { ok: false, error: `${ctx}: percentile needs cutoff_pct in (0,1]` };
      const min_q = input.min_qualified;
      if (min_q !== undefined && (!isFiniteNum(min_q) || min_q < 0))
        return { ok: false, error: `${ctx}: min_qualified ≥ 0` };
      return { ok: true, value: { type: "percentile", cutoff_pct: input.cutoff_pct, ...(min_q !== undefined ? { min_qualified: Math.floor(min_q) } : {}) } };
    }
    case "collective_goal":
      return { ok: true, value: { type: "collective_goal" } };
    default:
      return { ok: false, error: `${ctx}: unknown selector type` };
  }
}

const RAIL_ID_RE = /^[a-z0-9_-]{1,32}$/;

export function parseRewardsConfig(input: unknown): Result<RewardsConfig> {
  if (!isObj(input)) return { ok: false, error: "rewards_config must be an object" };
  // scoring
  const scIn = isObj(input.scoring) ? input.scoring : {};
  const metric = scIn.metric === "score" ? "score" : "damage_dealt";
  const aggregation = typeof scIn.aggregation === "string" ? (scIn.aggregation as Aggregation) : "competitive";
  // rails
  if (!Array.isArray(input.rails) || input.rails.length === 0)
    return { ok: false, error: "rewards_config.rails must be a non-empty array" };
  if (input.rails.length > 32) return { ok: false, error: "too many rails (max 32)" };
  const rails: Rail[] = [];
  const ids = new Set<string>();
  for (let i = 0; i < input.rails.length; i++) {
    const raw = input.rails[i];
    const ctx = `rails[${i}]`;
    if (!isObj(raw)) return { ok: false, error: `${ctx} must be an object` };
    const id = typeof raw.id === "string" ? raw.id.trim() : "";
    if (!RAIL_ID_RE.test(id)) return { ok: false, error: `${ctx}.id must match [a-z0-9_-]{1,32}` };
    if (ids.has(id)) return { ok: false, error: `${ctx}.id "${id}" is duplicated` };
    ids.add(id);
    const sel = validateSelector(raw.selector, `${ctx}.selector`);
    if (!sel.ok) return sel;
    const bun = validateBundle(raw.bundle, `${ctx}.bundle`);
    if (!bun.ok) return bun;
    rails.push({ id, selector: sel.value, bundle: bun.value });
  }
  return { ok: true, value: { scoring: { metric, aggregation }, rails } };
}

export function parseThemeConfig(input: unknown): Result<ThemeConfig> {
  if (!isObj(input)) return { ok: false, error: "theme_config must be an object" };
  const out: ThemeConfig = {};
  if (input.boss_name !== undefined) {
    if (typeof input.boss_name !== "string") return { ok: false, error: "boss_name must be a string" };
    out.boss_name = input.boss_name.slice(0, 80);
  }
  if (input.lore !== undefined) {
    if (typeof input.lore !== "string") return { ok: false, error: "lore must be a string" };
    out.lore = input.lore.slice(0, 500);
  }
  if (input.variant !== undefined) {
    if (input.variant !== "duck" && input.variant !== "cafetopia")
      return { ok: false, error: "variant must be duck|cafetopia" };
    out.variant = input.variant;
  }
  if (input.primary_color !== undefined) {
    if (typeof input.primary_color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(input.primary_color))
      return { ok: false, error: "primary_color must be a #RRGGBB hex" };
    out.primary_color = input.primary_color;
  }
  return { ok: true, value: out };
}

export function parseBossConfig(input: unknown): Result<BossTuning> {
  if (!isObj(input)) return { ok: false, error: "boss_config must be an object" };
  const out: BossTuning = {};
  const num = (k: keyof BossTuning, min: number, max: number): string | null => {
    const v = (input as Record<string, unknown>)[k];
    if (v === undefined) return null;
    if (!isFiniteNum(v) || v < min || v > max) return `boss_config.${k} must be ${min}..${max}`;
    (out as Record<string, unknown>)[k] = v;
    return null;
  };
  for (const e of [
    num("base_hp", 5000, 20_000_000),
    num("damage_per_hit", 1, 100_000),
    num("minion_kill_bonus", 0, 100_000),
    num("telegraph_ms", 200, 10_000),
  ]) {
    if (e) return { ok: false, error: e };
  }
  for (const key of ["orbit_speed", "attack_interval"] as const) {
    const v = (input as Record<string, unknown>)[key];
    if (v === undefined) continue;
    if (!isObj(v)) return { ok: false, error: `boss_config.${key} must be an object keyed 1..4` };
    for (const p of [1, 2, 3, 4]) {
      if (!isFiniteNum(v[p]) || (v[p] as number) <= 0)
        return { ok: false, error: `boss_config.${key}.${p} must be a positive number` };
    }
    out[key] = { 1: v[1] as number, 2: v[2] as number, 3: v[3] as number, 4: v[4] as number };
  }
  return { ok: true, value: out };
}
