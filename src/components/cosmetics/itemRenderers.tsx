"use client";

import { Suspense, type ReactNode } from "react";
import {
  NeonOutline,
  ParticleAura,
  SpotlightEffect,
  RooftopFire,
  Helipad,
  AntennaArray,
  RooftopGarden,
  Spire,
  Billboards,
  Flag,
  NeonTrim,
  SatelliteDish,
  CrownItem,
  CompanionDuck,
  PoolParty,
  HologramRing,
  LightningAura,
  LEDBanner,
  GitHubStar,
} from "@/components/BuildingEffects";
import { MiniWhiteRabbit } from "@/components/WhiteRabbit";
import {
  ZONE_ITEMS,
  FACES_ITEMS,
  RAID_VEHICLE_ITEMS,
  RAID_TAG_ITEMS,
} from "@/lib/zones";
import {
  codeKey,
  type Cosmetic,
  type CosmeticSlot,
  type AssetRenderSpec,
  type TemplateRenderSpec,
} from "@/lib/cosmetics/types";
import AssetCosmetic from "./AssetCosmetic";
import { renderTemplate } from "./templates";

// ─── Single source of truth: item_id → 3D visual ──────────────
//
// Every place that draws an item on a building (the live city in
// Building3D, the shop's ShopPreview, the admin cosmetics gallery) renders
// through THIS function. One dispatch, so coverage never drifts: if an item
// renders here it renders everywhere, and a missing case is missing
// everywhere (visible immediately in the gallery).

export interface BuildingVisualOpts {
  width: number;
  height: number;
  depth: number;
  color?: string;
  focused?: boolean;
  billboardImages?: string[];
}

/** All item_ids that draw something on/around a building (not vehicles/tags/utility). */
export const BUILDING_ITEM_IDS: ReadonlySet<string> = new Set<string>([
  ...ZONE_ITEMS.crown,
  ...ZONE_ITEMS.roof,
  ...ZONE_ITEMS.aura,
  ...FACES_ITEMS,
  "white_rabbit",
]);

// CODE_RENDERERS: the bespoke Three.js components, addressed by key. This is
// the former switch, now a lookup table — a render_kind='code' cosmetic points
// here via render_spec.key (which the migration 101 backfill seeds to the item
// id). Bounded (~25 entries) and unchanged in behaviour; new cosmetics use the
// data-driven 'asset'/'template' paths instead of growing this map.
export const CODE_RENDERERS: Record<string, (o: BuildingVisualOpts) => ReactNode> = {
  // Aura
  neon_outline: (o) => <NeonOutline width={o.width} height={o.height} depth={o.depth} color={o.color} />,
  particle_aura: (o) => <ParticleAura width={o.width} height={o.height} depth={o.depth} color={o.color} />,
  spotlight: (o) => <SpotlightEffect height={o.height} width={o.width} depth={o.depth} color={o.color} />,
  neon_trim: (o) => <NeonTrim width={o.width} height={o.height} depth={o.depth} color={o.color} />,
  hologram_ring: (o) => <HologramRing width={o.width} height={o.height} depth={o.depth} color={o.color} />,
  lightning_aura: (o) => <LightningAura width={o.width} height={o.height} depth={o.depth} color={o.color} />,
  // Roof
  rooftop_fire: (o) => <RooftopFire height={o.height} width={o.width} depth={o.depth} />,
  antenna_array: (o) => <AntennaArray height={o.height} width={o.width} depth={o.depth} />,
  rooftop_garden: (o) => <RooftopGarden height={o.height} width={o.width} depth={o.depth} />,
  pool_party: (o) => <PoolParty height={o.height} width={o.width} depth={o.depth} />,
  // Crown
  helipad: (o) => <Helipad height={o.height} width={o.width} depth={o.depth} />,
  spire: (o) => <Spire height={o.height} width={o.width} depth={o.depth} />,
  flag: (o) => <Flag height={o.height} width={o.width} depth={o.depth} color={o.color} />,
  satellite_dish: (o) => <SatelliteDish height={o.height} width={o.width} depth={o.depth} color={o.color} />,
  crown_item: (o) => <CrownItem height={o.height} color={o.color} focused={o.focused} />,
  github_star: (o) => <GitHubStar height={o.height} width={o.width} depth={o.depth} color={o.color} />,
  companion_duck: (o) => <CompanionDuck height={o.height} width={o.width} depth={o.depth} variant="companion_duck" />,
  duck_combatant: (o) => <CompanionDuck height={o.height} width={o.width} depth={o.depth} variant="duck_combatant" />,
  duck_gold_animated: (o) => <CompanionDuck height={o.height} width={o.width} depth={o.depth} variant="duck_gold_animated" />,
  // Faces
  billboard: (o) => <Billboards height={o.height} width={o.width} depth={o.depth} images={o.billboardImages ?? []} color={o.color} />,
  led_banner: (o) => <LEDBanner height={o.height} width={o.width} depth={o.depth} color={o.color} />,
  // custom_color tints the building face itself (no overlay mesh)
  custom_color: () => null,
  // Easter egg
  white_rabbit: (o) => <MiniWhiteRabbit height={o.height} width={o.width} depth={o.depth} />,
};

/** Legacy entry point: draw an item by id. Still the single function the live
 *  city, ShopPreview, and the admin gallery call — now backed by CODE_RENDERERS
 *  so coverage can't drift. Prefer cosmeticVisual() for catalog-driven render. */
export function buildingItemVisual(itemId: string, o: BuildingVisualOpts): ReactNode {
  const fn = CODE_RENDERERS[itemId];
  return fn ? fn(o) : null;
}

/** Catalog-driven render: dispatch on the cosmetic's render strategy. This is
 *  what new (data-driven) cosmetics flow through. Code cosmetics resolve back
 *  to CODE_RENDERERS by key, so legacy and new items share one entry point. */
export function cosmeticVisual(
  cosmetic: Pick<Cosmetic, "id" | "slot" | "render_kind" | "render_spec">,
  o: BuildingVisualOpts
): ReactNode {
  switch (cosmetic.render_kind) {
    case "asset": {
      const spec = cosmetic.render_spec as AssetRenderSpec;
      const slot = (cosmetic.slot ?? "roof") as CosmeticSlot;
      return (
        <Suspense fallback={null}>
          <AssetCosmetic spec={spec} opts={o} slot={slot} />
        </Suspense>
      );
    }
    case "template": {
      const spec = cosmetic.render_spec as TemplateRenderSpec;
      return renderTemplate(spec.template, o, spec.params ?? {});
    }
    case "code":
    default: {
      const key = codeKey(cosmetic);
      return buildingItemVisual(key, o);
    }
  }
}

// ─── Preview classification (which scene to compose) ──────────

export type PreviewKind = "building" | "vehicle" | "tag" | "utility";

// Building dims used for every on-building preview / thumbnail.
export const PREVIEW_BD = { width: 18, height: 40, depth: 18 };

// Camera framing per preview kind (shared by the live preview and the
// thumbnail factory so cards match the big preview).
export const PREVIEW_VIEWS: Record<PreviewKind, { cam: [number, number, number]; target: [number, number, number]; fov: number; min: number; max: number }> = {
  building: { cam: [62, 52, 82], target: [0, 32, 0], fov: 42, min: 40, max: 200 },
  tag: { cam: [62, 52, 82], target: [0, 32, 0], fov: 42, min: 40, max: 200 },
  vehicle: { cam: [0, 3, -13], target: [0, 1, 0], fov: 38, min: 6, max: 70 },
  utility: { cam: [0, 3.5, 13], target: [0, 2, 0], fov: 40, min: 6, max: 80 },
};

export function classifyItem(item: { id: string; zone?: string | null; shop_section?: string | null; render_kind?: string | null }): PreviewKind {
  if (item.id === "airplane") return "vehicle"; // default raid vehicle (CRT Terminal mesh)
  if (RAID_VEHICLE_ITEMS.includes(item.id)) return "vehicle"; // legacy hand-coded vehicles
  // Data-driven vehicles: battle-section GLB assets (tags/boosts aren't 'asset').
  if (item.shop_section === "battle" && item.render_kind === "asset") return "vehicle";
  if (RAID_TAG_ITEMS.includes(item.id)) return "tag";
  if (BUILDING_ITEM_IDS.has(item.id)) return "building";
  if (item.zone === "crown" || item.zone === "roof" || item.zone === "aura" || item.zone === "faces") return "building";
  // Boosters, consumables, anything with no in-world model.
  return "utility";
}
