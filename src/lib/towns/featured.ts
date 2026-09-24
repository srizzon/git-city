export interface WeeklyVisitors {
  league_id: string;
  visitors: number;
  /** First qualified visit of the week: the earlier town wins a tie. */
  first_at: string | null;
}

/**
 * Town of the week: most qualified visitors last week. Last week's winner
 * can't repeat (the runner-up takes it). `overrideId` (a staff pick) always
 * wins. Null when no town had a visitor.
 */
export function pickTownOfWeek(
  weekly: WeeklyVisitors[],
  lastWinnerId: string | null,
  overrideId: string | null = null,
): string | null {
  if (overrideId) return overrideId;
  const ranked = weekly
    .filter((w) => w.visitors > 0 && w.league_id !== lastWinnerId)
    .sort((a, b) => b.visitors - a.visitors || firstAt(a) - firstAt(b) || a.league_id.localeCompare(b.league_id));
  return ranked[0]?.league_id ?? null;
}

function firstAt(w: WeeklyVisitors): number {
  return w.first_at ? new Date(w.first_at).getTime() : Number.MAX_SAFE_INTEGER;
}
