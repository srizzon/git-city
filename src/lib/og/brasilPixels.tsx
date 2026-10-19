// The Brasil map as pixels, for share images: the real coast and states
// (brasil-geo) sampled on a grid, each city a square sized by its devs, one
// state lit and one city glowing when the card is about someone. Satori draws
// it as one <svg> of rects. Server only (the geometry is big).

import { LOT, lotToWorld } from "@/lib/league-city/grid";
import { ISLAND, geoAt } from "@/lib/towns/brasil-geo";
import { STATES, type CityLayout, type UF } from "@/lib/towns/brasil-map";

const COLS = 62;

// Like Brazil from space at night: dark land, cities as lights. With a focus
// (a state, someone), the rest goes dim and only the focus shines.
const COLOR = { land: "#171c29", lit: "#4f611d", light: "#c8e64a", lightSoft: "#7d9230", dimCity: "#343c50", hot: "#e4ff6a", halo: "#4d5d1d" };

interface Cell {
  c: number;
  r: number;
  uf: UF | null;
}

interface Grid {
  cells: Cell[];
  cell: number;
  rows: number;
  bounds: { minX: number; minZ: number };
}

const grids = new Map<number, Grid>();
/** Every land cell and its state, sampled once per server and scale (Brazil grows with its cities). */
function gridAt(scale: number): Grid {
  const cached = grids.get(scale);
  if (cached) return cached;
  const geo = geoAt(scale);
  const b = geo.bounds;
  const cell = (b.maxX - b.minX) / COLS;
  const rows = Math.ceil((b.maxZ - b.minZ) / cell);
  const out: Cell[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < COLS; c++) {
      const x = b.minX + (c + 0.5) * cell;
      const z = b.minZ + (r + 0.5) * cell;
      if (!geo.onLand(x, z)) continue;
      out.push({ c, r, uf: STATES.find((s) => geo.inState(s.uf, x, z))?.uf ?? null });
    }
  // Fernando de Noronha: a speck off the coast.
  const [ix, iz] = geo.project(ISLAND.at);
  out.push({ c: Math.floor((ix - b.minX) / cell), r: Math.floor((iz - b.minZ) / cell), uf: null });
  const g = { cells: out, cell, rows, bounds: b };
  grids.set(scale, g);
  return g;
}

/** A city's footprint in cells by how many devs live there. */
const spanOf = (devs: number) => (devs === 0 ? 0 : devs < 10 ? 1 : devs < 60 ? 2 : 3);

export function BrasilPixels({
  width,
  height,
  scale = 1,
  cities,
  lit = null,
  hot = null,
  litIsland = false,
}: {
  width: number;
  height: number;
  /** The map's scale (BrasilLayout.scale): the cities' lots are at it. */
  scale?: number;
  cities: CityLayout[];
  /** The state drawn lit. */
  lit?: UF | null;
  /** The city that glows (someone's), in lots. */
  hot?: [number, number] | null;
  litIsland?: boolean;
}) {
  const grid = gridAt(scale);
  const ROWS = grid.rows;
  const cellOf = (x: number, z: number) => [Math.floor((x - grid.bounds.minX) / grid.cell), Math.floor((z - grid.bounds.minZ) / grid.cell)] as const;
  const px = Math.min(width / COLS, height / ROWS);
  const gap = Math.max(1, Math.round(px * 0.14));
  const offX = (width - COLS * px) / 2;
  const offY = (height - ROWS * px) / 2;
  const rect = (c: number, r: number, fill: string, key: string, s = 1) => (
    <rect key={key} x={offX + c * px} y={offY + r * px} width={px * s - gap} height={px * s - gap} fill={fill} />
  );
  const land = grid.cells;
  const islandCell = land[land.length - 1];
  const rects = land.map((k, i) => rect(k.c, k.r, (lit && k.uf === lit) || (litIsland && k === islandCell) ? COLOR.lit : COLOR.land, `l${i}`));

  const focused = !!lit || litIsland || !!hot;
  for (const city of cities) {
    const span = spanOf(city.devs.length);
    if (!span) continue;
    const [x, z] = lotToWorld(...city.center);
    const [c, r] = cellOf(x, z);
    const o = Math.floor(span / 2);
    const inFocus = (lit && city.uf === lit) || (litIsland && !city.uf);
    const fill = !focused ? (span >= 2 ? COLOR.light : COLOR.lightSoft) : inFocus ? COLOR.light : COLOR.dimCity;
    // A big city glows: a soft ring round its light.
    if (span === 3 && (!focused || inFocus)) rects.push(rect(c - o - 1, r - o - 1, COLOR.halo, `g${city.key}`, span + 2));
    rects.push(rect(c - o, r - o, fill, `c${city.key}`, span));
  }
  if (hot) {
    const [x, z] = lotToWorld(...hot);
    const [c, r] = cellOf(x + LOT / 2, z + LOT / 2);
    for (let dc = -2; dc <= 2; dc++) for (let dr = -2; dr <= 2; dr++) if (Math.abs(dc) === 2 || Math.abs(dr) === 2) rects.push(rect(c + dc, r + dr, COLOR.halo, `h${dc}${dr}`));
    rects.push(rect(c - 1, r - 1, COLOR.hot, "hot", 3));
  }
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {rects}
    </svg>
  );
}
