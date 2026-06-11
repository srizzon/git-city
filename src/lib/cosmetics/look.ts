import type { Cosmetic } from "./types";

// Resolve a building "look" into the flat list the CosmeticStage draws. Shared
// by the Store (preview one cosmetic over your equipped look) and the Locker
// (show the full equipped look). Structurally compatible with StageCosmetic.

export interface LookCosmetic {
  cosmetic: Cosmetic;
  billboardImages?: string[];
}

const ZONE_SLOTS = ["crown", "roof", "aura"] as const;
const FALLBACK_TINT = "#c8e64a";

export interface ResolveLookArgs {
  byId: Record<string, Cosmetic>;
  loadout: { crown: string | null; roof: string | null; aura: string | null };
  owned: string[];
  billboardImages: string[];
  customColor: string | null;
  /** Preview override: replaces the equipped cosmetic in its own slot. */
  preview?: Cosmetic | null;
}

export function resolveLook(args: ResolveLookArgs): { cosmetics: LookCosmetic[]; faceColor: string | null } {
  const { byId, loadout, owned, billboardImages, customColor, preview } = args;
  const out: LookCosmetic[] = [];
  const seen = new Set<string>();

  const push = (c: Cosmetic | null | undefined) => {
    if (!c || seen.has(c.id)) return;
    seen.add(c.id);
    out.push({ cosmetic: c, billboardImages: c.id === "billboard" ? billboardImages : undefined });
  };

  // Zone slots: the preview, if it targets this slot, replaces what's equipped.
  for (const slot of ZONE_SLOTS) {
    if (preview && preview.slot === slot) {
      push(preview);
    } else {
      const id = loadout[slot];
      if (id) push(byId[id]);
    }
  }

  // Faces render whenever owned (led_banner, billboard) — same as the live city.
  for (const id of ["led_banner", "billboard"]) {
    if (owned.includes(id)) push(byId[id]);
  }
  // A faces preview (or any non-zone preview) is shown too.
  if (preview && preview.slot !== "crown" && preview.slot !== "roof" && preview.slot !== "aura") {
    push(preview);
  }

  // Face tint: custom_color (saved hex), or previewing it (fallback accent).
  let faceColor: string | null = null;
  if (preview?.id === "custom_color") faceColor = customColor ?? FALLBACK_TINT;
  else if (owned.includes("custom_color") && customColor) faceColor = customColor;

  return { cosmetics: out, faceColor };
}
