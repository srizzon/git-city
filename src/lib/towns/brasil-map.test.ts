import { describe, expect, it } from "vitest";
import { LOT } from "../league-city/grid";
import { CAPITAL_OF, NORONHA } from "./br-cities";
import { MAP_BOUNDS, OUTLINE, STATE_RINGS, geoAt, landAt, landGrid } from "./brasil-geo";
import { inDriftSite } from "./brasil-drift";
import { BrasilMap, CITY, STATES, capitalIbge, layoutBrasil, layoutFromState, parseUF, ranking, type BrasilLayout, type MapDev, type Resident, type UF } from "./brasil-map";

const CAMPINAS = 3509502;
const GUARULHOS = 3518800;
const SP = 3550308;

const devs = (spec: [UF | null, number, number?][]): (MapDev & { city?: number | null })[] => {
  let id = 0;
  return spec.flatMap(([uf, n, city]) => Array.from({ length: n }, () => ({ id: ++id, login: `dev${id}`, uf, city })));
};

/** Every block's lots with their streets, by city: no lot may belong to two. */
function overlaps(l: BrasilLayout): number {
  const own = new Map<string, string>();
  let clash = 0;
  for (const c of l.cities) {
    for (const [x0, z0] of c.blocks) {
      for (let x = x0 - 1; x <= x0 + CITY.block; x++) {
        for (let z = z0 - 1; z <= z0 + CITY.block; z++) {
          const o = own.get(`${x},${z}`);
          if (o && o !== c.key) clash++;
          own.set(`${x},${z}`, c.key);
        }
      }
    }
  }
  return clash;
}

/** A made-up crowd over real cities: most in capitals and a few big ones per state, some anywhere, some never saying. */
function crowd(n: number, seed = 7): (MapDev & { city: number | null })[] {
  let s = seed;
  const rand = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const weights = STATES.map((x) => x.pop ** 1.25);
  const total = weights.reduce((a, b) => a + b, 0);
  const big: Partial<Record<UF, number[]>> = { SP: [CAMPINAS, GUARULHOS, 3548708, 3549904, 3543402], RJ: [3303302, 3301702], MG: [3170206, 3136702], PR: [4113700], SC: [4209102] };
  return Array.from({ length: n }, (_, i) => {
    if (rand() < 0.1) return { id: i + 1, login: `c${i}`, uf: null, city: null };
    let r = rand() * total;
    let uf: UF = "SP";
    for (let k = 0; k < STATES.length; k++) if ((r -= weights[k]) <= 0) { uf = STATES[k].uf; break; }
    const pool = big[uf];
    const city = pool && rand() < 0.4 ? pool[Math.floor(rand() * pool.length)] : capitalIbge(uf);
    return { id: i + 1, login: `c${i}`, uf, city };
  });
}

describe("brasil geography", () => {
  it("has the coast and all 27 states, north up, south of the town's entrance row", () => {
    expect(OUTLINE[0].length).toBeGreaterThan(100);
    expect(Object.keys(STATE_RINGS)).toHaveLength(27);
    expect(MAP_BOUNDS.maxZ).toBeLessThan(0);
    const z = (uf: UF) => STATE_RINGS[uf][0][0][1];
    expect(z("RR")).toBeLessThan(z("RS"));
  });

  it("scales round the origin: the same place, S times as far", () => {
    const a = geoAt(1).project([-46.63, -23.55]);
    const b = geoAt(1.5).project([-46.63, -23.55]);
    expect(b[0]).toBeCloseTo(a[0] * 1.5);
    expect(geoAt(1.5).onLand(b[0], b[1])).toBe(true);
    expect(landGrid(1.5).land).toBeGreaterThan(landGrid(1).land * 2);
  });
});

describe("brasil cities", () => {
  it("reads a state's sigla from a comment", () => {
    expect(parseUF("sp")).toBe("SP");
    expect(parseUF("XX")).toBeNull();
  });

  it("stands every capital on land, near its real place, even with nobody there", () => {
    const l = layoutBrasil([]);
    expect(l.cities).toHaveLength(27);
    const g = landGrid(1);
    for (const c of l.cities) {
      expect(c.capital).toBe(true);
      expect(landAt(g, c.center[0], c.center[1])).toBe(true);
    }
    const geo = geoAt(1);
    expect(l.cities.filter((c) => geo.inState(c.uf!, c.center[0] * LOT, c.center[1] * LOT)).length).toBeGreaterThan(20);
  });

  it("founds a city with its first dev, who stands next to its square", () => {
    const l = layoutBrasil(devs([["SP", 3, CAMPINAS]]));
    const c = l.cities.find((x) => x.ibge === CAMPINAS)!;
    expect(c.name).toBe("Campinas");
    expect(c.capital).toBe(false);
    expect(c.devs[0]).toMatchObject({ founder: true, dev: { id: 1 } });
    expect(c.devs.filter((d) => d.founder)).toHaveLength(1);
    expect(Math.max(Math.abs(c.devs[0].x - c.center[0]), Math.abs(c.devs[0].z - c.center[1]))).toBe(1);
  });

  it("keeps every building on its own lot, on land, never on a street or a highway", () => {
    const l = layoutBrasil(crowd(1500));
    const taken = new Set<string>();
    const streets = new Set([...l.cities.flatMap((c) => c.roads.map((r) => r.join())), ...l.highways.map((r) => r.join())]);
    const geo = geoAt(l.scale);
    for (const c of l.cities) {
      for (const d of c.devs) {
        const k = `${d.x},${d.z}`;
        expect(taken.has(k)).toBe(false);
        expect(streets.has(k)).toBe(false);
        expect(geo.onLand(d.x * LOT, d.z * LOT)).toBe(true);
        expect(inDriftSite(d.x, d.z)).toBe(false);
        taken.add(k);
      }
    }
    expect(overlaps(l)).toBe(0);
  });

  it("never lets two cities touch, however crowded Greater São Paulo gets", () => {
    const spec: [UF, number, number][] = [["SP", 400, SP], ["SP", 120, GUARULHOS], ["SP", 150, CAMPINAS], ["SP", 60, 3548708], ["SP", 60, 3534401]];
    const l = layoutBrasil(devs(spec));
    expect(overlaps(l)).toBe(0);
    // Guarulhos keeps its side of São Paulo (north-east): east of its middle.
    const sp = l.cities.find((c) => c.ibge === SP)!;
    const gru = l.cities.find((c) => c.ibge === GUARULHOS)!;
    expect(gru.hub[0]).toBeGreaterThan(sp.hub[0]);
    expect(gru.devs).toHaveLength(120);
  });

  it("never moves a building inside its city, and a stored map reads back exactly", () => {
    const map = new BrasilMap({ scale: 1, cities: [], residents: [] }).ensureCapitals();
    const residents: Resident[] = [];
    crowd(600).forEach((d, i) => residents.push(map.place(d, d.city, i)));
    const before = map.layout();
    const local = (l: BrasilLayout) => {
      const m = new Map<number, string>();
      for (const c of [...l.cities, l.island]) for (const d of c.devs) m.set(d.dev.id, `${c.key}:${d.x - c.hub[0]},${d.z - c.hub[1]}`);
      return m;
    };
    const a = local(before);
    crowd(900, 11).forEach((d, i) => map.place({ ...d, id: d.id + 10_000 }, d.city, 1000 + i));
    const b = local(map.layout());
    for (const [id, at] of a) expect(b.get(id)).toBe(at);
    // Read back from what would be stored: the same map.
    const again = layoutFromState({ scale: map.scale, cities: map.stored(), residents });
    expect(local(again)).toEqual(a);
  });

  it("grows Brazil when the cities run out of room, and only ever up", () => {
    const map = new BrasilMap({ scale: 1, cities: [], residents: [] }).ensureCapitals();
    let last = 1;
    crowd(3000).forEach((d, i) => {
      map.place(d, d.city, i);
      expect(map.scale).toBeGreaterThanOrEqual(last);
      last = map.scale;
    });
    const l = map.layout();
    expect(overlaps(l)).toBe(0);
    const g = landGrid(l.scale);
    for (const c of l.cities) for (const [x0, z0] of c.blocks) expect(landAt(g, x0, z0)).toBe(true);
  });

  it("puts devs with no city on the island, out at sea, and Noronha's own devs with them", () => {
    const l = layoutBrasil(devs([[null, 40], ["PE", 3, NORONHA]]));
    const geo = geoAt(l.scale);
    expect(l.island.devs).toHaveLength(43);
    expect(l.island.devs[0].founder).toBe(true);
    for (const d of l.island.devs) {
      expect(geo.onLand(d.x * LOT, d.z * LOT)).toBe(false);
      expect(geo.coastDistance(d.x * LOT, d.z * LOT)).toBeGreaterThanOrEqual(CITY.islandShore * LOT);
    }
    expect(l.cities.some((c) => c.ibge === NORONHA)).toBe(false);
  });

  it("links every city to the map by highway", () => {
    expect(layoutBrasil([]).highways.length).toBeGreaterThan(200);
  });

  it("frees a dev's lot when they move, and their new city gets them", () => {
    const map = new BrasilMap({ scale: 1, cities: [], residents: [] }).ensureCapitals();
    const d = { id: 1, login: "a", uf: "SP" as UF };
    map.place(d, SP, 0);
    map.remove(1);
    map.place(d, CAMPINAS, 1);
    const l = map.layout();
    expect(l.cities.find((c) => c.ibge === SP)!.devs).toHaveLength(0);
    expect(l.cities.find((c) => c.ibge === CAMPINAS)!.devs).toHaveLength(1);
  });

  it("leaves lawn between buildings, and grows a city outward", () => {
    const small = layoutBrasil(devs([["GO", 10]])).cities.find((c) => c.ibge === CAPITAL_OF.get("GO")!.ibge)!;
    const big = layoutBrasil(devs([["GO", 400]])).cities.find((c) => c.ibge === CAPITAL_OF.get("GO")!.ibge)!;
    expect(big.lawns.length).toBeGreaterThan(big.devs.length * 0.3);
    expect(big.radius).toBeGreaterThan(small.radius * 2);
  });

  it("ranks states by devs", () => {
    const l = layoutBrasil(devs([["RJ", 3], ["SP", 5], ["AC", 1]]));
    expect(ranking(l).map((r) => r.uf)).toEqual(["SP", "RJ", "AC"]);
  });
});
