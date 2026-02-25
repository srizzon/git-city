// ─── Types ───────────────────────────────────────────────────

export interface DeveloperRecord {
  id: number;
  github_login: string;
  github_id: number | null;
  name: string | null;
  avatar_url: string | null;
  bio: string | null;
  contributions: number;
  public_repos: number;
  total_stars: number;
  primary_language: string | null;
  top_repos: TopRepo[];
  rank: number | null;
  fetched_at: string;
  created_at: string;
  claimed: boolean;
  fetch_priority: number;
  claimed_at: string | null;
  owned_items?: string[];
  custom_color?: string | null;
  billboard_images?: string[];
  // v2 fields (optional for backward compat)
  contributions_total?: number;
  contribution_years?: number[];
  total_prs?: number;
  total_reviews?: number;
  total_issues?: number;
  repos_contributed_to?: number;
  followers?: number;
  following?: number;
  organizations_count?: number;
  account_created_at?: string | null;
  current_streak?: number;
  longest_streak?: number;
  active_days_last_year?: number;
  language_diversity?: number;
}

export interface TopRepo {
  name: string;
  stars: number;
  language: string | null;
  url: string;
}

export interface CityBuilding {
  login: string;
  rank: number;
  contributions: number;
  total_stars: number;
  public_repos: number;
  name: string | null;
  avatar_url: string | null;
  primary_language: string | null;
  claimed: boolean;
  owned_items: string[];
  custom_color?: string | null;
  billboard_images?: string[];
  achievements: string[];
  kudos_count: number;
  visit_count: number;
  loadout?: { crown: string | null; roof: string | null; aura: string | null } | null;
  app_streak: number;
  position: [number, number, number];
  width: number;
  depth: number;
  height: number;
  floors: number;
  windowsPerFloor: number;
  sideWindowsPerFloor: number;
  litPercentage: number;
}

export interface CityPlaza {
  position: [number, number, number];
  size: number;
  variant: number; // 0-1 seeded random for visual variety
}

export interface CityDecoration {
  type: 'tree' | 'streetLamp' | 'car' | 'bench' | 'fountain' | 'sidewalk' | 'roadMarking';
  position: [number, number, number];
  rotation: number;
  variant: number;
  size?: [number, number];
}

// ─── Spiral Coordinate ──────────────────────────────────────

function spiralCoord(index: number): [number, number] {
  if (index === 0) return [0, 0];

  let x = 0,
    y = 0,
    dx = 1,
    dy = 0;
  let segLen = 1,
    segPassed = 0,
    turns = 0;

  for (let i = 0; i < index; i++) {
    x += dx;
    y += dy;
    segPassed++;
    if (segPassed === segLen) {
      segPassed = 0;
      // turn left
      const tmp = dx;
      dx = -dy;
      dy = tmp;
      turns++;
      if (turns % 2 === 0) segLen++;
    }
  }
  return [x, y];
}

// ─── City Layout ─────────────────────────────────────────────

const BLOCK_SIZE_DOWNTOWN = 3; // 3x3 grid inside block
const BLOCK_SIZE_SUBURB = 2; // 2x2 grid
const DOWNTOWN_RANK_LIMIT = 500;
const STREET_WIDTH = 45;
const AVENUE_WIDTH = 80;
const AVENUE_INTERVAL = 4; // avenue every 4 blocks
const CELL_SPACING = 50; // spacing between buildings within a block

// Spiral slots that become plazas instead of building blocks
const PLAZA_SLOTS = new Set([3, 7, 12, 18, 25, 33, 42, 52, 63, 75, 88, 102]);

const MAX_BUILDING_HEIGHT = 600;
const MIN_BUILDING_HEIGHT = 10;
const HEIGHT_RANGE = MAX_BUILDING_HEIGHT - MIN_BUILDING_HEIGHT; // 590

function calcHeight(
  contributions: number,
  totalStars: number,
  publicRepos: number,
  maxContrib: number,
  maxStars: number,
): { height: number; composite: number } {
  const effMaxC = Math.min(maxContrib, 20_000);
  const effMaxS = Math.min(maxStars, 200_000);

  // Normalize to 0-1 (can exceed 1 for outliers)
  const cNorm = contributions / Math.max(1, effMaxC);
  const sNorm = totalStars / Math.max(1, effMaxS);
  const rNorm = Math.min(publicRepos / 200, 1);

  // Power curves — exponent < 1 compresses, > 0.5 gives more contrast than sqrt
  const cScore = Math.pow(Math.min(cNorm, 3), 0.55);   // contributions (allow up to 3x max)
  const sScore = Math.pow(Math.min(sNorm, 3), 0.45);   // stars (more generous curve)
  const rScore = Math.pow(rNorm, 0.5);                   // repos

  // Weights: contributions dominate, but stars matter a lot
  const composite = cScore * 0.55 + sScore * 0.35 + rScore * 0.10;

  const height = Math.min(MAX_BUILDING_HEIGHT, MIN_BUILDING_HEIGHT + composite * HEIGHT_RANGE);
  return { height, composite };
}

// ─── V2 Detection & Formulas ────────────────────────────────

function isV2Dev(dev: DeveloperRecord): boolean {
  return (dev.contributions_total ?? 0) > 0;
}

function calcHeightV2(
  dev: DeveloperRecord,
  maxContribV2: number,
  maxStars: number,
): { height: number; composite: number } {
  const contribs = dev.contributions_total! > 0 ? dev.contributions_total! : dev.contributions;

  const cNorm = contribs / Math.max(1, Math.min(maxContribV2, 50_000));
  const sNorm = dev.total_stars / Math.max(1, Math.min(maxStars, 200_000));
  const prNorm = ((dev.total_prs ?? 0) + (dev.total_reviews ?? 0)) / 5_000;
  const extNorm = (dev.repos_contributed_to ?? 0) / 100;
  const fNorm = Math.log10(Math.max(1, dev.followers ?? 0)) / Math.log10(50_000);

  // Consistency: years active / account age
  const accountAgeYears = Math.max(1,
    (Date.now() - new Date(dev.account_created_at || dev.created_at).getTime()) / (365.25 * 24 * 60 * 60 * 1000)
  );
  const yearsActive = dev.contribution_years?.length || 1;
  const consistencyRaw = (yearsActive / accountAgeYears) * Math.min(1, contribs / (accountAgeYears * 200));
  const consistencyNorm = Math.min(1, consistencyRaw);

  const cScore = Math.pow(Math.min(cNorm, 3), 0.55);
  const sScore = Math.pow(Math.min(sNorm, 3), 0.45);
  const prScore = Math.pow(Math.min(prNorm, 2), 0.5);
  const extScore = Math.pow(Math.min(extNorm, 2), 0.5);
  const fScore = Math.pow(Math.min(fNorm, 2), 0.5);
  const cnsScore = Math.pow(consistencyNorm, 0.6);

  const composite =
    cScore  * 0.35 +
    sScore  * 0.20 +
    prScore * 0.15 +
    extScore * 0.10 +
    cnsScore * 0.10 +
    fScore  * 0.10;

  const height = Math.min(MAX_BUILDING_HEIGHT, MIN_BUILDING_HEIGHT + composite * HEIGHT_RANGE);
  return { height, composite };
}

function calcWidthV2(dev: DeveloperRecord): number {
  const repoNorm = Math.min(1, dev.public_repos / 200);
  const langNorm = Math.min(1, (dev.language_diversity ?? 1) / 10);
  const topStarNorm = Math.min(1, (dev.top_repos?.[0]?.stars ?? 0) / 50_000);

  const score =
    Math.pow(repoNorm, 0.5) * 0.50 +
    Math.pow(langNorm, 0.6) * 0.30 +
    Math.pow(topStarNorm, 0.4) * 0.20;

  const jitter = (seededRandom(hashStr(dev.github_login)) - 0.5) * 4;
  return Math.round(14 + score * 24 + jitter);
}

function calcDepthV2(dev: DeveloperRecord): number {
  const extNorm = Math.min(1, (dev.repos_contributed_to ?? 0) / 100);
  const orgNorm = Math.min(1, (dev.organizations_count ?? 0) / 10);
  const prNorm = Math.min(1, (dev.total_prs ?? 0) / 1_000);
  const ratioNorm = (dev.followers ?? 0) > 0
    ? Math.min(1, ((dev.followers ?? 0) / Math.max(1, dev.following ?? 1)) / 10)
    : 0;

  const score =
    Math.pow(extNorm, 0.5) * 0.40 +
    Math.pow(orgNorm, 0.5) * 0.25 +
    Math.pow(prNorm, 0.5) * 0.20 +
    Math.pow(ratioNorm, 0.5) * 0.15;

  const jitter = (seededRandom(hashStr(dev.github_login) + 99) - 0.5) * 4;
  return Math.round(12 + score * 20 + jitter);
}

function calcLitPercentageV2(dev: DeveloperRecord): number {
  const activeDaysNorm = Math.min(1, (dev.active_days_last_year ?? 0) / 300);
  const streakNorm = Math.min(1, (dev.current_streak ?? 0) / 100);

  const avgPerYear = (dev.contributions_total ?? 0) / Math.max(1, dev.contribution_years?.length ?? 1);
  const trendRaw = avgPerYear > 0 ? dev.contributions / avgPerYear : 1;
  const trendNorm = Math.min(2, Math.max(0, trendRaw)) / 2;

  const score =
    activeDaysNorm * 0.60 +
    streakNorm * 0.25 +
    trendNorm * 0.15;

  return 0.05 + score * 0.90;
}

export interface CityRiver {
  x: number;
  width: number;
  length: number;
  centerZ: number;
}

export interface CityBridge {
  position: [number, number, number];
  width: number;
}

const RIVER_WIDTH = 60;

export function generateCityLayout(devs: DeveloperRecord[]): {
  buildings: CityBuilding[];
  plazas: CityPlaza[];
  decorations: CityDecoration[];
  river: CityRiver;
  bridges: CityBridge[];
} {
  const buildings: CityBuilding[] = [];
  const plazas: CityPlaza[] = [];
  const decorations: CityDecoration[] = [];
  const maxContrib = devs[0]?.contributions || 1;
  const maxStars = devs.reduce((max, d) => Math.max(max, d.total_stars), 1);
  const maxContribV2 = devs.reduce((max, d) => Math.max(max, d.contributions_total ?? 0), 1);

  // River runs along Z axis, cutting through X
  const blockSpacing0 = CELL_SPACING * BLOCK_SIZE_DOWNTOWN + STREET_WIDTH;
  const riverX = -(blockSpacing0 * 1.5); // between spiral ring 1 and 2
  const riverMinX = riverX;
  const riverMaxX = riverX + RIVER_WIDTH;

  let devIndex = 0;
  let spiralIndex = 0;

  // Track block positions for road marking generation
  const blockCenters: { cx: number; cz: number; footprint: number; bx: number; by: number }[] = [];

  while (devIndex < devs.length) {
    const isDowntown = devIndex < DOWNTOWN_RANK_LIMIT;
    const blockSize = isDowntown ? BLOCK_SIZE_DOWNTOWN : BLOCK_SIZE_SUBURB;

    // Get block position in spiral
    const [bx, by] = spiralCoord(spiralIndex);

    const blockSpacing = CELL_SPACING * blockSize + STREET_WIDTH;

    const avenueExtraX =
      Math.floor(Math.abs(bx) / AVENUE_INTERVAL) *
      (AVENUE_WIDTH - STREET_WIDTH) *
      Math.sign(bx || 1);
    const avenueExtraZ =
      Math.floor(Math.abs(by) / AVENUE_INTERVAL) *
      (AVENUE_WIDTH - STREET_WIDTH) *
      Math.sign(by || 1);

    const blockCenterX = bx * blockSpacing + avenueExtraX;
    const blockCenterZ = by * blockSpacing + avenueExtraZ;

    // Is this a plaza slot?
    if (PLAZA_SLOTS.has(spiralIndex)) {
      plazas.push({
        position: [blockCenterX, 0, blockCenterZ],
        size: CELL_SPACING * blockSize * 0.8,
        variant: seededRandom(spiralIndex * 997),
      });
      spiralIndex++;
      continue; // skip this slot, don't consume devs
    }

    // Skip entire block if it overlaps the river (don't consume devs)
    const blockHalf = CELL_SPACING * blockSize / 2 + 20;
    if (blockCenterX + blockHalf > riverMinX && blockCenterX - blockHalf < riverMaxX) {
      spiralIndex++;
      continue;
    }

    const devsPerBlock = blockSize * blockSize;
    const blockDevs = devs.slice(devIndex, devIndex + devsPerBlock);

    for (let i = 0; i < blockDevs.length; i++) {
      const dev = blockDevs[i];
      const localRow = Math.floor(i / blockSize);
      const localCol = i % blockSize;

      const offsetX = (localCol - (blockSize - 1) / 2) * CELL_SPACING;
      const offsetZ = (localRow - (blockSize - 1) / 2) * CELL_SPACING;

      const posX = blockCenterX + offsetX;
      const posZ = blockCenterZ + offsetZ;

      let height: number, composite: number, w: number, d: number, litPercentage: number;

      if (isV2Dev(dev)) {
        // V2 path: multidimensional formulas
        ({ height, composite } = calcHeightV2(dev, maxContribV2, maxStars));
        w = calcWidthV2(dev);
        d = calcDepthV2(dev);
        litPercentage = calcLitPercentageV2(dev);
      } else {
        // V1 path: original formulas (unchanged)
        ({ height, composite } = calcHeight(dev.contributions, dev.total_stars, dev.public_repos, maxContrib, maxStars));
        const seed1 = hashStr(dev.github_login);
        const repoFactor = Math.min(1, dev.public_repos / 100);
        const baseW = 14 + repoFactor * 12;
        w = Math.round(baseW + seededRandom(seed1) * 8);
        d = Math.round(12 + seededRandom(seed1 + 99) * 16);
        litPercentage = 0.2 + composite * 0.7;
      }

      const floorH = 6;
      const floors = Math.max(3, Math.floor(height / floorH));
      const windowsPerFloor = Math.max(3, Math.floor(w / 5));
      const sideWindowsPerFloor = Math.max(3, Math.floor(d / 5));

      buildings.push({
        login: dev.github_login,
        rank: dev.rank ?? devIndex + i + 1,
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
        achievements: (dev as unknown as Record<string, unknown>).achievements as string[] ?? [],
        kudos_count: (dev as unknown as Record<string, unknown>).kudos_count as number ?? 0,
        visit_count: (dev as unknown as Record<string, unknown>).visit_count as number ?? 0,
        loadout: (dev as unknown as Record<string, unknown>).loadout as CityBuilding["loadout"] ?? null,
        app_streak: (dev as unknown as Record<string, unknown>).app_streak as number ?? 0,
        position: [posX, 0, posZ],
        width: w,
        depth: d,
        height,
        floors,
        windowsPerFloor,
        sideWindowsPerFloor,
        litPercentage,
      });
    }

    // ── Per-block decorations ──
    const blockFootprint = CELL_SPACING * blockSize;

    // Sidewalk around block (skip if block overlaps river)
    const blockLeft = blockCenterX - blockFootprint / 2 - 4;
    const blockRight = blockCenterX + blockFootprint / 2 + 4;
    const blockInRiver = blockRight > riverMinX && blockLeft < riverMaxX;

    if (!blockInRiver) {
      decorations.push({
        type: 'sidewalk',
        position: [blockCenterX, 0.1, blockCenterZ],
        rotation: 0,
        variant: 0,
        size: [blockFootprint + 8, blockFootprint + 8],
      });
    }

    // Street lamps (2-4 per block)
    const lampCount = 2 + Math.floor(seededRandom(spiralIndex * 311) * 3);
    for (let li = 0; li < lampCount; li++) {
      const seed = spiralIndex * 5000 + li;
      const edge = Math.floor(seededRandom(seed) * 4);
      const along = (seededRandom(seed + 50) - 0.5) * blockFootprint;
      let lx = blockCenterX, lz = blockCenterZ;
      if (edge === 0) { lz -= blockFootprint / 2 + 4; lx += along; }
      else if (edge === 1) { lx += blockFootprint / 2 + 4; lz += along; }
      else if (edge === 2) { lz += blockFootprint / 2 + 4; lx += along; }
      else { lx -= blockFootprint / 2 + 4; lz += along; }
      if (lx > riverMinX - 5 && lx < riverMaxX + 5) continue; // skip river zone
      decorations.push({
        type: 'streetLamp',
        position: [lx, 0, lz],
        rotation: 0,
        variant: 0,
      });
    }

    // Parked cars (0-1 per building, ~50% chance)
    const blockBuildingCount = buildings.length;
    for (let bi = 0; bi < blockDevs.length; bi++) {
      const bldIdx = blockBuildingCount - blockDevs.length + bi;
      if (bldIdx < 0 || bldIdx >= buildings.length) continue;
      const bld = buildings[bldIdx];
      const carSeed = hashStr(blockDevs[bi].github_login) + 777;
      if (seededRandom(carSeed) > 0.5) {
        const side = seededRandom(carSeed + 1) > 0.5 ? 1 : -1;
        const carX = bld.position[0] + side * (bld.width / 2 + 4);
        if (carX > riverMinX - 5 && carX < riverMaxX + 5) continue; // skip river zone
        decorations.push({
          type: 'car',
          position: [carX, 0, bld.position[2]],
          rotation: seededRandom(carSeed + 2) > 0.5 ? 0 : Math.PI,
          variant: Math.floor(seededRandom(carSeed + 3) * 4),
        });
      }
    }

    // Street trees (1-2 per block edge)
    const streetTreeCount = 1 + Math.floor(seededRandom(spiralIndex * 421) * 2);
    for (let ti = 0; ti < streetTreeCount; ti++) {
      const seed = spiralIndex * 6000 + ti;
      const edge = Math.floor(seededRandom(seed) * 4);
      const along = (seededRandom(seed + 50) - 0.5) * blockFootprint * 0.8;
      let tx = blockCenterX, tz = blockCenterZ;
      if (edge === 0) { tz -= blockFootprint / 2 + 6; tx += along; }
      else if (edge === 1) { tx += blockFootprint / 2 + 6; tz += along; }
      else if (edge === 2) { tz += blockFootprint / 2 + 6; tx += along; }
      else { tx -= blockFootprint / 2 + 6; tz += along; }
      if (tx > riverMinX - 5 && tx < riverMaxX + 5) continue; // skip river zone
      decorations.push({
        type: 'tree',
        position: [tx, 0, tz],
        rotation: seededRandom(seed + 100) * Math.PI * 2,
        variant: Math.floor(seededRandom(seed + 200) * 3),
      });
    }

    blockCenters.push({ cx: blockCenterX, cz: blockCenterZ, footprint: blockFootprint, bx, by });

    devIndex += blockDevs.length;
    spiralIndex++;
  }

  // ── Road markings (dashed center lines between blocks) ──
  const DASH_LENGTH = 6;
  const DASH_GAP = 8;
  const DASH_STEP = DASH_LENGTH + DASH_GAP;

  // Build a lookup of block positions by grid coordinate
  const blockByGrid = new Map<string, typeof blockCenters[0]>();
  for (const b of blockCenters) {
    blockByGrid.set(`${b.bx},${b.by}`, b);
  }

  // For each block, generate road markings on the right (+X) and bottom (+Z) edges
  for (const block of blockCenters) {
    const halfFoot = block.footprint / 2;

    // Right road (vertical dashes along Z axis) — between this block and the one to the right
    const rightNeighborKey = `${block.bx + 1},${block.by}`;
    const rightNeighbor = blockByGrid.get(rightNeighborKey);
    if (rightNeighbor) {
      const roadCenterX = (block.cx + halfFoot + rightNeighbor.cx - rightNeighbor.footprint / 2) / 2;
      const roadMinZ = Math.min(block.cz, rightNeighbor.cz) - Math.max(halfFoot, rightNeighbor.footprint / 2);
      const roadMaxZ = Math.max(block.cz, rightNeighbor.cz) + Math.max(halfFoot, rightNeighbor.footprint / 2);

      // Skip if road crosses river
      if (!(roadCenterX + 2 > riverMinX && roadCenterX - 2 < riverMaxX)) {
        for (let z = roadMinZ; z <= roadMaxZ; z += DASH_STEP) {
          decorations.push({
            type: 'roadMarking',
            position: [roadCenterX, 0.2, z],
            rotation: 0,
            variant: 0,
            size: [2, DASH_LENGTH],
          });
        }
      }
    }

    // Bottom road (horizontal dashes along X axis) — between this block and the one below
    const bottomNeighborKey = `${block.bx},${block.by + 1}`;
    const bottomNeighbor = blockByGrid.get(bottomNeighborKey);
    if (bottomNeighbor) {
      const roadCenterZ = (block.cz + halfFoot + bottomNeighbor.cz - bottomNeighbor.footprint / 2) / 2;
      const roadMinX = Math.min(block.cx, bottomNeighbor.cx) - Math.max(halfFoot, bottomNeighbor.footprint / 2);
      const roadMaxX = Math.max(block.cx, bottomNeighbor.cx) + Math.max(halfFoot, bottomNeighbor.footprint / 2);

      for (let x = roadMinX; x <= roadMaxX; x += DASH_STEP) {
        // Skip if dash crosses river
        if (x + 2 > riverMinX && x - 2 < riverMaxX) continue;
        decorations.push({
          type: 'roadMarking',
          position: [x, 0.2, roadCenterZ],
          rotation: Math.PI / 2,
          variant: 0,
          size: [2, DASH_LENGTH],
        });
      }
    }
  }

  // ── Plaza decorations ──
  for (let pi = 0; pi < plazas.length; pi++) {
    const plaza = plazas[pi];
    const [px, , pz] = plaza.position;
    const halfSize = plaza.size / 2;

    // Trees: 4-8 per plaza
    const treeCount = 4 + Math.floor(seededRandom(pi * 137 + 7777) * 5);
    for (let t = 0; t < treeCount; t++) {
      const seed = pi * 10000 + t;
      const tx = px + (seededRandom(seed) - 0.5) * halfSize * 1.6;
      const tz = pz + (seededRandom(seed + 50) - 0.5) * halfSize * 1.6;
      decorations.push({
        type: 'tree',
        position: [tx, 0, tz],
        rotation: seededRandom(seed + 100) * Math.PI * 2,
        variant: Math.floor(seededRandom(seed + 200) * 3),
      });
    }

    // Benches: 2-3 per plaza
    const benchCount = 2 + Math.floor(seededRandom(pi * 251 + 8888) * 2);
    for (let b = 0; b < benchCount; b++) {
      const seed = pi * 20000 + b;
      const bx = px + (seededRandom(seed) - 0.5) * halfSize;
      const bz = pz + (seededRandom(seed + 50) - 0.5) * halfSize;
      decorations.push({
        type: 'bench',
        position: [bx, 0, bz],
        rotation: seededRandom(seed + 100) * Math.PI * 2,
        variant: 0,
      });
    }

    // Fountain in first plaza
    if (pi === 0) {
      decorations.push({
        type: 'fountain',
        position: [px, 0, pz],
        rotation: 0,
        variant: 0,
      });
    }
  }

  // ── River data — length matches city extent ──
  let minZ = 0, maxZ = 0;
  for (const b of buildings) {
    if (b.position[2] < minZ) minZ = b.position[2];
    if (b.position[2] > maxZ) maxZ = b.position[2];
  }
  const riverPadding = 80; // small overshoot past last buildings
  const riverLength = (maxZ - minZ) + riverPadding * 2;
  const riverCenterZ = (minZ + maxZ) / 2;
  const river: CityRiver = { x: riverX, width: RIVER_WIDTH, length: riverLength, centerZ: riverCenterZ };

  // ── Bridges (2: one near downtown, one further out) ──
  const bridgeWidth = RIVER_WIDTH + 20; // extends 10 past each bank
  const bridges: CityBridge[] = [
    { position: [riverX + RIVER_WIDTH / 2, 0, 0], width: bridgeWidth },
    { position: [riverX + RIVER_WIDTH / 2, 0, blockSpacing0 * 3], width: bridgeWidth },
  ];

  return { buildings, plazas, decorations, river, bridges };
}

// ─── Building Dimensions (reusable for shop preview) ────────

export function calcBuildingDims(
  githubLogin: string,
  contributions: number,
  publicRepos: number,
  totalStars: number,
  maxContrib: number,
  maxStars: number,
  v2Data?: Partial<DeveloperRecord>,
): { width: number; height: number; depth: number } {
  // V2 path when expanded data is available
  if (v2Data && (v2Data.contributions_total ?? 0) > 0) {
    const dev: DeveloperRecord = {
      id: 0, github_login: githubLogin, github_id: null, name: null,
      avatar_url: null, bio: null, contributions, public_repos: publicRepos,
      total_stars: totalStars, primary_language: null, top_repos: [],
      rank: null, fetched_at: '', created_at: '', claimed: false,
      fetch_priority: 0, claimed_at: null,
      ...v2Data,
    };
    const { height } = calcHeightV2(dev, maxContrib, maxStars);
    return { width: calcWidthV2(dev), height, depth: calcDepthV2(dev) };
  }

  // V1 fallback
  const { height } = calcHeight(contributions, totalStars, publicRepos, maxContrib, maxStars);
  const seed1 = hashStr(githubLogin);
  const repoFactor = Math.min(1, publicRepos / 100);
  const baseW = 14 + repoFactor * 16;
  const width = Math.round(baseW + seededRandom(seed1) * 10);
  const depth = Math.round(12 + seededRandom(seed1 + 99) * 20);
  return { width, height, depth };
}

// ─── Utilities (kept for Building3D seeded variance) ─────────

export function hashStr(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function seededRandom(seed: number): number {
  const s = (seed * 16807) % 2147483647;
  return (s - 1) / 2147483646;
}
