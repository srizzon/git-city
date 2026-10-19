// ─── Brasil town: every city in Brazil ──────────────────────
// The 5,571 municipalities (IBGE codes, names, states, where their seat is:
// br-cities.json, from kelvins/municipios-brasileiros, MIT, compiled from
// IBGE), and the resolver that turns what someone typed ("sampa", "campinas
// sp", "sao jose dos campos") into one of them. Deterministic, no model: the
// Instagram AI only pulls the place out of a comment, this decides the city.
//
// Pure. The list is big (~90 KB gzipped): the client loads it on demand.

import RAW from "./br-cities.json";
import { normalize, slugOf } from "./br-slug";
import type { UF } from "./brasil-map";

export interface BrCity {
  /** IBGE code: the city's id everywhere. */
  ibge: number;
  name: string;
  uf: UF;
  /** The seat, [lon, lat]. */
  at: [number, number];
  capital: boolean;
}

/** Fernando de Noronha: the island. */
export const NORONHA = 2605459;

export const CITIES: BrCity[] = (RAW as [number, string, string, number, number, number][]).map(([ibge, name, uf, lon, lat, cap]) => ({
  ibge,
  name,
  uf: uf as UF,
  at: [lon, lat],
  capital: cap === 1,
}));

const BY_IBGE = new Map(CITIES.map((c) => [c.ibge, c]));
export const cityOf = (ibge: number): BrCity | undefined => BY_IBGE.get(ibge);

/** Each state's capital. */
export const CAPITAL_OF = new Map(CITIES.filter((c) => c.capital).map((c) => [c.uf, c]));

export { normalize };

/** The city's address in links: "campinas-sp". */
export const citySlug = (c: BrCity) => slugOf(c.name, c.uf);

const BY_SLUG = new Map(CITIES.map((c) => [citySlug(c), c]));
export const cityBySlug = (slug: string): BrCity | undefined => BY_SLUG.get(slug.toLowerCase());

const BY_NAME = new Map<string, BrCity[]>();
for (const c of CITIES) {
  const n = normalize(c.name);
  BY_NAME.set(n, [...(BY_NAME.get(n) ?? []), c]);
}

/** What people call their city. */
const NICKNAMES: Record<string, number> = {
  sampa: 3550308,
  "sao paulo capital": 3550308,
  "sp capital": 3550308,
  "capital paulista": 3550308,
  sjc: 3549904,
  sjrp: 3549805,
  "rio preto": 3549805,
  rp: 3543402,
  ribeirao: 3543402,
  sanca: 3548906,
  rio: 3304557,
  "rio de janeiro capital": 3304557,
  bh: 3106200,
  beaga: 3106200,
  "belo horizonte capital": 3106200,
  floripa: 4205407,
  poa: 4314902,
  "porto alegre capital": 4314902,
  cwb: 4106902,
  bsb: 5300108,
  brasilia: 5300108,
  jampa: 2507507,
  ssa: 2927408,
  vix: 3205309,
  bc: 4202008,
  balneario: 4202008,
  noronha: NORONHA,
};

const UF_WORDS = new Set(["ac", "al", "ap", "am", "ba", "ce", "df", "es", "go", "ma", "mt", "ms", "mg", "pa", "pb", "pr", "pe", "pi", "rj", "rn", "rs", "ro", "rr", "sc", "sp", "se", "to"]);

/** Edits between two strings (a swap of two letters side by side is one), capped past `max`. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], prev2[j - 2] + 1);
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length];
}

export type Resolved =
  | { kind: "city"; city: BrCity }
  /** The same name in several states: ask which. */
  | { kind: "ambiguous"; options: BrCity[] }
  | { kind: "none" };

/**
 * The city someone meant. `uf` (the state they named elsewhere) settles a
 * name several states share; without it a capital wins, else it's ambiguous.
 * Typos up to two letters off (one for short names) still find it.
 */
export function resolveCity(text: string, uf: UF | null = null): Resolved {
  let n = normalize(text).replace(/^(sou de|moro em|moro no|moro na|de|em|from|cidade de|cidade)\s+/, "");
  // "campinas sp", "campinas - sp", "campinas/sp": the trailing state settles it.
  const words = n.split(" ");
  if (words.length > 1 && UF_WORDS.has(words[words.length - 1])) {
    uf = words[words.length - 1].toUpperCase() as UF;
    n = words.slice(0, -1).join(" ");
  }
  if (!n) return { kind: "none" };
  const nick = NICKNAMES[n];
  if (nick) return { kind: "city", city: BY_IBGE.get(nick)! };

  const pick = (found: BrCity[]): Resolved => {
    const here = uf ? found.filter((c) => c.uf === uf) : found;
    if (here.length === 1) return { kind: "city", city: here[0] };
    if (here.length === 0) return uf && found.length ? pick2(found) : { kind: "none" };
    const capital = here.filter((c) => c.capital);
    if (capital.length === 1) return { kind: "city", city: capital[0] };
    return { kind: "ambiguous", options: here };
  };
  // A state named that doesn't have the city: the name alone decides.
  const pick2 = (found: BrCity[]): Resolved => (found.length === 1 ? { kind: "city", city: found[0] } : { kind: "ambiguous", options: found });

  const exact = BY_NAME.get(n);
  if (exact) return pick(exact);
  if (n.length < 4) return { kind: "none" };
  const max = n.length > 6 ? 2 : 1;
  let best = max + 1;
  let found: BrCity[] = [];
  for (const [name, cs] of BY_NAME) {
    const d = editDistance(n, name, max);
    if (d < best) {
      best = d;
      found = [...cs];
    } else if (d === best && d <= max) found.push(...cs);
  }
  return best <= max ? pick(found) : { kind: "none" };
}

/**
 * Cities for a search box, best first: the name itself, then names starting
 * with it, then a word of the name starting with it. `devs` (a city's devs
 * on the map) ranks lived-in cities first among equals, then capitals.
 */
export function searchCities(query: string, limit = 8, devs?: (ibge: number) => number): BrCity[] {
  const q = normalize(query);
  if (q.length < 2) return [];
  const scored: { c: BrCity; s: number }[] = [];
  for (const c of CITIES) {
    const n = normalize(c.name);
    const full = `${n} ${c.uf.toLowerCase()}`;
    const s = n === q || full === q ? 0 : n.startsWith(q) || full.startsWith(q) ? 1 : n.split(" ").some((w) => w.startsWith(q)) ? 2 : -1;
    if (s >= 0) scored.push({ c, s });
  }
  const lived = (c: BrCity) => devs?.(c.ibge) ?? 0;
  return scored
    .sort((a, b) => a.s - b.s || lived(b.c) - lived(a.c) || Number(b.c.capital) - Number(a.c.capital) || a.c.name.length - b.c.name.length || a.c.name.localeCompare(b.c.name))
    .slice(0, limit)
    .map((x) => x.c);
}
