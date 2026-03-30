import type { CandidateBadge, CandidateBadgeInfo } from "./types";

export const BADGE_INFO: Record<CandidateBadge, CandidateBadgeInfo> = {
  top_contributor: { id: "top_contributor", label: "Top Contributor", color: "#c8e64a" },
  active_streak: { id: "active_streak", label: "Active Streak", color: "#4ade80" },
  full_portfolio: { id: "full_portfolio", label: "Full Portfolio", color: "#60a5fa" },
  open_source: { id: "open_source", label: "Open Source", color: "#fbbf24" },
  verified_profile: { id: "verified_profile", label: "Verified Profile", color: "#a78bfa" },
};

interface ScoreInput {
  contributions: number;
  stars: number;
  streak: number;
  level: number;
  has_profile: boolean;
  has_projects: boolean;
  has_experiences: boolean;
}

/** Calculate quality score 0-100 for a candidate */
export function calculateQualityScore(input: ScoreInput): number {
  let score = 0;

  // Contributions: 0-25 pts (logarithmic, caps at ~5000)
  if (input.contributions > 0) {
    score += Math.min(25, (Math.log10(input.contributions) / Math.log10(5000)) * 25);
  }

  // Streak: 0-15 pts
  if (input.streak >= 30) score += 15;
  else if (input.streak >= 7) score += 10;
  else if (input.streak >= 3) score += 5;

  // Portfolio: 0-20 pts (projects = 10, experiences = 10)
  if (input.has_projects) score += 10;
  if (input.has_experiences) score += 10;

  // Career profile complete: 0-15 pts
  if (input.has_profile) score += 15;

  // Stars: 0-10 pts (logarithmic, caps at ~500)
  if (input.stars > 0) {
    score += Math.min(10, (Math.log10(input.stars) / Math.log10(500)) * 10);
  }

  // Level/XP: 0-15 pts (linear, 25 levels max)
  score += Math.min(15, (input.level / 25) * 15);

  return Math.round(Math.min(100, score));
}

/** Determine which badges a candidate earns */
export function calculateBadges(input: ScoreInput): CandidateBadge[] {
  const badges: CandidateBadge[] = [];

  if (input.contributions >= 1000) badges.push("top_contributor");
  if (input.streak >= 7) badges.push("active_streak");
  if (input.has_projects && input.has_experiences) badges.push("full_portfolio");
  if (input.stars >= 50) badges.push("open_source");
  if (input.has_profile) badges.push("verified_profile");

  return badges;
}
