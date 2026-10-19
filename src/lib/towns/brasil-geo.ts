// ─── Brasil town: geography ─────────────────────────────────
// Brazil's real outline and states (IBGE meshes, simplified: brasil-geo.json)
// projected onto the town's world: north is -z, a degree is K world units,
// longitude shrunk by the cosine of the middle latitude so shapes keep their
// proportions. The whole country sits on the town grid like any town: its
// middle on x = 0, its southern tip just north of z = 0.
//
// The map scales (geoAt): as the cities need room, Brazil grows round the
// world's origin by a factor S that only ever goes up. Everything here at
// S = 1 is the map as it was drawn first.
//
// Every state has its capital; Fernando de Noronha is the island for devs
// who never said their city.

import { LOT } from "../league-city/grid";
import RAW_GEO from "./brasil-geo.json";
import RIVERS_RAW from "./brasil-rivers.json";
import type { UF } from "./brasil-map";

/** World units per degree of latitude. */
export const K = 420;
const LAT0 = -14;
const COS0 = Math.cos((LAT0 * Math.PI) / 180);

type LonLat = [number, number];

export const CAPITALS: Record<UF, { city: string; at: LonLat }> = {
  AC: { city: "Rio Branco", at: [-67.81, -9.97] },
  AL: { city: "Maceió", at: [-35.73, -9.67] },
  AP: { city: "Macapá", at: [-51.07, 0.03] },
  AM: { city: "Manaus", at: [-60.02, -3.12] },
  BA: { city: "Salvador", at: [-38.5, -12.97] },
  CE: { city: "Fortaleza", at: [-38.54, -3.73] },
  DF: { city: "Brasília", at: [-47.88, -15.79] },
  ES: { city: "Vitória", at: [-40.31, -20.32] },
  GO: { city: "Goiânia", at: [-49.25, -16.68] },
  MA: { city: "São Luís", at: [-44.3, -2.53] },
  MT: { city: "Cuiabá", at: [-56.1, -15.6] },
  MS: { city: "Campo Grande", at: [-54.62, -20.47] },
  MG: { city: "Belo Horizonte", at: [-43.94, -19.92] },
  PA: { city: "Belém", at: [-48.5, -1.46] },
  PB: { city: "João Pessoa", at: [-34.86, -7.12] },
  PR: { city: "Curitiba", at: [-49.27, -25.43] },
  PE: { city: "Recife", at: [-34.88, -8.05] },
  PI: { city: "Teresina", at: [-42.8, -5.09] },
  RJ: { city: "Rio de Janeiro", at: [-43.2, -22.91] },
  RN: { city: "Natal", at: [-35.21, -5.79] },
  RS: { city: "Porto Alegre", at: [-51.23, -30.03] },
  RO: { city: "Porto Velho", at: [-63.9, -8.76] },
  RR: { city: "Boa Vista", at: [-60.67, 2.82] },
  SC: { city: "Florianópolis", at: [-48.55, -27.6] },
  SP: { city: "São Paulo", at: [-46.63, -23.55] },
  SE: { city: "Aracaju", at: [-37.07, -10.91] },
  TO: { city: "Palmas", at: [-48.33, -10.18] },
};

export const ISLAND = { name: "Fernando de Noronha", at: [-32.42, -3.85] as LonLat };

/**
 * Each state's second city, where it grows once its capital is full: the
 * biggest city of the interior, far enough from the capital to have room
 * (so Ribeirão Preto, not Campinas). The Federal District has none.
 */
export const SECOND_CITIES: Partial<Record<UF, { city: string; at: LonLat }>> = {
  AC: { city: "Cruzeiro do Sul", at: [-72.67, -7.63] },
  AL: { city: "Arapiraca", at: [-36.66, -9.75] },
  AP: { city: "Oiapoque", at: [-51.83, 3.84] },
  AM: { city: "Parintins", at: [-56.74, -2.63] },
  BA: { city: "Feira de Santana", at: [-38.97, -12.27] },
  CE: { city: "Juazeiro do Norte", at: [-39.31, -7.21] },
  ES: { city: "Cachoeiro de Itapemirim", at: [-41.11, -20.85] },
  GO: { city: "Rio Verde", at: [-50.93, -17.79] },
  MA: { city: "Imperatriz", at: [-47.49, -5.53] },
  MT: { city: "Rondonópolis", at: [-54.64, -16.47] },
  MS: { city: "Dourados", at: [-54.81, -22.22] },
  MG: { city: "Uberlândia", at: [-48.28, -18.92] },
  PA: { city: "Santarém", at: [-54.71, -2.44] },
  PB: { city: "Campina Grande", at: [-35.88, -7.23] },
  PR: { city: "Londrina", at: [-51.16, -23.31] },
  PE: { city: "Caruaru", at: [-35.98, -8.28] },
  PI: { city: "Parnaíba", at: [-41.78, -2.9] },
  RJ: { city: "Campos dos Goytacazes", at: [-41.32, -21.75] },
  RN: { city: "Mossoró", at: [-37.34, -5.19] },
  RS: { city: "Caxias do Sul", at: [-51.18, -29.17] },
  RO: { city: "Ji-Paraná", at: [-61.95, -10.88] },
  RR: { city: "Rorainópolis", at: [-60.43, 0.94] },
  SC: { city: "Joinville", at: [-48.85, -26.3] },
  SP: { city: "Ribeirão Preto", at: [-47.81, -21.18] },
  SE: { city: "Itabaiana", at: [-37.42, -10.69] },
  TO: { city: "Araguaína", at: [-48.21, -7.19] },
};

const GEO = RAW_GEO as unknown as { outline: LonLat[][]; states: Record<string, LonLat[][]> };

const raw = ([lon, lat]: LonLat): [number, number] => [lon * K * COS0, -lat * K];

// The town grid's offset: the outline's middle on x = 0, its southern edge two lots north of z = 0.
const OUTLINE_RAW = GEO.outline.map((r) => r.map(raw));
const xs = OUTLINE_RAW.flat().map((p) => p[0]).concat(raw(ISLAND.at)[0]);
const zs = OUTLINE_RAW.flat().map((p) => p[1]);
const OX = -(Math.min(...xs) + Math.max(...xs)) / 2;
const OZ = -Math.max(...zs) - 2 * LOT;

/** A longitude/latitude to the town's world (x, z). */
export function project(p: LonLat): [number, number] {
  const [x, z] = raw(p);
  return [x + OX, z + OZ];
}

export type Ring = [number, number][];

/** The country's coast, in world units (biggest ring first). */
export const OUTLINE: Ring[] = GEO.outline.map((r) => r.map(project));
/** Each state's rings, in world units. */
export const STATE_RINGS: Record<UF, Ring[]> = Object.fromEntries(
  Object.entries(GEO.states).map(([uf, rings]) => [uf, rings.map((r) => r.map(project))]),
) as Record<UF, Ring[]>;

/** World bounds of the whole map, the island included. */
export const MAP_BOUNDS = (() => {
  const pts = [...OUTLINE.flat(), project(ISLAND.at)];
  return {
    minX: Math.min(...pts.map((p) => p[0])),
    maxX: Math.max(...pts.map((p) => p[0])),
    minZ: Math.min(...pts.map((p) => p[1])),
    maxZ: Math.max(...pts.map((p) => p[1])),
  };
})();

/** The town grid's half-width that holds the map (DriveWorld's ground and walls). */
export const MAP_H = Math.ceil(Math.max(MAP_BOUNDS.maxX, -MAP_BOUNDS.minX, -MAP_BOUNDS.minZ / 2) / LOT) + 4;

function inRing(r: Ring, x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, zi] = r[i];
    const [xj, zj] = r[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function inState(uf: UF, x: number, z: number): boolean {
  return STATE_RINGS[uf].some((r) => inRing(r, x, z));
}

/** On the mainland (inside the coast). */
export function onLand(x: number, z: number): boolean {
  return OUTLINE.some((r) => inRing(r, x, z));
}

/** Distance (world units) from a point to the coast. */
export function coastDistance(x: number, z: number): number {
  return ringsDistance(OUTLINE, x, z);
}

/** Distance (world units) from a point to the nearest edge of a state. */
export function edgeDistance(uf: UF, x: number, z: number): number {
  return ringsDistance(STATE_RINGS[uf], x, z);
}

function ringsDistance(rings: Ring[], x: number, z: number): number {
  let best = Infinity;
  for (const r of rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [ax, az] = r[j];
      const [bx, bz] = r[i];
      const dx = bx - ax;
      const dz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
      best = Math.min(best, Math.hypot(x - (ax + t * dx), z - (az + t * dz)));
    }
  }
  return best;
}

/** A state's middle (the average of its biggest ring), in world units. */
export function stateMiddle(uf: UF): [number, number] {
  const r = STATE_RINGS[uf][0];
  return [r.reduce((s, p) => s + p[0], 0) / r.length, r.reduce((s, p) => s + p[1], 0) / r.length];
}

/** The big rivers (Natural Earth, public domain: brasil-rivers.json), each with its width class 1–3. */
export interface River {
  name: string;
  /** World units across. */
  width: number;
  points: Ring;
}

const RIVER_WIDTH = [0, 40, 70, 110];

export const RIVERS: River[] = (RIVERS_RAW as unknown as { rivers: { name: string; w: number; p: LonLat[] }[] }).rivers.map((r) => ({
  name: r.name,
  width: RIVER_WIDTH[r.w] ?? 40,
  points: r.p.map(project),
}));

// ─── The map at a scale ─────────────────────────────────────

/** Brazil at scale S: every shape and test above, its coordinates multiplied by S. */
export interface Geo {
  scale: number;
  project: (p: LonLat) => [number, number];
  outline: Ring[];
  stateRings: Record<UF, Ring[]>;
  rivers: River[];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** The town grid's half-width that holds the map (lots). */
  h: number;
  onLand: (x: number, z: number) => boolean;
  inState: (uf: UF, x: number, z: number) => boolean;
  coastDistance: (x: number, z: number) => number;
  stateMiddle: (uf: UF) => [number, number];
}

const geos = new Map<number, Geo>();

export function geoAt(scale: number): Geo {
  const cached = geos.get(scale);
  if (cached) return cached;
  const S = scale;
  const ring = (r: Ring): Ring => r.map(([x, z]) => [x * S, z * S]);
  const bounds = { minX: MAP_BOUNDS.minX * S, maxX: MAP_BOUNDS.maxX * S, minZ: MAP_BOUNDS.minZ * S, maxZ: MAP_BOUNDS.maxZ * S };
  const geo: Geo = {
    scale,
    project: (p) => {
      const [x, z] = project(p);
      return [x * S, z * S];
    },
    outline: S === 1 ? OUTLINE : OUTLINE.map(ring),
    stateRings: S === 1 ? STATE_RINGS : (Object.fromEntries(Object.entries(STATE_RINGS).map(([uf, rs]) => [uf, rs.map(ring)])) as Record<UF, Ring[]>),
    // Rivers keep their width: only their course stretches.
    rivers: S === 1 ? RIVERS : RIVERS.map((r) => ({ ...r, points: ring(r.points) })),
    bounds,
    h: Math.ceil(Math.max(bounds.maxX, -bounds.minX, -bounds.minZ / 2) / LOT) + 4,
    onLand: (x, z) => onLand(x / S, z / S),
    inState: (uf, x, z) => inState(uf, x / S, z / S),
    coastDistance: (x, z) => coastDistance(x / S, z / S) * S,
    stateMiddle: (uf) => {
      const [x, z] = stateMiddle(uf);
      return [x * S, z * S];
    },
  };
  geos.set(scale, geo);
  return geo;
}

/**
 * Which lots are land at scale S, a lot clear of the coast: a grid over the
 * map's bounds (lots), filled row by row from the coast's crossings.
 */
export interface LandGrid {
  x0: number;
  z0: number;
  w: number;
  d: number;
  /** 1: land, a lot clear of the sea. */
  cells: Uint8Array;
}

const grids = new Map<number, LandGrid>();

export function landGrid(scale: number): LandGrid {
  const cached = grids.get(scale);
  if (cached) return cached;
  const { outline, bounds } = geoAt(scale);
  const x0 = Math.floor(bounds.minX / LOT) - 2;
  const z0 = Math.floor(bounds.minZ / LOT) - 2;
  const w = Math.ceil(bounds.maxX / LOT) + 3 - x0;
  const d = Math.ceil(bounds.maxZ / LOT) + 3 - z0;
  const raw = new Uint8Array(w * d);
  for (let j = 0; j < d; j++) {
    const z = (z0 + j) * LOT;
    // Every crossing of this row with the coast; between pairs is land.
    const xs: number[] = [];
    for (const r of outline) {
      for (let i = 0, k = r.length - 1; i < r.length; k = i++) {
        const [xi, zi] = r[i];
        const [xk, zk] = r[k];
        if (zi > z !== zk > z) xs.push(((xk - xi) * (z - zi)) / (zk - zi) + xi);
      }
    }
    xs.sort((a, b) => a - b);
    for (let n = 0; n + 1 < xs.length; n += 2) {
      const a = Math.max(0, Math.ceil(xs[n] / LOT) - x0);
      const b = Math.min(w - 1, Math.floor(xs[n + 1] / LOT) - x0);
      for (let i = a; i <= b; i++) raw[j * w + i] = 1;
    }
  }
  // A lot clear of the coast: land, and land all round it.
  const cells = new Uint8Array(w * d);
  for (let j = 1; j < d - 1; j++) {
    for (let i = 1; i < w - 1; i++) {
      let ok = 1;
      for (let dj = -1; dj <= 1 && ok; dj++) for (let di = -1; di <= 1 && ok; di++) ok = raw[(j + dj) * w + i + di];
      cells[j * w + i] = ok;
    }
  }
  const grid = { x0, z0, w, d, cells };
  grids.set(scale, grid);
  return grid;
}

/** Whether a lot is land, clear of the coast, at that grid's scale. */
export function landAt(g: LandGrid, x: number, z: number): boolean {
  const i = x - g.x0;
  const j = z - g.z0;
  return i >= 0 && j >= 0 && i < g.w && j < g.d && g.cells[j * g.w + i] === 1;
}
