import "server-only";
import { revalidateTag } from "next/cache";

// The league page caches its viewer-independent data (standings, hall of
// fame, city) for 60s under one tag per league. Writes that change what a
// visitor sees expire it, so the writer's own refresh shows the change.

export function leagueTag(leagueId: string): string {
  return `league:${leagueId}`;
}

/** Expires the league's cached page data. Never throws (crons, renders, after()). */
export function invalidateLeague(leagueId: string): void {
  try {
    revalidateTag(leagueTag(leagueId), { expire: 0 });
  } catch {
    // outside a request scope: the 60s revalidate catches up
  }
}
