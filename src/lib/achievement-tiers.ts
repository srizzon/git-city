// ─── Achievement tier constants (client-safe) ────────────────
// No server imports — safe for "use client" components.
// Re-exported by lib/achievements.ts for server-side consumers.

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

/** Numeric order for sorting tiers lowest → highest. */
export const TIER_ORDER: Record<string, number> = {
  bronze: 0,
  silver: 1,
  gold: 2,
  diamond: 3,
};
