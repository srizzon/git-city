"use client";

import type { ComponentType } from "react";
import type { SponsorBuildingProps } from "@/lib/sponsors/registry";
import FirecrawlBuilding from "@/lib/sponsors/buildings/FirecrawlBuilding";
import GuaraCloudBuilding from "@/lib/sponsors/buildings/GuaraCloudBuilding";
import SolanaHackathonBuilding from "@/lib/sponsors/buildings/SolanaHackathonBuilding";
import UltraContextBuilding from "@/lib/sponsors/buildings/UltraContextBuilding";
import SponsorCityBuilding from "@/lib/sponsors/buildings/SponsorCityBuilding";
import type { CustomComponentName } from "./custom-component-names";

/**
 * Maps `custom_component` DB values to real React components.
 *
 * Why this is in code (not DB): components are code. The DB stores the
 * name only — the actual rendering is resolved client-side.
 *
 * Why these 3 specific entries exist: they are legacy sponsors that
 * predate this refactor. We kept them as `building_kind='custom'` to
 * guarantee 100% visual parity (the old bespoke rendering code is still
 * running). Phase 2 can migrate them to `building_kind='tower'` and
 * delete this registry entirely.
 *
 * New landmarks created via the admin UI always use `tower` kind.
 * They never touch this file.
 *
 * The `Record<CustomComponentName, ...>` type forces every name declared
 * in `custom-component-names.ts` to have a component here — no drift.
 */
export const CUSTOM_COMPONENTS: Record<
  CustomComponentName,
  ComponentType<SponsorBuildingProps>
> = {
  firecrawl: FirecrawlBuilding,
  guaracloud: GuaraCloudBuilding,
  "solana-hackathon": SolanaHackathonBuilding,
  ultracontext: UltraContextBuilding,
  "sponsor-city": SponsorCityBuilding,
};
