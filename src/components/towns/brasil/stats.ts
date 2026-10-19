// What the Brasil town's panels show about a state, from the layout and the
// residents' buildings: every dev who lives in it (all its cities), its
// cities biggest first, its capital's founder, its place, its contributions
// and who came this week.

import type { CityBuilding } from "@/lib/github";
import { BRASIL_LAUNCH } from "@/lib/towns/brasil-day";
import { STATES, stateOf, type BrasilLayout, type CityLayout, type UF } from "@/lib/towns/brasil-map";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface StateStats {
  uf: UF;
  name: string;
  capital: CityLayout;
  /** Its cities on the map, most devs first (the capital among them, lived in or not). */
  cities: CityLayout[];
  devs: number;
  founder: string | null;
  contributions: number;
  newThisWeek: number;
  /** 1-based among states with anyone (states with nobody share the last place). */
  place: number;
  /** Logins, most contributions first. */
  top: string[];
}

export function stateStats(layout: BrasilLayout, byLogin: ReadonlyMap<string, CityBuilding>, now: number): StateStats[] {
  const all = [...layout.cities, layout.island];
  const rows = STATES.map((s) => {
    const devs = all.flatMap((c) => c.devs.filter((d) => d.dev.uf === s.uf));
    const capital = layout.cities.find((c) => c.uf === s.uf && c.capital) as CityLayout;
    const cities = layout.cities.filter((c) => c.uf === s.uf).sort((a, b) => b.devs.length - a.devs.length || Number(b.capital) - Number(a.capital) || a.name.localeCompare(b.name));
    const contrib = (login: string) => byLogin.get(login.toLowerCase())?.contributions ?? 0;
    return {
      uf: s.uf,
      name: stateOf(s.uf).name,
      capital,
      cities,
      devs: devs.length,
      founder: capital.devs.find((d) => d.founder)?.dev.login ?? null,
      contributions: devs.reduce((n, d) => n + contrib(d.dev.login), 0),
      newThisWeek: devs.filter((d) => now - d.at < WEEK_MS).length,
      place: 0,
      top: [...devs].sort((a, b) => contrib(b.dev.login) - contrib(a.dev.login)).slice(0, 5).map((d) => d.dev.login),
    };
  });
  const ranked = [...rows].sort((a, b) => b.devs - a.devs || a.name.localeCompare(b.name));
  const last = ranked.filter((r) => r.devs > 0).length + 1;
  ranked.forEach((r, i) => (r.place = r.devs > 0 ? i + 1 : last));
  return ranked;
}

/** The state's swatch: its flag's first color that isn't white. */
export function swatchOf(uf: UF): string {
  const c = stateOf(uf).colors;
  return c[0] === "#ffffff" ? c[1] : c[0];
}

// ─── State of the week ──────────────────────────────────────
// The state that gained the most devs in the last full week (Monday to
// Sunday, Brasília time) holds the crown all of this week, frozen on Monday
// like the towns' war; the state gaining most this week so far is "leading".
// A tie goes to the state with more devs. Counts arrivals by when each
// resident took their lot (a move counts for the new state).

const BRT_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface WeekStanding {
  uf: UF;
  gained: number;
}

/** The start (ms) of the Brasília week holding `now`: Monday 00:00. */
export function weekStart(now: number): number {
  const local = now - BRT_MS;
  const day = Math.floor(local / DAY_MS);
  // Day 0 of the epoch (1970-01-01) was a Thursday: Monday is 3 days later.
  const monday = day - ((day - 4 + 7 * 1000) % 7);
  return monday * DAY_MS + BRT_MS;
}

function topGainer(layout: BrasilLayout, from: number, to: number): WeekStanding | null {
  const gained = new Map<UF, number>();
  const total = new Map<UF, number>();
  for (const c of [...layout.cities, layout.island])
    for (const d of c.devs) {
      if (!d.dev.uf) continue;
      total.set(d.dev.uf, (total.get(d.dev.uf) ?? 0) + 1);
      if (d.at >= from && d.at < to) gained.set(d.dev.uf, (gained.get(d.dev.uf) ?? 0) + 1);
    }
  let best: WeekStanding | null = null;
  for (const [uf, n] of gained)
    if (!best || n > best.gained || (n === best.gained && (total.get(uf) ?? 0) > (total.get(best.uf) ?? 0))) best = { uf, gained: n };
  return best;
}

/** The first full week after launch: a crown is only ever given for a whole week. */
function firstFullWeek(launch: string): number {
  const day = Date.parse(`${launch}T00:00:00Z`) + BRT_MS;
  const monday = weekStart(day);
  return monday === day ? monday : monday + 7 * DAY_MS;
}

export function weekCrown(layout: BrasilLayout, now: number, launch = BRASIL_LAUNCH): { crown: WeekStanding | null; leading: WeekStanding | null } {
  const start = weekStart(now);
  const lastWeek = start - 7 * DAY_MS;
  return { crown: lastWeek >= firstFullWeek(launch) ? topGainer(layout, lastWeek, start) : null, leading: topGainer(layout, start, now + 1) };
}
