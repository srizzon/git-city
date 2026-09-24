export type Milestone = "first_road" | "objects_50" | "buildings_100";

export const MILESTONE_LABELS: Record<Milestone, string> = {
  first_road: "First road",
  objects_50: "50 objects",
  buildings_100: "100 buildings",
};

const ORDER: Milestone[] = ["first_road", "objects_50", "buildings_100"];

/** Known milestones in display order; unknown values are dropped. */
export function sortMilestones(values: readonly string[]): Milestone[] {
  return ORDER.filter((m) => values.includes(m));
}

export interface TownBadges {
  /** Town of the week this week. */
  townOfWeek: boolean;
  milestones: Milestone[];
}
