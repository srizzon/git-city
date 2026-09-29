import { getLeagueBySlug } from "@/lib/leagues/service";
import { getSupabaseAdmin } from "@/lib/supabase";
import { CITY_DEV_COLUMNS, loadCityExtras, mergeCityExtras } from "@/lib/city-extras";
import { getLeagueCityDevs, getLeagueMembers } from "@/lib/leagues/queries";
import { getCachedCity } from "@/lib/league-city/service";
import type { RIVALRY } from "@/lib/towns/rivalry";
import { townDisplayName } from "@/lib/towns/names";
import type { TownSide } from "./towns-film";

/** One rivalry town as the trailer films play it: its city and its members' buildings. */
export async function loadSide(r: (typeof RIVALRY)[number]): Promise<TownSide | null> {
  const league = await getLeagueBySlug(r.slug);
  if (!league) return null;
  const [members, city] = await Promise.all([
    getLeagueMembers(league.id),
    getCachedCity(league.id),
  ]);
  return {
    slug: r.slug,
    name: townDisplayName(league.name),
    color: r.color,
    city,
    cityDevs: await getLeagueCityDevs(members),
  };
}

/**
 * Real Git City developers to fill the towns' empty lots in a film (the
 * towns are young), split between the two sides: every other one by rank,
 * from the middle of the city, skipping the towns' own members.
 */
export async function loadFill(sides: readonly TownSide[], perSide: number): Promise<Record<string, unknown>[][]> {
  const sb = getSupabaseAdmin();
  const members = new Set(sides.flatMap((s) => s.cityDevs.map((d) => d.id as number)));
  const { data } = await sb
    .from("developers")
    .select(CITY_DEV_COLUMNS)
    .not("rank", "is", null)
    .order("rank", { ascending: true })
    .range(200, 200 + perSide * 2 + members.size + 20)
    .returns<{ id: number; rank: number | null }[]>();
  const devs = (data ?? []).filter((d) => !members.has(d.id));
  const extras = await loadCityExtras(sb, devs.map((d) => d.id));
  const merged = mergeCityExtras(devs, extras) as Record<string, unknown>[];
  return sides.map((_, i) => merged.filter((_, k) => k % sides.length === i).slice(0, perSide));
}
