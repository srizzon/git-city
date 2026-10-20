// ─── Brasil town: the cities ────────────────────────────────
// Brazil on its real outline (brasil-geo.ts), and every one of its cities
// (br-cities.ts) that someone lives in: the first dev from a city founds it,
// with its square, and it grows forever round its own middle. A city is a
// street grid of small blocks (three lots a side, a street all round); its
// blocks are taken nearest first by a wobbly distance, so no two cities have
// the same outline. In the founder's block the middle is the square; in the
// others, two lots in three get a building and the rest are lawn and trees,
// so there's room to drive.
//
// A dev's lot is stored inside their city and never changes. The city as a
// whole stands near its real place and moves only to make room (BrasilMap).
// The capitals are always there, lived in or not. Devs who never said their
// city live on the island off the north-east coast (Fernando de Noronha),
// which grows out to sea. Highways are streets too.
//
// Pure: lots in, lots out (lib/league-city/grid).

import { LOT } from "../league-city/grid";
import { CAPITAL_OF, NORONHA, cityOf, type BrCity } from "./br-cities";
import { slugOf } from "./br-slug";
import { inDriftSite } from "./brasil-drift";
import { ISLAND, geoAt, landAt, landGrid, project } from "./brasil-geo";

export type UF =
  | "AC"
  | "AL"
  | "AP"
  | "AM"
  | "BA"
  | "CE"
  | "DF"
  | "ES"
  | "GO"
  | "MA"
  | "MT"
  | "MS"
  | "MG"
  | "PA"
  | "PB"
  | "PR"
  | "PE"
  | "PI"
  | "RJ"
  | "RN"
  | "RS"
  | "RO"
  | "RR"
  | "SC"
  | "SP"
  | "SE"
  | "TO";

export interface BrState {
  uf: UF;
  name: string;
  /** The state flag's main colors, for its tag. */
  colors: string[];
  /** People, millions (2022 census): the preview's fake devs follow it. */
  pop: number;
}

export const STATES: BrState[] = [
  { uf: "AC", name: "Acre", colors: ["#f2c300", "#1d8a3c", "#d62828"], pop: 0.83 },
  { uf: "AL", name: "Alagoas", colors: ["#d62828", "#ffffff", "#1f4fa8"], pop: 3.1 },
  { uf: "AP", name: "Amapá", colors: ["#1f4fa8", "#f2c300", "#1d8a3c"], pop: 0.73 },
  { uf: "AM", name: "Amazonas", colors: ["#ffffff", "#1f4fa8", "#d62828"], pop: 3.9 },
  { uf: "BA", name: "Bahia", colors: ["#1f4fa8", "#ffffff", "#d62828"], pop: 14.1 },
  { uf: "CE", name: "Ceará", colors: ["#1d8a3c", "#f2c300", "#ffffff"], pop: 8.8 },
  { uf: "DF", name: "Distrito Federal", colors: ["#ffffff", "#1d8a3c", "#f2c300"], pop: 2.8 },
  { uf: "ES", name: "Espírito Santo", colors: ["#1f4fa8", "#ffffff", "#f4a6c8"], pop: 3.8 },
  { uf: "GO", name: "Goiás", colors: ["#1d8a3c", "#f2c300", "#1f4fa8"], pop: 7.1 },
  { uf: "MA", name: "Maranhão", colors: ["#d62828", "#ffffff", "#111111"], pop: 6.8 },
  { uf: "MT", name: "Mato Grosso", colors: ["#1f4fa8", "#ffffff", "#1d8a3c"], pop: 3.7 },
  { uf: "MS", name: "Mato Grosso do Sul", colors: ["#ffffff", "#1d8a3c", "#1f4fa8"], pop: 2.8 },
  { uf: "MG", name: "Minas Gerais", colors: ["#ffffff", "#d62828", "#ffffff"], pop: 20.5 },
  { uf: "PA", name: "Pará", colors: ["#d62828", "#ffffff", "#1f4fa8"], pop: 8.1 },
  { uf: "PB", name: "Paraíba", colors: ["#111111", "#d62828", "#ffffff"], pop: 4.0 },
  { uf: "PR", name: "Paraná", colors: ["#1d8a3c", "#ffffff", "#1f4fa8"], pop: 11.4 },
  { uf: "PE", name: "Pernambuco", colors: ["#1f4fa8", "#ffffff", "#d62828"], pop: 9.1 },
  { uf: "PI", name: "Piauí", colors: ["#1d8a3c", "#f2c300", "#1f4fa8"], pop: 3.3 },
  { uf: "RJ", name: "Rio de Janeiro", colors: ["#1f4fa8", "#ffffff", "#1f4fa8"], pop: 16.1 },
  { uf: "RN", name: "Rio Grande do Norte", colors: ["#1d8a3c", "#ffffff", "#f2c300"], pop: 3.3 },
  { uf: "RS", name: "Rio Grande do Sul", colors: ["#1d8a3c", "#d62828", "#f2c300"], pop: 10.9 },
  { uf: "RO", name: "Rondônia", colors: ["#1f4fa8", "#f2c300", "#1d8a3c"], pop: 1.6 },
  { uf: "RR", name: "Roraima", colors: ["#1f4fa8", "#ffffff", "#1d8a3c"], pop: 0.64 },
  { uf: "SC", name: "Santa Catarina", colors: ["#d62828", "#ffffff", "#1d8a3c"], pop: 7.6 },
  { uf: "SP", name: "São Paulo", colors: ["#111111", "#ffffff", "#d62828"], pop: 44.4 },
  { uf: "SE", name: "Sergipe", colors: ["#1d8a3c", "#f2c300", "#1f4fa8"], pop: 2.2 },
  { uf: "TO", name: "Tocantins", colors: ["#1f4fa8", "#f2c300", "#ffffff"], pop: 1.5 },
];

export const UFS = STATES.map((s) => s.uf);
const BY_UF = new Map(STATES.map((s) => [s.uf, s]));
export const stateOf = (uf: UF) => BY_UF.get(uf) as BrState;

/** A state's sigla in a comment ("SP", "sp"), or null. */
export function parseUF(word: string): UF | null {
  const u = word.trim().toUpperCase();
  return BY_UF.has(u as UF) ? (u as UF) : null;
}

export const CITY = {
  /** A block is this many lots a side, with a street all round (period = side + 1). */
  block: 3,
  /** Share of a block's edge lots left as lawn. */
  lawn: 0.34,
  /** How much the outline wobbles (0: round). */
  wobble: 0.35,
  /** Lots of open country kept between two cities. */
  gapLots: 3,
  /** A city takes a block that's farther round (blocks) to keep off a neighbor, before it pushes the neighbor away. */
  detour: 1.5,
  /** How far (lots) a city may stand from its real place, beyond its own reach, before Brazil grows instead. */
  drift: 10,
  /** A city of this many blocks or more never goes astray: Brazil grows first. */
  anchored: 4,
  /** The island's smallest radius (lots), for its shore. */
  islandMin: 5,
  /** Open sea (lots) between the island's hub and the coast; its blocks keep islandShore of it. */
  islandSea: 16,
  islandShore: 10,
  /** How much Brazil grows when it runs out of room. */
  scaleStep: 1.1,
  /** Share of the land the cities may cover before Brazil grows. */
  maxFill: 0.45,
} as const;

const P = CITY.block + 1;

/** A dev living on the map. */
export interface MapDev {
  id: number;
  login: string;
  /** Their state; null: never said (the island). */
  uf: UF | null;
}

/** HUB, as stored: a city's resident, or the island's. */
export const HUB = { city: 0, island: 9 } as const;

/** A dev with their stored lot, in the order they arrived (`at`: ms, or any increasing number). */
export interface Resident {
  dev: MapDev;
  /** The city's IBGE code; null: the island (Noronha's own devs live there too). */
  city: number | null;
  /** The lot inside the city, from its middle: it never changes. */
  lx: number;
  lz: number;
  at: number;
}

/** Where a city stands on the map (its middle, in lots): it moves when the map makes room. */
export interface StoredCity {
  ibge: number;
  cx: number;
  cz: number;
}

/** Everything stored about the map: the cities' places, the residents, and how big Brazil is. */
export interface MapState {
  scale: number;
  cities: StoredCity[];
  residents: Resident[];
}

export interface CityLayout {
  /** The city's id on the map: its IBGE code, or "island". */
  key: string;
  ibge: number | null;
  uf: UF | null;
  name: string;
  /** Its link (?cidade=campinas-sp); null for the island. */
  slug: string | null;
  capital: boolean;
  /** The city's square (lot): its tag stands here. */
  center: [number, number];
  /** In the order they arrived (`at`, as stored); x, z on the map. */
  devs: { dev: MapDev; x: number; z: number; founder: boolean; at: number }[];
  roads: [number, number][];
  /** Lawn lots inside the city (trees go here). */
  lawns: [number, number][];
  /** How far the city reaches from its hub (lots), for the island's shore and the camera. */
  radius: number;
  /** The blocks in use: each one's north-west lot (inside its streets), for the paving. */
  blocks: [number, number][];
  /** Where the city's two avenues cross (a street lot): highways come in here. */
  hub: [number, number];
}

export interface BrasilLayout {
  scale: number;
  /** The capitals (always, lived in or not) and every city someone lives in. */
  cities: CityLayout[];
  island: CityLayout;
  /** Highway streets between cities (lots). */
  highways: [number, number][];
}

function hash(x: number, z: number, s: number): number {
  let h = (x * 374761393 + z * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const key = (x: number, z: number) => `${x},${z}`;
const unkey = (k: string) => k.split(",").map(Number) as [number, number];
const ISLAND_KEY = "island";
export const cityKeyOf = (ibge: number | null): string => (ibge === null || ibge === NORONHA ? ISLAND_KEY : String(ibge));

/** A city in the engine: its fixed shape (block order) and where it stands now. */
interface City {
  key: string;
  ibge: number | null;
  info: BrCity | null;
  seed: number;
  /** Its real place at S = 1 (lots, fractional). */
  anchor: [number, number];
  /** Its middle on the map (lots): the corner its block grid starts from. */
  center: [number, number];
  /** Blocks in use (local "bx,bz"), in the order taken; [0] is the founder's. */
  blocks: string[];
  blockSet: Set<string>;
  /** Lots taken (local). */
  taken: Set<string>;
  residents: Resident[];
  /** Block offsets nearest first by a wobbly distance, built as far as needed. */
  order: [number, number][];
  orderR: number;
  /** When it was founded (its first resident's `at`); empty capitals last. */
  founded: number;
  /** Cached: its footprint's blocks and their bounding box, from its middle (cleared when it grows). */
  fp: [number, number][] | null;
  box: { x0: number; x1: number; z0: number; z1: number } | null;
}

function blockOrder(seed: number, r: number): [number, number][] {
  const phase = hash(seed, 7, 3) * Math.PI * 2;
  const wob = (a: number) => 1 + CITY.wobble * (0.6 * Math.sin(2 * a + phase) + 0.4 * Math.sin(3 * a + phase * 1.7));
  const out: { b: [number, number]; d: number }[] = [];
  for (let bx = -r; bx <= r; bx++) for (let bz = -r; bz <= r; bz++) out.push({ b: [bx, bz], d: Math.hypot(bx + 0.5, bz + 0.5) / wob(Math.atan2(bz + 0.5, bx + 0.5)) });
  out.sort((a, b) => a.d - b.d || a.b[0] - b.b[0] || a.b[1] - b.b[1]);
  // Only what's surely inside the square (a wobbly ring can poke out of it).
  const safe = r / (1 + CITY.wobble);
  return out.filter((o) => o.d <= safe).map((o) => o.b);
}

/** A block's lots inside its streets (local), and its middle. */
function blockLots([bx, bz]: [number, number]): { lots: [number, number][]; mid: [number, number] } {
  const lots: [number, number][] = [];
  for (let u = 1; u <= CITY.block; u++) for (let v = 1; v <= CITY.block; v++) lots.push([bx * P + u, bz * P + v]);
  return { lots, mid: lots[Math.floor(lots.length / 2)] };
}

/** The block a local lot falls in, or null on a street. */
function blockAt(lx: number, lz: number): [number, number] | null {
  const mu = ((lx % P) + P) % P;
  const mv = ((lz % P) + P) % P;
  if (mu === 0 || mv === 0) return null;
  return [Math.floor(lx / P), Math.floor(lz / P)];
}

/** The lots a block may hold buildings on, in the order they fill. The founder's block keeps its middle as the square. */
function buildLots(seed: number, block: [number, number], first: boolean): [number, number][] {
  const { lots, mid } = blockLots(block);
  return lots.filter(([x, z]) => !(x === mid[0] && z === mid[1]) && (first || hash(x, z, seed) >= CITY.lawn));
}

/**
 * The map: every city, where it stands, who lives where. Reading a stored
 * map and placing someone on it are the same code, so the page draws exactly
 * what the placer decided.
 *
 * A city grows a block at a time round its own middle, nearest first. Inside
 * it nothing ever moves. When it grows into a neighbor (or the coast), the
 * smaller of the two (the newer when they're even) moves away whole, to the
 * nearest clear place to its real place, keeping its real direction from the
 * other; that can push a third, and so on. When there's no room left, a big
 * city would stand far from its real place, or the cities cover too much of
 * the land, Brazil grows by scaleStep and every city goes back to its real
 * place. A stable, incremental Demers cartogram.
 */
export class BrasilMap {
  scale: number;
  private cities = new Map<string, City>();
  private island: City;
  private moved = new Set<string>();
  private grew = false;

  constructor(state: MapState) {
    this.scale = state.scale;
    const byCity = new Map<string, Resident[]>();
    for (const r of [...state.residents].sort((a, b) => a.at - b.at)) {
      const k = cityKeyOf(r.city);
      byCity.set(k, [...(byCity.get(k) ?? []), r]);
    }
    this.island = this.make(null);
    for (const r of byCity.get(ISLAND_KEY) ?? []) this.record(this.island, r);
    for (const s of state.cities) {
      if (cityKeyOf(s.ibge) === ISLAND_KEY) continue;
      const c = this.make(s.ibge);
      c.center = [s.cx, s.cz];
      for (const r of byCity.get(c.key) ?? []) this.record(c, r);
      this.cities.set(c.key, c);
    }
    // Residents of a city with no stored place (shouldn't happen): it's founded where it belongs.
    for (const [k, rs] of byCity) {
      if (k === ISLAND_KEY || this.cities.has(k)) continue;
      const c = this.found(Number(k));
      for (const r of rs) this.record(c, r);
    }
  }

  /** Every capital stands on the map from the start, lived in or not. */
  ensureCapitals(): this {
    for (const cap of CAPITAL_OF.values()) if (!this.cities.has(String(cap.ibge))) this.found(cap.ibge);
    return this;
  }

  private make(ibge: number | null): City {
    const info = ibge === null ? null : (cityOf(ibge) ?? null);
    if (ibge !== null && !info) throw new Error(`unknown city ${ibge}`);
    const seed = ibge === null ? 99 : ibge % 100003;
    const anchor = info ? (project(info.at).map((v) => v / LOT) as [number, number]) : (project(ISLAND.at).map((v) => v / LOT) as [number, number]);
    const c: City = { key: cityKeyOf(ibge), ibge, info, seed, anchor, center: [0, 0], blocks: [], blockSet: new Set(), taken: new Set(), residents: [], order: [], orderR: 0, founded: Infinity, fp: null, box: null };
    if (ibge === null) c.center = this.islandCenter();
    return c;
  }

  /** Noronha out at sea, pushed east until it's well clear of the coast. */
  private islandCenter(): [number, number] {
    const geo = geoAt(this.scale);
    const [x0, z] = geo.project(ISLAND.at).map((v) => Math.round(v / LOT));
    let x = x0;
    while (geo.onLand(x * LOT, z * LOT) || geo.coastDistance(x * LOT, z * LOT) < CITY.islandSea * LOT) x++;
    return [x, z];
  }

  private orderOf(c: City, need: number): [number, number][] {
    while (c.order.length < need) {
      c.orderR = c.orderR ? c.orderR * 2 : 8;
      c.order = blockOrder(c.seed, c.orderR);
    }
    return c.order;
  }

  private record(c: City, r: Resident) {
    c.residents.push(r);
    c.taken.add(key(r.lx, r.lz));
    if (c.founded === Infinity) c.founded = r.at;
    const b = blockAt(r.lx, r.lz);
    if (!b) return;
    const bk = key(b[0], b[1]);
    if (!c.blockSet.has(bk)) {
      c.blockSet.add(bk);
      c.blocks.push(bk);
      c.fp = null;
      c.box = null;
    }
  }

  /** The blocks a city stands on: its blocks, or the square it would start from when nobody lives there. */
  private footprint(c: City): [number, number][] {
    return (c.fp ??= c.blocks.length ? c.blocks.map(unkey) : [this.orderOf(c, 1)[0]]);
  }

  /** A block's lots with its streets, on the map, if the city stood at `at`. */
  private rect(at: [number, number], [bx, bz]: [number, number]) {
    return { x0: at[0] + bx * P, x1: at[0] + bx * P + P, z0: at[1] + bz * P, z1: at[1] + bz * P + P };
  }

  private bbox(c: City, at = c.center) {
    if (!c.box) {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const b of this.footprint(c)) {
        const r = this.rect([0, 0], b);
        x0 = Math.min(x0, r.x0);
        x1 = Math.max(x1, r.x1);
        z0 = Math.min(z0, r.z0);
        z1 = Math.max(z1, r.z1);
      }
      c.box = { x0, x1, z0, z1 };
    }
    const b = c.box;
    return { x0: b.x0 + at[0], x1: b.x1 + at[0], z0: b.z0 + at[1], z1: b.z1 + at[1] };
  }

  /** Whether city a (standing at `at`) comes within gapLots of city b. */
  private touches(a: City, at: [number, number], b: City): boolean {
    const g = CITY.gapLots;
    const A = this.bbox(a, at);
    const B = this.bbox(b);
    if (A.x0 - g > B.x1 || B.x0 > A.x1 + g || A.z0 - g > B.z1 || B.z0 > A.z1 + g) return false;
    const bs = this.footprint(b).map((k) => this.rect(b.center, k));
    for (const k of this.footprint(a)) {
      const r = this.rect(at, k);
      for (const q of bs) if (r.x0 - g <= q.x1 && q.x0 <= r.x1 + g && r.z0 - g <= q.z1 && q.z0 <= r.z1 + g) return true;
    }
    return false;
  }

  /** Whether a block (with its streets) is open land, off the drift track, if the city stood at `at`. */
  private blockOnLand(at: [number, number], b: [number, number]): boolean {
    const g = landGrid(this.scale);
    const r = this.rect(at, b);
    for (let x = r.x0; x <= r.x1; x++) for (let z = r.z0; z <= r.z1; z++) if (!landAt(g, x, z) || inDriftSite(x, z)) return false;
    return true;
  }

  private onLandAt(c: City, at: [number, number]): boolean {
    return this.footprint(c).every((b) => this.blockOnLand(at, b));
  }

  /** On the map: a capital, or a city someone lives in. */
  private present(c: City): boolean {
    return !!c.info?.capital || c.residents.length > 0;
  }

  /** Where a city belongs at this scale (lots): its real place. */
  private home(c: City): [number, number] {
    return [Math.round(c.anchor[0] * this.scale), Math.round(c.anchor[1] * this.scale)];
  }

  /** How far a city's ground reaches from its middle (lots). */
  private reach(c: City): number {
    return Math.max(...this.footprint(c).map(([bx, bz]) => Math.hypot(bx + 0.5, bz + 0.5) * P));
  }

  /**
   * Whether a big city standing at `at` is too far from its real place: past
   * its own reach and CITY.drift, or, when its real place is under a bigger
   * city (Osasco and São Paulo), past that city's ground too. Small cities
   * may go farther: they make room round the big ones.
   */
  private astray(c: City, at: [number, number]): boolean {
    const n = this.footprint(c).length;
    if (n < CITY.anchored) return false;
    const [hx, hz] = this.home(c);
    const own = this.reach(c);
    let room = own + CITY.drift;
    for (const o of this.others(c)) {
      if (this.footprint(o).length <= n) continue;
      const [ox, oz] = this.home(o);
      const r = this.reach(o) + own + CITY.gapLots;
      if (Math.hypot(hx - ox, hz - oz) < r) room = Math.max(room, r + CITY.drift);
    }
    return Math.hypot(at[0] - hx, at[1] - hz) > room;
  }

  private others(c: City): City[] {
    return [...this.cities.values()].filter((o) => o !== c && this.present(o));
  }

  /** The others whose ground comes within `margin` lots of the city standing at `at`. */
  private nearby(c: City, at: [number, number], margin: number): City[] {
    const A = this.bbox(c, at);
    const m = margin + CITY.gapLots;
    return this.others(c).filter((o) => {
      const B = this.bbox(o);
      return A.x0 - m <= B.x1 && B.x0 <= A.x1 + m && A.z0 - m <= B.z1 && B.z0 <= A.z1 + m;
    });
  }

  /**
   * The best place near `from` (lots) where the city is on land and touches
   * nobody: the least distance, weighted to favor heading `dir` (its real
   * direction from whoever is in the way, or inland). Looks out ring by ring
   * and stops once no farther ring can do better. Else (not strict) the
   * nearest place on land.
   */
  private settle(c: City, from: [number, number], dir: [number, number] | null, strict = false): [number, number] | null {
    let landOnly: [number, number] | null = null;
    let best: { p: [number, number]; cost: number } | null = null;
    const near = this.nearby(c, from, 81);
    const dl = dir ? Math.hypot(dir[0], dir[1]) : 0;
    const cost = (dx: number, dz: number) => {
      const d = Math.hypot(dx, dz);
      return dl && d ? d * (2 - (dx * dir![0] + dz * dir![1]) / (d * dl)) : d;
    };
    for (let r = 0; r <= 80; r++) {
      if (best && r > best.cost) break;
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const k = cost(dx, dz);
          if (best && k >= best.cost) continue;
          const p: [number, number] = [from[0] + dx, from[1] + dz];
          if (!this.onLandAt(c, p)) continue;
          if (!landOnly) landOnly = p;
          if (near.every((o) => !this.touches(c, p, o))) best = { p, cost: k };
        }
      }
    }
    return best?.p ?? (strict ? null : landOnly);
  }

  /** The nearest place to `from` (lots) where the city stands on land, whoever is there (they're pushed after). */
  private landNear(c: City, from: [number, number]): [number, number] | null {
    let best: { p: [number, number]; d: number } | null = null;
    for (let r = 0; r <= 80; r++) {
      if (best && r > best.d) break;
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const d = Math.hypot(dx, dz);
          if (best && d >= best.d) continue;
          const p: [number, number] = [from[0] + dx, from[1] + dz];
          if (this.onLandAt(c, p)) best = { p, d };
        }
      }
    }
    return best?.p ?? null;
  }

  /** Which way a city should go from `at`: away from the biggest city in the way (its real direction from it), else inland. */
  private heading(c: City, at: [number, number]): [number, number] | null {
    const S = this.scale;
    const blocker = this.nearby(c, at, 0)
      .filter((o) => this.touches(c, at, o))
      .sort((a, b) => this.footprint(b).length - this.footprint(a).length || (a.key < b.key ? -1 : 1))[0];
    if (blocker) {
      const v: [number, number] = [(c.anchor[0] - blocker.anchor[0]) * S, (c.anchor[1] - blocker.anchor[1]) * S];
      if (Math.hypot(v[0], v[1]) > 0.5) return v;
    }
    if (!c.info) return null;
    const [mx, mz] = geoAt(S).stateMiddle(c.info.uf).map((v) => v / LOT);
    return [mx - at[0], mz - at[1]];
  }

  private found(ibge: number): City {
    const c = this.make(ibge);
    const want: [number, number] = [Math.round(c.anchor[0] * this.scale), Math.round(c.anchor[1] * this.scale)];
    c.center = this.settle(c, want, this.heading(c, want)) ?? want;
    this.cities.set(c.key, c);
    this.moved.add(c.key);
    this.resolve([c]);
    return c;
  }

  /** The next lot in a city: a free lot in its blocks, else a new block (keeping off neighbors if it's not much farther round). */
  private nextLot(c: City): [number, number] {
    const first = c.blocks[0] ? unkey(c.blocks[0]) : null;
    for (const bk of c.blocks) {
      const b = unkey(bk);
      const isFirst = !!first && b[0] === first[0] && b[1] === first[1];
      const lot = buildLots(c.seed, b, isFirst).find(([x, z]) => !c.taken.has(key(x, z)));
      if (lot) return lot;
    }
    // A new block: the nearest one, or one a little farther round that's on land and clear of everyone.
    // A block whose dice made it all lawn holds nobody: it's skipped.
    const isFirstBlock = c.blocks.length === 0;
    const open = (b: [number, number]) => !c.blockSet.has(key(b[0], b[1])) && buildLots(c.seed, b, isFirstBlock).length > 0;
    let nearest: [number, number] | null = null;
    let nearestD = 0;
    let chosen: [number, number] | null = null;
    let landed: [number, number] | null = null;
    for (let i = 0; ; i++) {
      const o = this.orderOf(c, i + 1);
      const b = o[i];
      if (!open(b)) continue;
      const d = Math.hypot(b[0] + 0.5, b[1] + 0.5);
      if (!nearest) {
        nearest = b;
        nearestD = d;
      }
      if (d > nearestD + CITY.detour) break;
      if (c.ibge === null ? this.islandBlock(c, b) : this.blockOnLand(c.center, b)) {
        landed ??= b;
        const trial: City = { ...c, blocks: [...c.blocks, key(b[0], b[1])], fp: null, box: null };
        if (c.ibge === null || this.nearby(trial, c.center, 0).every((o) => !this.touches(trial, c.center, o))) {
          chosen = b;
          break;
        }
      }
    }
    // The island only ever grows out to sea, never pushing.
    if (c.ibge === null && !chosen) {
      for (let i = 0; !chosen; i++) {
        const b = this.orderOf(c, i + 1)[i];
        if (open(b) && this.islandBlock(c, b)) chosen = b;
      }
    }
    const b = chosen ?? landed ?? nearest!;
    return buildLots(c.seed, b, isFirstBlock)[0];
  }

  /** A block of the island: at sea, its shore clear of the coast. */
  private islandBlock(c: City, b: [number, number]): boolean {
    const geo = geoAt(this.scale);
    return blockLots(b).lots.every(([x, z]) => {
      const [wx, wz] = [(c.center[0] + x) * LOT, (c.center[1] + z) * LOT];
      return !geo.onLand(wx, wz) && geo.coastDistance(wx, wz) >= CITY.islandShore * LOT;
    });
  }

  /**
   * Puts a dev in a city (its IBGE code; null or Noronha: the island),
   * founding it if nobody lives there yet. Returns their lot in the city.
   */
  place(dev: MapDev, ibge: number | null, at: number): Resident {
    const k = cityKeyOf(ibge);
    const c = k === ISLAND_KEY ? this.island : (this.cities.get(k) ?? this.found(ibge!));
    const blocks = c.blocks.length;
    const [lx, lz] = this.nextLot(c);
    const r: Resident = { dev, city: ibge, lx, lz, at };
    this.record(c, r);
    if (c.ibge !== null && c.blocks.length > blocks) this.resolve([c]);
    // Too full, or a big city stands far from its real place (an older map pushed it): Brazil grows.
    if (this.fill() > CITY.maxFill || [...this.cities.values()].some((o) => this.present(o) && this.astray(o, o.center))) this.grow();
    return r;
  }

  /** How many devs live in a city (null or Noronha: the island). */
  population(ibge: number | null): number {
    const k = cityKeyOf(ibge);
    return (k === ISLAND_KEY ? this.island : this.cities.get(k))?.residents.length ?? 0;
  }

  /** Takes a dev off the map (they're moving): their lot frees up; their city keeps its place. */
  remove(devId: number) {
    for (const c of [this.island, ...this.cities.values()]) {
      const i = c.residents.findIndex((r) => r.dev.id === devId);
      if (i < 0) continue;
      const [r] = c.residents.splice(i, 1);
      c.taken.delete(key(r.lx, r.lz));
      c.blocks = [];
      c.blockSet = new Set();
      c.founded = Infinity;
      c.fp = null;
      c.box = null;
      const rest = c.residents;
      c.residents = [];
      c.taken = new Set();
      for (const q of rest) this.record(c, q);
      return;
    }
  }

  /** Share of the land the cities (with their gaps) cover. */
  private fill(): number {
    const land = landGrid(this.scale).land;
    let used = 0;
    // Each city's blocks and half the gap round them (the other half is the neighbor's).
    const side = P + CITY.gapLots;
    for (const c of this.cities.values()) if (this.present(c)) used += this.footprint(c).length * side * side;
    return used / Math.max(1, land);
  }

  /** Who moves when two cities touch: the smaller (fewer blocks), else the newer, else by id. */
  private mover(a: City, b: City): City {
    const na = this.footprint(a).length;
    const nb = this.footprint(b).length;
    if (na !== nb) return na < nb ? a : b;
    if (a.founded !== b.founded) return a.founded > b.founded ? a : b;
    return a.key > b.key ? a : b;
  }

  /**
   * Where `m` goes to clear `o`: the nearest place to its real place that's
   * on land and touches nobody, favoring its real direction from `o`. Boxed
   * in further than that looks: straight out along x or z. None: the region
   * is full (null: Brazil grows).
   */
  private shove(m: City, o: City): [number, number] | null {
    const home = this.home(m);
    const S = this.scale;
    let vx = (m.anchor[0] - o.anchor[0]) * S;
    let vz = (m.anchor[1] - o.anchor[1]) * S;
    if (Math.hypot(vx, vz) < 0.5) [vx, vz] = [m.center[0] - o.center[0], m.center[1] - o.center[1]];
    if (Math.hypot(vx, vz) < 0.5) [vx, vz] = [1, 0];
    const near = this.settle(m, home, [vx, vz], true);
    if (near) return near;
    const vl = Math.hypot(vx, vz);
    const others = this.nearby(m, home, 161);
    let clear: { at: [number, number]; cost: number } | null = null;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const weight = 2 - (dx * vx + dz * vz) / vl;
      for (let k = 81; k <= 160; k++) {
        const at: [number, number] = [home[0] + dx * k, home[1] + dz * k];
        if (this.touches(m, at, o) || !this.onLandAt(m, at)) continue;
        const cost = k * weight;
        if (clear && cost >= clear.cost) break;
        if (others.every((x) => !this.touches(m, at, x))) {
          clear = { at, cost };
          break;
        }
      }
    }
    return clear?.at ?? null;
  }

  /** Pushes cities apart until none touches another and all stand on land. False: no room left. */
  private resolve(seeds: City[]): boolean {
    const queue = [...seeds];
    for (let guard = 0; queue.length; guard++) {
      if (guard > 6000) return this.grow();
      const a = queue.shift()!;
      if (!this.onLandAt(a, a.center)) {
        const home = this.home(a);
        const at = this.landNear(a, home);
        if (!at || this.astray(a, at)) return this.grow();
        a.center = at;
        this.moved.add(a.key);
      }
      for (const b of this.nearby(a, a.center, 0).sort((x, y) => (x.key < y.key ? -1 : 1))) {
        if (!this.touches(a, a.center, b)) continue;
        const m = this.mover(a, b);
        const o = m === a ? b : a;
        const at = this.shove(m, o);
        if (!at || this.astray(m, at)) return this.grow();
        m.center = at;
        this.moved.add(m.key);
        if (!queue.includes(m)) queue.push(m);
        if (m === a) break;
      }
    }
    return true;
  }

  /** Brazil grows by scaleStep: every city goes back to its real place, then they settle again, the biggest first. */
  private grow(): boolean {
    if (this.scale > 50) throw new Error("brasil map: no room even at 50x");
    const S0 = this.scale;
    const S1 = Math.round(S0 * CITY.scaleStep * 1000) / 1000;
    this.scale = S1;
    for (const c of this.cities.values()) {
      c.center = this.home(c);
      this.moved.add(c.key);
    }
    this.island.center = this.islandCenter();
    this.grew = true;
    // The biggest settle first, so the small ones move round them.
    return this.resolve([...this.cities.values()].sort((a, b) => this.footprint(b).length - this.footprint(a).length || (a.key < b.key ? -1 : 1)));
  }

  /** What changed since the map was read: the cities that moved or were founded, and whether Brazil grew. */
  changes(): { cities: StoredCity[]; grew: boolean } {
    return {
      cities: [...this.moved].map((k) => this.cities.get(k)!).filter(Boolean).map((c) => ({ ibge: c.ibge!, cx: c.center[0], cz: c.center[1] })),
      grew: this.grew,
    };
  }

  /** Where every city stands now. */
  stored(): StoredCity[] {
    return [...this.cities.values()].map((c) => ({ ibge: c.ibge!, cx: c.center[0], cz: c.center[1] }));
  }

  /** A resident's lot on the map. */
  lotOf(r: Resident): [number, number] {
    const c = cityKeyOf(r.city) === ISLAND_KEY ? this.island : this.cities.get(cityKeyOf(r.city))!;
    return [c.center[0] + r.lx, c.center[1] + r.lz];
  }

  private cityLayout(c: City, solid: Set<string>): CityLayout {
    const [hx, hz] = c.center;
    const blocks = this.footprint(c);
    const first = blocks[0];
    const sq = blockLots(first).mid;
    const square: [number, number] = [hx + sq[0], hz + sq[1]];
    const devs = c.residents.map((r, i) => ({ dev: r.dev, x: hx + r.lx, z: hz + r.lz, founder: i === 0, at: r.at }));
    const taken = new Set(devs.map((d) => key(d.x, d.z)));
    taken.add(key(square[0], square[1]));
    const roads = new Set<string>();
    let radius = 2;
    for (const [bx, bz] of blocks) {
      const x0 = hx + bx * P;
      const z0 = hz + bz * P;
      for (let k = 0; k <= P; k++) {
        roads.add(key(x0 + k, z0));
        roads.add(key(x0 + k, z0 + P));
        roads.add(key(x0, z0 + k));
        roads.add(key(x0 + P, z0 + k));
      }
      radius = Math.max(radius, Math.hypot(bx + 0.5, bz + 0.5) * P + P);
    }
    // The mainland's two avenues run a little past the city, to meet the highways.
    if (c.ibge !== null) {
      const g = landGrid(this.scale);
      const reach = Math.ceil(radius) + CITY.gapLots - 1;
      for (let k = -reach; k <= reach; k++) {
        for (const [x, z] of [[hx + k, hz], [hx, hz + k]] as const) if (landAt(g, x, z) && !inDriftSite(x, z) && !solid.has(key(x, z))) roads.add(key(x, z));
      }
    }
    const lawns: [number, number][] = [];
    for (const b of blocks) for (const [x, z] of blockLots(b).lots) if (!taken.has(key(hx + x, hz + z)) && !roads.has(key(hx + x, hz + z))) lawns.push([hx + x, hz + z]);
    return {
      key: c.key,
      ibge: c.ibge === null ? null : c.ibge,
      uf: c.info?.uf ?? null,
      name: c.info?.name ?? ISLAND.name,
      slug: c.info ? slugOf(c.info.name, c.info.uf) : null,
      capital: !!c.info?.capital,
      center: square,
      devs,
      roads: [...roads].filter((k) => !taken.has(k)).map(unkey),
      lawns,
      radius,
      blocks: blocks.map(([bx, bz]) => [hx + bx * P + 1, hz + bz * P + 1] as [number, number]),
      hub: c.center,
    };
  }

  /** The whole map, as the page draws it: the capitals, every lived-in city, the island, the highways. */
  layout(): BrasilLayout {
    const shown = [...this.cities.values()].filter((c) => c.info?.capital || c.residents.length > 0).sort((a, b) => a.founded - b.founded || (a.key < b.key ? -1 : 1));
    // Every city's building lots, lawns and squares: no other city's avenue runs over them.
    const solid = new Set<string>();
    for (const c of [...shown, this.island]) {
      for (const b of this.footprint(c)) for (const [x, z] of blockLots(b).lots) solid.add(key(c.center[0] + x, c.center[1] + z));
    }
    const cities = shown.map((c) => this.cityLayout(c, solid));
    const island = this.cityLayout(this.island, solid);
    island.radius = Math.max(CITY.islandMin, island.radius);
    const ownSolid = new Set([...cities, island].flatMap((c) => [...c.devs.map((d) => key(d.x, d.z)), ...c.lawns.map((l) => l.join()), c.center.join()]));
    for (const c of [...cities, island]) c.roads = c.roads.filter(([x, z]) => !ownSolid.has(key(x, z)));
    return { scale: this.scale, cities, island, highways: highways(cities, this.scale) };
  }
}

/** The capital a state's devs go to when they named only the state. */
export const capitalIbge = (uf: UF): number => CAPITAL_OF.get(uf)!.ibge;

/** The map from stored state (the page): nothing is placed or moved. */
export function layoutFromState(state: MapState): BrasilLayout {
  return new BrasilMap(state).layout();
}

/** Devs arriving one by one in this order (the preview, the tests), each in their city (or their state's capital). */
export function layoutBrasil(devs: readonly (MapDev & { city?: number | null })[]): BrasilLayout {
  const map = new BrasilMap({ scale: 1, cities: [], residents: [] }).ensureCapitals();
  devs.forEach((dev, i) => map.place(dev, dev.city !== undefined ? dev.city : dev.uf ? capitalIbge(dev.uf) : null, i));
  return map.layout();
}

/**
 * Roads between cities: each capital to its two nearest capitals, every
 * other city to the nearest one bigger than it (or a capital). Out along one
 * city's east-west avenue, in along the other's north-south one. Never over
 * a building, a lawn, the sea or the drift track (through a city it runs on
 * its streets).
 */
function highways(cities: CityLayout[], scale: number): [number, number][] {
  const geo = geoAt(scale);
  const blocked = new Set(cities.flatMap((c) => [...c.devs.map((d) => key(d.x, d.z)), ...c.lawns.map((l) => l.join()), c.center.join()]));
  const streets = new Set(cities.flatMap((c) => c.roads.map((r) => r.join())));
  const out = new Set<string>();
  const link = (a: CityLayout, b: CityLayout) => {
    const [ax, az] = a.hub;
    const [bx, bz] = b.hub;
    const lots: [number, number][] = [];
    for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) lots.push([x, az]);
    for (let z = Math.min(az, bz); z <= Math.max(az, bz); z++) lots.push([bx, z]);
    for (const [x, z] of lots) {
      const k = key(x, z);
      if (!blocked.has(k) && !streets.has(k) && geo.onLand(x * LOT, z * LOT) && !inDriftSite(x, z)) out.add(k);
    }
  };
  const dist = (a: CityLayout, b: CityLayout) => Math.hypot(a.hub[0] - b.hub[0], a.hub[1] - b.hub[1]);
  const capitals = cities.filter((c) => c.capital);
  const seen = new Set<string>();
  const once = (a: CityLayout, b: CityLayout) => {
    const pair = a.key < b.key ? `${a.key}-${b.key}` : `${b.key}-${a.key}`;
    if (seen.has(pair)) return;
    seen.add(pair);
    link(a, b);
  };
  for (const a of capitals) {
    capitals
      .filter((b) => b !== a)
      .sort((p, q) => dist(a, p) - dist(a, q) || (p.key < q.key ? -1 : 1))
      .slice(0, 2)
      .forEach((b) => once(a, b));
  }
  for (const c of cities) {
    if (c.capital) continue;
    const to = cities
      .filter((b) => b !== c && (b.capital || b.devs.length > c.devs.length))
      .sort((p, q) => dist(c, p) - dist(c, q) || (p.key < q.key ? -1 : 1))[0];
    if (to) once(c, to);
  }
  return [...out].map(unkey);
}

/** States by devs (all their cities, and the island's devs who named one), most first; ties by name order. */
export function ranking(layout: BrasilLayout): { uf: UF; devs: number }[] {
  const n = new Map<UF, number>();
  for (const c of [...layout.cities, layout.island]) for (const d of c.devs) if (d.dev.uf) n.set(d.dev.uf, (n.get(d.dev.uf) ?? 0) + 1);
  return STATES.filter((s) => n.has(s.uf))
    .map((s) => ({ uf: s.uf, devs: n.get(s.uf)! }))
    .sort((a, b) => b.devs - a.devs);
}

/** Portuguese takes an article with most states: "o Acre", "a Bahia", plain "São Paulo". */
const ARTICLE: Record<UF, "o" | "a" | ""> = {
  AC: "o",
  AL: "",
  AP: "o",
  AM: "o",
  BA: "a",
  CE: "o",
  DF: "o",
  ES: "o",
  GO: "",
  MA: "o",
  MT: "o",
  MS: "o",
  MG: "",
  PA: "o",
  PB: "a",
  PR: "o",
  PE: "",
  PI: "o",
  RJ: "o",
  RN: "o",
  RS: "o",
  RO: "",
  RR: "",
  SC: "",
  SP: "",
  SE: "",
  TO: "o",
};

/** The state in a Portuguese sentence: "o Acre" / "São Paulo" ("the"), "no Acre" / "em São Paulo" ("in"), "do Acre" / "de São Paulo" ("of"). */
export function ptState(uf: UF, form: "the" | "in" | "of"): string {
  const name = stateOf(uf).name;
  const a = ARTICLE[uf];
  if (form === "the") return a ? `${a} ${name}` : name;
  const [masc, fem, none] = form === "in" ? ["no", "na", "em"] : ["do", "da", "de"];
  return `${a === "o" ? masc : a === "a" ? fem : none} ${name}`;
}
