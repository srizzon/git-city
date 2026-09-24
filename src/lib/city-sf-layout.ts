// San Francisco map layout: places developers on the baked OSM footprints.
// Worker-safe (no React/three imports) — the home page runs it off the main
// thread; the snapshot cron runs it to trim the snapshot.
import type {
  CityBuilding, CityLayout, CityPlaza, DeveloperRecord, DistrictZone, SFMapAsset, SFRenderMap,
} from "./github";
import { DISTRICT_NAMES, DISTRICT_COLORS } from "./districts";
import {
  calcDepthV2, calcHeight, calcHeightV2, calcLitPercentageV2, calcWidthV2, hashStr,
  inferDistrict, isV2Dev, precomputeCentrality, resolveNorms, seededRandom,
  type LayoutNorms,
} from "./city-layout-core";

// Dev-independent SF map indexes: footprints sorted by distance to downtown,
// minus those on roads, in parks or on the landmark plaza. Built once per
// asset — every layout (initial load, search, deep-link injection) reuses it.
const sfIndexCache = new WeakMap<SFMapAsset, { F: number[]; candidates: Int32Array; parkPolys: number[][] }>();

function getSFIndex(asset: SFMapAsset) {
  const hit = sfIndexCache.get(asset);
  if (hit) return hit;
  const F = asset.footprints;
  const NF = (F.length / 3) | 0;
  const [dtx, dtz] = asset.meta.downtown;

  const dd = new Float64Array(NF);
  const order = new Array<number>(NF);
  for (let i = 0; i < NF; i++) {
    const x = F[i * 3], z = F[i * 3 + 1];
    const ex = x - dtx, ez = z - dtz;
    dd[i] = ex * ex + ez * ez;
    order[i] = i;
  }
  order.sort((a, b) => dd[a] - dd[b]);

  // ---- road clearance: reject footprints that fall on a road (walkable streets) ----
  const ROAD_CLEAR = [16, 9, 5.5, 4];
  const RCELL = 64;
  type RSeg = { x1: number; z1: number; x2: number; z2: number; r2: number };
  const roadGrid = new Map<string, RSeg[]>();
  for (const rd of asset.roads) {
    const clr = ROAD_CLEAR[rd.c] ?? 5;
    const r2 = clr * clr;
    const p = rd.p;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const seg: RSeg = { x1: p[i], z1: p[i + 1], x2: p[i + 2], z2: p[i + 3], r2 };
      const steps = Math.max(1, Math.ceil(Math.hypot(seg.x2 - seg.x1, seg.z2 - seg.z1) / RCELL));
      for (let s = 0; s <= steps; s++) {
        const mx = seg.x1 + (seg.x2 - seg.x1) * s / steps, mz = seg.z1 + (seg.z2 - seg.z1) * s / steps;
        const k = `${Math.floor(mx / RCELL)},${Math.floor(mz / RCELL)}`;
        (roadGrid.get(k) ?? roadGrid.set(k, []).get(k)!).push(seg);
      }
    }
  }
  const onRoad = (x: number, z: number): boolean => {
    const gx = Math.floor(x / RCELL), gz = Math.floor(z / RCELL);
    for (let ax = -1; ax <= 1; ax++) for (let az = -1; az <= 1; az++) {
      const arr = roadGrid.get(`${gx + ax},${gz + az}`);
      if (!arr) continue;
      for (const s of arr) {
        const dx = s.x2 - s.x1, dz = s.z2 - s.z1, l2 = dx * dx + dz * dz;
        let t = l2 ? ((x - s.x1) * dx + (z - s.z1) * dz) / l2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ddx = x - (s.x1 + t * dx), ddz = z - (s.z1 + t * dz);
        if (ddx * ddx + ddz * ddz < s.r2) return true;
      }
    }
    return false;
  };

  // ---- park index: reject footprints inside parks (parks stay open green) ----
  const PKCELL = 200;
  const parkGrid = new Map<string, number[]>();
  const parkPolys = asset.parks.map((p) => p.p);
  for (let pi = 0; pi < parkPolys.length; pi++) {
    const p = parkPolys[pi];
    if (p.length < 6) continue;
    let mnx = Infinity, mnz = Infinity, mxx = -Infinity, mxz = -Infinity;
    for (let i = 0; i < p.length; i += 2) { const x = p[i], z = p[i + 1]; if (x < mnx) mnx = x; if (x > mxx) mxx = x; if (z < mnz) mnz = z; if (z > mxz) mxz = z; }
    for (let cx = Math.floor(mnx / PKCELL); cx <= Math.floor(mxx / PKCELL); cx++)
      for (let cz = Math.floor(mnz / PKCELL); cz <= Math.floor(mxz / PKCELL); cz++) {
        const k = `${cx},${cz}`;
        (parkGrid.get(k) ?? parkGrid.set(k, []).get(k)!).push(pi);
      }
  }
  const pointInPoly = (x: number, z: number, p: number[]): boolean => {
    let inside = false; const n = p.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = p[i * 2], zi = p[i * 2 + 1], xj = p[j * 2], zj = p[j * 2 + 1];
      if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) inside = !inside;
    }
    return inside;
  };
  const inPark = (x: number, z: number): boolean => {
    const arr = parkGrid.get(`${Math.floor(x / PKCELL)},${Math.floor(z / PKCELL)}`);
    if (!arr) return false;
    for (const pi of arr) if (pointInPoly(x, z, parkPolys[pi])) return true;
    return false;
  };

  // Cleared civic plaza at downtown for the landmarks (spire, bank, sponsors).
  const PLAZA_R2 = 340 * 340;

  const cand: number[] = [];
  for (let oi = 0; oi < NF; oi++) {
    const fi = order[oi];
    const x = F[fi * 3], z = F[fi * 3 + 1];
    if (onRoad(x, z)) continue;
    if (inPark(x, z)) continue;
    if ((x - dtx) * (x - dtx) + (z - dtz) * (z - dtz) < PLAZA_R2) continue;
    cand.push(fi);
  }
  const index = { F, candidates: Int32Array.from(cand), parkPolys };
  sfIndexCache.set(asset, index);
  return index;
}

export function generateSFCityLayout(devs: DeveloperRecord[], asset: SFMapAsset, baseNorms?: LayoutNorms): CityLayout {
  const buildings: CityBuilding[] = [];
  const districtZones: DistrictZone[] = [];

  const { norms, composites } = resolveNorms(devs, baseNorms);
  const { maxContrib, maxStars, maxContribV2 } = norms;
  const centrality = precomputeCentrality(devs, composites, norms);
  const score = (login: string) => centrality.get(login) ?? 0;

  const DISTRICT_ORDER = [
    'backend', 'frontend', 'fullstack', 'data_ai', 'devops',
    'mobile', 'gamedev', 'vibe_coder', 'creator', 'security',
  ];

  const { F, candidates, parkPolys } = getSFIndex(asset);
  const [dtx, dtz] = asset.meta.downtown;
  const NC = candidates.length;

  // ---- size-aware greedy placement (dimensions stay 100% stat-driven) ----
  const sorted = [...devs].sort((a, b) => score(b.github_login) - score(a.github_login));
  const NF = (F.length / 3) | 0;
  const m = Math.min(sorted.length, NF);
  // Sized off the full city (norms.devCount), not the trimmed subset in hand.
  const DOWNTOWN = Math.min(m, Math.max(400, Math.round(Math.min(norms.devCount, NF) * 0.02)));
  const statW = (dev: DeveloperRecord) => isV2Dev(dev)
    ? calcWidthV2(dev)
    : 14 + Math.min(1, dev.public_repos / 100) * 12 + seededRandom(hashStr(dev.github_login)) * 8;
  const statD = (dev: DeveloperRecord) => isV2Dev(dev)
    ? calcDepthV2(dev)
    : 12 + seededRandom(hashStr(dev.github_login) + 99) * 16;

  const PLACE_GAP = 7, PCELL = 48;
  const pgrid = new Map<string, { x: number; z: number; r: number }[]>();
  const placed: { dev: DeveloperRecord; x: number; z: number; w: number; d: number; did: string }[] = [];
  let di = 0, cur = -1, cw = 0, cd = 0, chalf = 0;
  for (let oi = 0; oi < NC && di < m; oi++) {
    if (cur !== di) { cur = di; const dv = sorted[di]; cw = statW(dv); cd = statD(dv); chalf = Math.max(cw, cd) / 2 + PLACE_GAP; }
    const fi = candidates[oi];
    const x = F[fi * 3], z = F[fi * 3 + 1];
    const gx = Math.floor(x / PCELL), gz = Math.floor(z / PCELL);
    let ok = true;
    for (let ax = -2; ax <= 2 && ok; ax++) for (let az = -2; az <= 2 && ok; az++) {
      const arr = pgrid.get(`${gx + ax},${gz + az}`);
      if (!arr) continue;
      for (const pp of arr) { const px = pp.x - x, pz = pp.z - z; const rr = chalf + pp.r; if (px * px + pz * pz < rr * rr) { ok = false; break; } }
    }
    if (!ok) continue;
    const dev = sorted[di];
    const dctx = dev.district ?? inferDistrict(dev.primary_language);
    const did = di < DOWNTOWN ? 'downtown' : (DISTRICT_ORDER.includes(dctx) ? dctx : inferDistrict(dev.primary_language));
    placed.push({ dev, x, z, w: cw, d: cd, did });
    const k = `${gx},${gz}`;
    (pgrid.get(k) ?? pgrid.set(k, []).get(k)!).push({ x, z, r: chalf });
    di++;
  }

  // ---- build CityBuilding objects ----
  const MIN_H = 10, MAX_H = 360;
  const sfHeight = (composite: number) =>
    Math.max(MIN_H, Math.min(MAX_H, MIN_H + Math.pow(Math.max(0, composite), 1.3) * 340));
  for (let n = 0; n < placed.length; n++) {
    const { dev, x: bx, z: bz, w: pw, d: pd, did } = placed[n];
    let composite: number, litPercentage: number;
    if (isV2Dev(dev)) {
      composite = calcHeightV2(dev, maxContribV2, maxStars).composite;
      litPercentage = calcLitPercentageV2(dev);
    } else {
      composite = calcHeight(dev.contributions, dev.total_stars, dev.public_repos, maxContrib, maxStars).composite;
      litPercentage = 0.2 + composite * 0.7;
    }
    const width = Math.max(8, Math.round(pw));
    const depth = Math.max(8, Math.round(pd));
    const height = sfHeight(composite);
    // Keep windows square (like the GitHub contributions graph): the floor height
    // must match the horizontal window spacing (~4 world units, since
    // windowsPerFloor = width/4). A taller floorH stretches windows vertically.
    const floorH = 4;
    const floors = Math.max(2, Math.floor(height / floorH));
    const windowsPerFloor = Math.max(2, Math.floor(width / 4));
    const sideWindowsPerFloor = Math.max(2, Math.floor(depth / 4));
    const r = dev as unknown as Record<string, unknown>;
    buildings.push({
      login: dev.github_login,
      loginLower: dev.github_login.toLowerCase(),
      rank: dev.rank ?? n + 1,
      contributions: (dev.contributions_total && dev.contributions_total > 0) ? dev.contributions_total : dev.contributions,
      total_stars: dev.total_stars,
      public_repos: dev.public_repos,
      name: dev.name,
      avatar_url: dev.avatar_url,
      primary_language: dev.primary_language,
      claimed: dev.claimed ?? false,
      owned_items: dev.owned_items ?? [],
      custom_color: dev.custom_color ?? null,
      billboard_images: dev.billboard_images ?? [],
      achievements: (r.achievements as string[]) ?? [],
      kudos_count: (r.kudos_count as number) ?? 0,
      visit_count: (r.visit_count as number) ?? 0,
      loadout: (r.loadout as CityBuilding["loadout"]) ?? null,
      app_streak: (r.app_streak as number) ?? 0,
      raid_xp: (r.raid_xp as number) ?? 0,
      current_week_contributions: (r.current_week_contributions as number) ?? 0,
      current_week_kudos_given: (r.current_week_kudos_given as number) ?? 0,
      current_week_kudos_received: (r.current_week_kudos_received as number) ?? 0,
      active_raid_tag: (r.active_raid_tag as CityBuilding["active_raid_tag"]) ?? null,
      active_drop: null,
      rabbit_completed: (r.rabbit_completed as boolean) ?? false,
      xp_total: (r.xp_total as number) ?? 0,
      xp_level: (r.xp_level as number) ?? 1,
      dark: (r.dark as boolean) ?? false,
      active_league_crown: (r.active_league_crown as CityBuilding["active_league_crown"]) ?? null,
      district: did,
      district_chosen: (r.district_chosen as boolean) ?? false,
      position: [bx, 0, bz],
      width, depth, height, floors, windowsPerFloor, sideWindowsPerFloor, litPercentage,
    });
  }

  // ---- district zones (from building positions) ----
  const dzMap: Record<string, CityBuilding[]> = {};
  for (const b of buildings) { const did = b.district ?? 'fullstack'; (dzMap[did] ??= []).push(b); }
  for (const [did, dB] of Object.entries(dzMap)) {
    let mnX = Infinity, mxX = -Infinity, mnZ = Infinity, mxZ = -Infinity, sX = 0, sZ = 0;
    for (const b of dB) {
      mnX = Math.min(mnX, b.position[0]); mxX = Math.max(mxX, b.position[0]);
      mnZ = Math.min(mnZ, b.position[2]); mxZ = Math.max(mxZ, b.position[2]);
      sX += b.position[0]; sZ += b.position[2];
    }
    districtZones.push({
      id: did, name: DISTRICT_NAMES[did] ?? did,
      center: [sX / dB.length, 0, sZ / dB.length],
      bounds: { minX: mnX, maxX: mxX, minZ: mnZ, maxZ: mxZ },
      population: dB.length,
      color: DISTRICT_COLORS[did] ?? '#888888',
    });
  }

  // ---- White Rabbit spawn anchors (one per sighting, sighting N → plazas[N-1]) ----
  // SF has no civic plazas, so the 5-stage rabbit hunt spawns on park centroids
  // — open green spaces with no buildings, so the rabbit is always clickable and
  // never clips a tower. A radar ping guides the player to each one, so we spread
  // them across the *populated* city (not the empty far edges of the peninsula):
  //   • distance: fractions of the city radius, near → far (easy → climactic)
  //   • angle: golden-angle steps, so each hunt heads a different direction
  // Each target snaps to the nearest sizable park, kept clear of the downtown
  // landmark plaza (bank/spire/arcade/sponsors within ~340u) and of each other.
  const plazas: CityPlaza[] = [];
  {
    const cands: { x: number; z: number; span: number; d: number }[] = [];
    for (const p of parkPolys) {
      if (p.length < 6) continue;
      let mnx = Infinity, mnz = Infinity, mxx = -Infinity, mxz = -Infinity, sx = 0, sz = 0;
      const n = p.length / 2;
      for (let i = 0; i < p.length; i += 2) {
        const x = p[i], z = p[i + 1];
        sx += x; sz += z;
        if (x < mnx) mnx = x; if (x > mxx) mxx = x;
        if (z < mnz) mnz = z; if (z > mxz) mxz = z;
      }
      const span = Math.max(mxx - mnx, mxz - mnz);
      if (span < 60) continue; // skip tiny strips/medians
      const cx = sx / n, cz = sz / n;
      const d = Math.hypot(cx - dtx, cz - dtz);
      if (d < 480) continue; // clear of the downtown landmark plaza
      cands.push({ x: cx, z: cz, span, d });
    }

    // Populated city radius: 92nd percentile of building distance from downtown
    // (ignores a handful of far-flung outliers) so spawns land inside the city.
    const bd = placed.map((b) => Math.hypot(b.x - dtx, b.z - dtz)).sort((a, b) => a - b);
    const cityR = bd.length ? bd[Math.min(bd.length - 1, Math.floor(bd.length * 0.92))] : 2000;

    const FRACTIONS = [0.18, 0.34, 0.52, 0.72, 0.92];
    const GOLDEN = 2.39996; // ~137.5° — even angular spread without clustering
    const MIN_SEP2 = 400 * 400; // two sightings never reuse the same park
    const used: { x: number; z: number }[] = [];
    for (let i = 0; i < FRACTIONS.length; i++) {
      const tr = Math.max(520, cityR * FRACTIONS[i]);
      const ta = i * GOLDEN;
      const tx = dtx + Math.cos(ta) * tr, tz = dtz + Math.sin(ta) * tr;
      let best: typeof cands[number] | null = null, bestD = Infinity;
      for (const c of cands) {
        if (used.some((u) => (u.x - c.x) ** 2 + (u.z - c.z) ** 2 < MIN_SEP2)) continue;
        const dd = (c.x - tx) ** 2 + (c.z - tz) ** 2;
        if (dd < bestD) { bestD = dd; best = c; }
      }
      if (!best) break; // ran out of distinct parks (tiny city)
      used.push({ x: best.x, z: best.z });
      plazas.push({
        position: [best.x, 0, best.z],
        size: Math.min(120, best.span * 0.6),
        variant: seededRandom(hashStr(`${Math.round(best.x)},${Math.round(best.z)}`)),
      });
    }
  }

  return {
    buildings,
    plazas,
    decorations: [],
    river: null,
    bridges: [],
    districtZones,
    sfMap: sfRenderMap(asset),
  };
}

/** Geometry the renderer draws for the SF map (streets, water, parks). */
export function sfRenderMap(asset: SFMapAsset): SFRenderMap {
  return {
    attribution: asset.meta.attribution,
    bounds: asset.meta.bounds,
    downtown: asset.meta.downtown,
    goldenGate: asset.meta.goldenGate,
    roads: asset.roads,
    parks: asset.parks,
    coast: asset.coast,
    market: asset.market,
    landMask: asset.landMask,
  };
}

// ─── Snapshot trimming (server) ──────────────────────────────

/**
 * The SF map has room for ~35k buildings; developers past that point in the
 * centrality order are never drawn. Returns just the developers the layout
 * places (plus a small buffer for centrality drift between snapshot time and
 * view time), in their original order, with the full-city norms.
 */
export function selectPlacedDevelopers<T extends DeveloperRecord>(
  devs: T[],
  asset: SFMapAsset,
): { devs: T[]; norms: LayoutNorms } {
  const { norms, composites } = resolveNorms(devs);
  const placedCount = generateSFCityLayout(devs, asset, norms).buildings.length;
  const centrality = precomputeCentrality(devs, composites, norms);
  const score = (d: DeveloperRecord) => centrality.get(d.github_login) ?? 0;
  const keepN = Math.min(devs.length, Math.ceil(placedCount * 1.03) + 50);
  const keep = new Set(
    [...devs].sort((a, b) => score(b) - score(a)).slice(0, keepN).map((d) => d.github_login),
  );
  return { devs: devs.filter((d) => keep.has(d.github_login)), norms };
}
