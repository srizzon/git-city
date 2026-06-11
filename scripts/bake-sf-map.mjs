// Bakes a San Francisco map asset for Git City from OpenStreetMap data.
//
//   node scripts/bake-sf-map.mjs
//
// Output: public/maps/sf.json  (streets, parks, coastline, building anchors)
// Raw OSM responses are cached in scripts/.osm-cache/ (gitignored, re-downloadable).
//
// Data © OpenStreetMap contributors (ODbL). Attribution shown in-app.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CACHE = path.join(__dirname, ".osm-cache");
const OUT = path.join(ROOT, "public", "maps", "sf.json");

// SF peninsula bounding box (lat/lon). Slightly wider than the city so the
// bay, the Golden Gate and the bridges read.
const BBOX = [37.700, -122.520, 37.815, -122.355]; // S,W,N,E
const UA = "git-city-map-bake/1.0 (https://git.city)";

const OVERPASS = "https://overpass-api.de/api/interpreter";

async function overpass(query, cacheFile) {
  const cached = path.join(CACHE, cacheFile);
  if (existsSync(cached)) {
    return JSON.parse(await readFile(cached, "utf8"));
  }
  await mkdir(CACHE, { recursive: true });
  console.log(`fetching ${cacheFile} from Overpass...`);
  const res = await fetch(OVERPASS, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA },
    body: "data=" + encodeURIComponent(query),
  });
  if (!res.ok) throw new Error(`Overpass ${res.status} for ${cacheFile}`);
  const json = await res.json();
  await writeFile(cached, JSON.stringify(json));
  return json;
}

const [S, W, N, E] = BBOX;
const bb = `(${S},${W},${N},${E})`;

const roadsQuery = `[out:json][timeout:180];(
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary)$"]${bb};
  way["leisure"="park"]${bb};
  way["natural"="coastline"]${bb};
);out geom;`;

const bldQuery = `[out:json][timeout:240];(
  way["building"]${bb};
  relation["building"]${bb};
);out center;`;

// ---- projection: lat/lon -> local meters, centered on the building cloud ----
const M_PER_DEG_LAT = 111320;
function project(lat, lon, lat0, lon0) {
  const mLon = M_PER_DEG_LAT * Math.cos((lat0 * Math.PI) / 180);
  return [
    (lon - lon0) * mLon,          // x: east+
    (lat0 - lat) * M_PER_DEG_LAT, // z: south+  (north is -z, matches three.js)
  ];
}

async function main() {
  const roads = await overpass(roadsQuery, "sf-roads.json");
  const blds = await overpass(bldQuery, "sf-buildings.json");

  // Projection origin = the Financial District (downtown). The whole city is
  // re-centered on downtown so every origin-centric subsystem (sky ads, fly,
  // collectibles, intro, landmarks) lines up with the focus of the city.
  const centers = blds.elements.filter((e) => e.center).map((e) => e.center);
  const lat0 = 37.7946, lon0 = -122.4007;
  console.log(`origin (downtown/FiDi) lat0=${lat0} lon0=${lon0} | ${centers.length} buildings`);

  // ---- building anchors (projected, integer meters) ----
  const pts = centers.map((c) => project(c.lat, c.lon, lat0, lon0));

  // local footprint cap from nearest-neighbour spacing (so our buildings fit
  // the real density and real street gaps survive). Spatial hash grid.
  const CELL = 40;
  const grid = new Map();
  const key = (cx, cz) => cx * 100000 + cz;
  for (let i = 0; i < pts.length; i++) {
    const cx = Math.floor(pts[i][0] / CELL), cz = Math.floor(pts[i][1] / CELL);
    const k = key(cx, cz);
    (grid.get(k) ?? grid.set(k, []).get(k)).push(i);
  }
  const caps = new Float64Array(pts.length);
  for (let i = 0; i < pts.length; i++) {
    const [x, z] = pts[i];
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    let best = Infinity;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const arr = grid.get(key(cx + dx, cz + dz));
      if (!arr) continue;
      for (const j of arr) {
        if (j === i) continue;
        const ddx = pts[j][0] - x, ddz = pts[j][1] - z;
        const d2 = ddx * ddx + ddz * ddz;
        if (d2 < best) best = d2;
      }
    }
    const nn = best === Infinity ? 24 : Math.sqrt(best);
    caps[i] = Math.max(6, Math.min(60, nn * 0.85));
  }

  // flat [x, z, cap] int array
  const footprints = new Array(pts.length * 3);
  let minx = Infinity, minz = Infinity, maxx = -Infinity, maxz = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const x = Math.round(pts[i][0]), z = Math.round(pts[i][1]);
    footprints[i * 3] = x;
    footprints[i * 3 + 1] = z;
    footprints[i * 3 + 2] = Math.round(caps[i]);
    if (x < minx) minx = x; if (x > maxx) maxx = x;
    if (z < minz) minz = z; if (z > maxz) maxz = z;
  }

  // ---- roads / parks / coastline (projected polylines) ----
  const CLS = { motorway: 0, trunk: 0, primary: 1, secondary: 2, tertiary: 3 };
  const out = { roads: [], parks: [], coast: [] };
  let market = null;
  for (const e of roads.elements) {
    if (!e.geometry || e.geometry.length < 2) continue;
    const p = [];
    for (const g of e.geometry) { const [x, z] = project(g.lat, g.lon, lat0, lon0); p.push(Math.round(x), Math.round(z)); }
    const t = e.tags || {};
    if (t.highway && t.highway in CLS) {
      out.roads.push({ c: CLS[t.highway], p });
      if (t.name === "Market Street") market = market ? market.concat(p) : p;
    } else if (t.leisure === "park") {
      out.parks.push({ p });
    } else if (t.natural === "coastline") {
      out.coast.push({ p });
    }
  }

  // ---- land mask: where there are roads/buildings/parks = land, else water ----
  // Rasterize into a grid so the renderer can draw land only on land and let the
  // bay / Pacific / Golden Gate gap show as water (the peninsula shape, for free).
  const RES = 320;
  const bw = (maxx - minx) || 1, bh = (maxz - minz) || 1;
  let mask = new Uint8Array(RES * RES);
  const mark = (x, z) => {
    const cx = ((x - minx) / bw * RES) | 0, cz = ((z - minz) / bh * RES) | 0;
    if (cx >= 0 && cx < RES && cz >= 0 && cz < RES) mask[cz * RES + cx] = 1;
  };
  for (let i = 0; i < pts.length; i++) mark(footprints[i * 3], footprints[i * 3 + 1]);
  const stepMark = (p) => {
    for (let i = 0; i + 3 < p.length; i += 2) {
      const x1 = p[i], z1 = p[i + 1], x2 = p[i + 2], z2 = p[i + 3];
      const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, z2 - z1) / (bw / RES)));
      for (let s = 0; s <= steps; s++) mark(x1 + (x2 - x1) * s / steps, z1 + (z2 - z1) * s / steps);
    }
  };
  for (const r of out.roads) stepMark(r.p);
  for (const pk of out.parks) { stepMark(pk.p); for (let i = 0; i < pk.p.length; i += 2) mark(pk.p[i], pk.p[i + 1]); }
  // dilate twice so streets/lots merge into solid land (no speckle / holes)
  const dilate = (src) => {
    const dst = new Uint8Array(src.length);
    for (let z = 0; z < RES; z++) for (let x = 0; x < RES; x++) {
      if (src[z * RES + x]) { dst[z * RES + x] = 1; continue; }
      let any = false;
      for (let dz = -1; dz <= 1 && !any; dz++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, nz = z + dz;
        if (nx >= 0 && nx < RES && nz >= 0 && nz < RES && src[nz * RES + nx]) { any = true; break; }
      }
      if (any) dst[z * RES + x] = 1;
    }
    return dst;
  };
  mask = dilate(dilate(mask));
  // fill interior holes: water reachable from the border stays water (bay /
  // Pacific / Golden Gate), enclosed water becomes land (no ponds in the city).
  {
    const outside = new Uint8Array(RES * RES);
    const stack = [];
    const push = (i) => { if (!mask[i] && !outside[i]) { outside[i] = 1; stack.push(i); } };
    for (let x = 0; x < RES; x++) { push(x); push((RES - 1) * RES + x); }
    for (let z = 0; z < RES; z++) { push(z * RES); push(z * RES + RES - 1); }
    while (stack.length) {
      const c = stack.pop(), x = c % RES, z = (c / RES) | 0;
      if (x > 0) push(c - 1); if (x < RES - 1) push(c + 1);
      if (z > 0) push(c - RES); if (z < RES - 1) push(c + RES);
    }
    for (let i = 0; i < mask.length; i++) if (!mask[i] && !outside[i]) mask[i] = 1;
  }
  const landCells = mask.reduce((n, v) => n + v, 0);
  const landMask = { res: RES, data: Buffer.from(mask).toString("base64") };

  // downtown / merit center: Financial District
  const downtown = project(37.7946, -122.4007, lat0, lon0).map(Math.round);
  // Golden Gate Bridge span (Presidio -> Marin), for the hero landmark.
  // The fixed lat/lon only gives a rough reference; snap the span to the actual
  // OSM roadway so the rendered deck sits ON the street (the bridge's main span
  // shows up as the single longest motorway segment near that reference — the
  // node-free leap across the water gap).
  const ggRefA = project(37.8070, -122.4783, lat0, lon0);
  const ggRefB = project(37.8330, -122.4783, lat0, lon0);
  const ggMid = [(ggRefA[0] + ggRefB[0]) / 2, (ggRefA[1] + ggRefB[1]) / 2];
  let ggA = ggRefA.map(Math.round), ggB = ggRefB.map(Math.round), ggBest = 0;
  for (const r of out.roads) {
    if (r.c !== 0) continue; // motorway/trunk only
    const p = r.p;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const mx = (p[i] + p[i + 2]) / 2, mz = (p[i + 1] + p[i + 3]) / 2;
      if (Math.hypot(mx - ggMid[0], mz - ggMid[1]) > 2500) continue;
      const seg = Math.hypot(p[i + 2] - p[i], p[i + 3] - p[i + 1]);
      if (seg > ggBest) {
        ggBest = seg;
        ggA = [Math.round(p[i]), Math.round(p[i + 1])];
        ggB = [Math.round(p[i + 2]), Math.round(p[i + 3])];
      }
    }
  }

  const asset = {
    meta: {
      attribution: "© OpenStreetMap contributors",
      origin: [lat0, lon0],
      bounds: [minx, minz, maxx, maxz],
      downtown,
      goldenGate: [ggA, ggB],
      count: pts.length,
    },
    footprints,
    roads: out.roads,
    parks: out.parks,
    coast: out.coast,
    market,
    landMask,
  };

  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(asset));
  const kb = (JSON.stringify(asset).length / 1024) | 0;
  console.log(`wrote ${OUT}`);
  console.log(`  buildings=${pts.length} roads=${out.roads.length} parks=${out.parks.length} coast=${out.coast.length} landCells=${landCells}/${RES * RES}`);
  console.log(`  bounds x[${minx}..${maxx}] z[${minz}..${maxz}]  downtown=${downtown}  size=${kb}KB`);
}

main().catch((e) => { console.error(e); process.exit(1); });
