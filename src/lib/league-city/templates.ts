// ─── Town templates ─────────────────────────────────────────
// What a new town starts as: a starter city layout (starter.ts) and the
// settings that fit it. Picked on /towns/new; after that the town is the
// admin's to change, nothing remembers which template it came from.

import type { ScoringMode } from "@/lib/leagues/scoring";
import type { JoinMode } from "@/lib/towns/joining";

export const TEMPLATE_IDS = ["crew", "race", "hq", "park", "blank"] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

export interface TownTemplate {
  id: TemplateId;
  name: string;
  /** One line on the card: what the town is for. */
  blurb: string;
  scoring: ScoringMode;
  join: JoinMode;
}

export const TEMPLATES: readonly TownTemplate[] = [
  { id: "crew", name: "Crew", blurb: "A main street and a plaza for your friends.", scoring: "xp", join: "request" },
  { id: "race", name: "Race track", blurb: "A loop with ramps and boost pads.", scoring: "xp", join: "request" },
  { id: "hq", name: "Company HQ", blurb: "Downtown blocks. The race counts code only.", scoring: "contributions", join: "request" },
  { id: "park", name: "Park village", blurb: "Few streets, lots of trees, a big plaza.", scoring: "xp", join: "request" },
  { id: "blank", name: "Blank", blurb: "Just the gate. Build everything yourself.", scoring: "xp", join: "request" },
];

export const DEFAULT_TEMPLATE: TemplateId = "crew";
/** A company town's starter city unless its creator picks another. */
export const COMPANY_TEMPLATE: TemplateId = "hq";

export function isTemplateId(v: unknown): v is TemplateId {
  return typeof v === "string" && (TEMPLATE_IDS as readonly string[]).includes(v);
}

export function templateFor(id: TemplateId): TownTemplate {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
}

export const SCORING_LABEL: Record<ScoringMode, string> = {
  xp: "Code + XP",
  contributions: "Code only",
};

export const JOIN_LABEL: Record<JoinMode, string> = {
  open: "Anyone",
  request: "Ask first",
  invite: "Invite only",
};
