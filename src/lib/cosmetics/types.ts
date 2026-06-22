// ─── Cosmetics domain model ──────────────────────────────────────────────
// One cosmetic = one catalog row that declares HOW it renders. This replaces
// the old sprawl (a TS object in items.ts + an array in zones.ts + a switch
// case in itemRenderers.tsx + parallel FACES_ITEMS/RAID_* lists). Adding a
// cosmetic is now: insert a row (+ a model/thumbnail). The code only holds a
// bounded set of render strategies, not a per-item entry — that's what lets the
// catalog grow to thousands without the codebase growing with it.

export type CosmeticSlot = "crown" | "roof" | "aura" | "faces";
export type CosmeticRarity = "common" | "rare" | "epic" | "legendary";
/** Top-level shop tab a cosmetic belongs to. */
export type ShopSection = "building" | "battle" | "boost";

/** Which render strategy a cosmetic uses. See migration 101 for the rationale. */
export type RenderKind = "code" | "asset" | "template";

/** Bespoke Three.js component, looked up by key in CODE_RENDERERS. The ~25
 *  legacy cosmetics use this (render_spec.key === item id). */
export interface CodeRenderSpec {
  key: string;
}

/** A GLB model placed on the building, fully described by data. This is the
 *  path that scales: a new cosmetic is a model upload + a row, no code. */
export interface AssetRenderSpec {
  /** GLB url — Supabase Storage or /public/models/... */
  model: string;
  /** Where on the building it attaches (defaults to the cosmetic's slot). */
  attach?: CosmeticSlot;
  /** Local offset from the attach anchor, in building units. */
  offset?: [number, number, number];
  /** Uniform scale or per-axis. */
  scale?: number | [number, number, number];
  /** Euler rotation in radians. */
  rotation?: [number, number, number];
  /** Optional material tint (hex). Driven by the building accent when "accent". */
  tint?: string | "accent" | null;
  /** Idle animation applied generically. */
  animation?: "spin" | "bob" | "float" | null;
}

/** A parametric effect. One template (e.g. "particles", "ring", "tint") yields
 *  many cosmetics by varying params — recolors and variants become cheap rows. */
export interface TemplateRenderSpec {
  template: string;
  params?: Record<string, unknown>;
}

export type RenderSpec = CodeRenderSpec | AssetRenderSpec | TemplateRenderSpec;

export interface Cosmetic {
  id: string;
  name: string;
  description: string | null;
  slot: CosmeticSlot | null;
  shop_section: ShopSection | null;
  set_id: string | null;
  season_id: string | null;
  rarity: CosmeticRarity | null;
  tags: string[];
  render_kind: RenderKind;
  render_spec: RenderSpec;
  thumbnail_url: string | null;
  sort_order: number;
  // Pricing (mirrors the items table; pixels is the in-game soft currency).
  price_pixels: number | null;
  price_usd_cents: number;
  price_brl_cents: number;
  pixels_only: boolean;
  // Availability window for live-ops scheduling.
  available_from: string | null;
  available_until: string | null;
  max_quantity: number | null;
  /** Units left for limited items (max_quantity - sold); null when unlimited. */
  remaining: number | null;
  is_exclusive: boolean;
  is_active: boolean;
  created_at: string | null;
}

const NEW_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

/** True if the cosmetic was added recently (for the "New" badge). */
export function isNewCosmetic(c: Cosmetic, now: number = Date.now()): boolean {
  if (!c.created_at) return false;
  const t = new Date(c.created_at).getTime();
  return Number.isFinite(t) && now - t < NEW_WINDOW_MS;
}

export interface CosmeticSet {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
}

export interface CosmeticSeason {
  id: string;
  name: string;
  starts_at: string | null;
  ends_at: string | null;
  sort_order: number;
}

// ─── Type guards / accessors over render_spec ────────────────────────────

export function isCodeSpec(c: Pick<Cosmetic, "render_kind" | "render_spec">): c is { render_kind: "code"; render_spec: CodeRenderSpec } & Cosmetic {
  return c.render_kind === "code";
}
export function isAssetSpec(c: Pick<Cosmetic, "render_kind" | "render_spec">): c is { render_kind: "asset"; render_spec: AssetRenderSpec } & Cosmetic {
  return c.render_kind === "asset";
}
export function isTemplateSpec(c: Pick<Cosmetic, "render_kind" | "render_spec">): c is { render_kind: "template"; render_spec: TemplateRenderSpec } & Cosmetic {
  return c.render_kind === "template";
}

/** The render key for a code cosmetic (falls back to the cosmetic id, which is
 *  how the backfill in migration 101 seeds it). */
export function codeKey(c: Pick<Cosmetic, "id" | "render_kind" | "render_spec">): string {
  if (c.render_kind === "code") {
    const spec = c.render_spec as CodeRenderSpec;
    return spec?.key || c.id;
  }
  return c.id;
}

// ─── Availability ────────────────────────────────────────────────────────

/** True if the cosmetic is buyable right now (active + inside its window). */
export function isAvailable(c: Cosmetic, now: number = nowMs()): boolean {
  if (!c.is_active) return false;
  if (c.available_from && new Date(c.available_from).getTime() > now) return false;
  if (c.available_until && new Date(c.available_until).getTime() < now) return false;
  return true;
}

/** Ms until the buy window closes, or null if it never does / already closed. */
export function msUntilLeaving(c: Cosmetic, now: number = nowMs()): number | null {
  if (!c.available_until) return null;
  const left = new Date(c.available_until).getTime() - now;
  return left > 0 ? left : null;
}

function nowMs(): number {
  return typeof performance !== "undefined" && performance.timeOrigin
    ? performance.timeOrigin + performance.now()
    : new Date().getTime();
}
