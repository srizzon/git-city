import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isoDay } from "@/lib/leagues/scoring";
import { pickTownOfWeek, type WeeklyVisitors } from "./featured";

export interface TownWeekResult {
  rolled_up: number;
  featured: string | null;
}

/**
 * Monday step after the race close: rolls last week's visits into
 * town_visits_weekly, then features Town of the week for the week that
 * starts now and grants its admin the emblem. Safe to rerun: the rollup
 * overwrites, the emblem's claim key is per town per week.
 */
export async function closeTownWeek(start: Date): Promise<TownWeekResult> {
  const sb = getSupabaseAdmin();
  const week = isoDay(start);
  const next = new Date(start);
  next.setUTCDate(next.getUTCDate() + 7);
  const featuredWeek = isoDay(next);

  const { data: rolled, error } = await sb.rpc("rollup_town_visits", { p_week_start: week });
  if (error) throw error;

  const [{ data: weekly }, { data: current }, override] = await Promise.all([
    sb
      .from("town_visits_weekly")
      .select("league_id, visitors, first_at, leagues!inner(hidden)")
      .eq("week_start", week)
      .eq("leagues.hidden", false),
    sb.from("leagues").select("id").eq("featured_week", week).limit(1).maybeSingle(),
    overrideId(),
  ]);

  const winner = pickTownOfWeek((weekly ?? []) as WeeklyVisitors[], (current?.id as string | undefined) ?? null, override);
  if (!winner) return { rolled_up: (rolled as number | null) ?? 0, featured: null };

  // A rerun that picks another town moves the spot instead of sharing it.
  await sb.from("leagues").update({ featured_week: null }).eq("featured_week", featuredWeek).neq("id", winner);
  const { data: town, error: setError } = await sb
    .from("leagues")
    .update({ featured_week: featuredWeek })
    .eq("id", winner)
    .select("id, slug, admin_id")
    .single();
  if (setError) throw setError;

  if (town.admin_id) {
    await sb.rpc("grant_emblem", {
      p_developer_id: town.admin_id,
      p_emblem_id: "town_of_week",
      p_claim_key: `town_of_week:${town.id}:${week}`,
      p_meta: { league_id: town.id, week_start: week },
      p_source: "town",
    });
  }
  return { rolled_up: (rolled as number | null) ?? 0, featured: town.slug as string };
}

/** TOWN_OF_WEEK_OVERRIDE holds a town slug: a staff pick until visit data exists. */
async function overrideId(): Promise<string | null> {
  const slug = process.env.TOWN_OF_WEEK_OVERRIDE?.trim().toLowerCase();
  if (!slug) return null;
  const { data } = await getSupabaseAdmin().from("leagues").select("id").eq("slug", slug).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}
