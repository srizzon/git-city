import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import { mondayOf } from "./rows";
import { sortMilestones, type TownBadges } from "./milestones";

/** Town page badges: Town of the week (this week only) and building milestones. */
export async function getTownBadges(leagueId: string): Promise<TownBadges> {
  const sb = getSupabaseAdmin();
  const [{ data: league }, { data: rows }] = await Promise.all([
    sb.from("leagues").select("featured_week").eq("id", leagueId).maybeSingle(),
    sb.from("town_milestones").select("milestone").eq("league_id", leagueId),
  ]);
  return {
    townOfWeek: league?.featured_week === mondayOf(new Date()),
    milestones: sortMilestones((rows ?? []).map((r) => r.milestone as string)),
  };
}
