import { getLeagueBySlug } from "@/lib/leagues/service";

/** The Brasil town by its slug, or null for any other town. */
export async function brasilLeague(slug: string) {
  const league = await getLeagueBySlug(slug);
  return league?.map === "brasil" ? league : null;
}
