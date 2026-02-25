// ─── Shared zone & item constants ────────────────────────────
// Single source of truth — imported by Building3D, ShopClient, loadout API, ShopPreview

export const ZONE_ITEMS: Record<string, string[]> = {
  crown: ["flag", "helipad", "spire", "satellite_dish", "crown_item"],
  roof: ["antenna_array", "rooftop_garden", "rooftop_fire", "pool_party"],
  aura: ["neon_trim", "spotlight", "hologram_ring", "lightning_aura", "neon_outline", "particle_aura"],
};

export const ZONE_LABELS: Record<string, string> = {
  crown: "Crown",
  roof: "Roof",
  aura: "Aura",
};

export const ITEM_NAMES: Record<string, string> = {
  flag: "Flag",
  helipad: "Helipad",
  spire: "Water Tower",
  satellite_dish: "Satellite Dish",
  crown_item: "Crown",
  antenna_array: "Solar Panels",
  rooftop_garden: "Rooftop Garden",
  rooftop_fire: "Rooftop Fire",
  pool_party: "Pool Party",
  neon_trim: "Neon Trim",
  spotlight: "Spotlight",
  hologram_ring: "Hologram Ring",
  lightning_aura: "Lightning Aura",
  custom_color: "Custom Color",
  billboard: "Billboard",
  led_banner: "LED Banner",
  neon_outline: "Neon Outline",
  particle_aura: "Particle Aura",
  streak_freeze: "Streak Freeze",
};

// Correct mapping: item_id → achievement that unlocks it (from migration 007 seed)
export const ACHIEVEMENT_ITEMS: Record<string, { achievement: string; label: string }> = {
  flag: { achievement: "first_push", label: "First Push (1+ contributions)" },
  custom_color: { achievement: "committed", label: "Committed (1,000+ contributions)" },
  neon_trim: { achievement: "grinder", label: "Grinder (2,500+ contributions)" },
  antenna_array: { achievement: "builder", label: "Builder (25+ repos)" },
  rooftop_garden: { achievement: "architect", label: "Architect (75+ repos)" },
  spotlight: { achievement: "rising_star", label: "Rising Star (100+ stars)" },
  helipad: { achievement: "recruiter", label: "Recruiter (10+ referrals)" },
};

export const ITEM_EMOJIS: Record<string, string> = {
  flag: "🏁", helipad: "🚁", spire: "🪣", satellite_dish: "📡", crown_item: "👑",
  antenna_array: "☀️", rooftop_garden: "🌿", rooftop_fire: "🔥", pool_party: "🏊",
  neon_trim: "💡", spotlight: "🔦", hologram_ring: "💫", lightning_aura: "⚡",
  custom_color: "🎨", billboard: "📺", led_banner: "🪧",
  neon_outline: "🔮", particle_aura: "✨",
  streak_freeze: "🧊",
};

export const FACES_ITEMS = ["custom_color", "billboard", "led_banner"];
