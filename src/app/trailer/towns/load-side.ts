import { getLeagueBySlug } from "@/lib/leagues/service";
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
