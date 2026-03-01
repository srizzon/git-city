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
  top_repos?: TopRepo[];
  rank: number | null;
  fetched_at: string;
  created_at: string;
  claimed: boolean;
  fetch_priority: number;
  claimed_at: string | null;
  district?: string | null;
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
  raid_xp: number;
  current_week_contributions: number;
  current_week_kudos_given: number;
  current_week_kudos_received: number;
  active_raid_tag?: { attacker_login: string; tag_style: string; expires_at: string } | null;
  rabbit_completed: boolean;
  district?: string;
  district_chosen?: boolean;
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

const BLOCK_SIZE = 4;     // 4x4 buildings per city block
const LOT_W = 38;        // lot width  (X axis) — tighter packing
const LOT_D = 32;        // lot depth  (Z axis) — tighter packing
const ALLEY_W = 3;       // narrow gap between buildings within a block
const STREET_W = 12;     // street between blocks (within a district)

// Derived: total block footprint
const BLOCK_FOOTPRINT_X = BLOCK_SIZE * LOT_W + (BLOCK_SIZE - 1) * ALLEY_W; // 4*38 + 3*3 = 161
const BLOCK_FOOTPRINT_Z = BLOCK_SIZE * LOT_D + (BLOCK_SIZE - 1) * ALLEY_W; // 4*32 + 3*3 = 137

const RIVER_MARGIN = 8;      // Margin on each side of the river

const MAX_BUILDING_HEIGHT = 600;
const MIN_BUILDING_HEIGHT = 35;
const HEIGHT_RANGE = MAX_BUILDING_HEIGHT - MIN_BUILDING_HEIGHT; // 565

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
  rotation: number; // radians around Y axis
}

export interface DistrictZone {
  id: string;
  name: string;
  center: [number, number, number];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  population: number;
  color: string;
}

const RIVER_WIDTH = 40;

function precomputeComposites(
  devs: DeveloperRecord[],
  maxContrib: number,
  maxStars: number,
  maxContribV2: number,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const dev of devs) {
    const { composite } = isV2Dev(dev)
      ? calcHeightV2(dev, maxContribV2, maxStars)
      : calcHeight(dev.contributions, dev.total_stars, dev.public_repos, maxContrib, maxStars);
    map.set(dev.github_login, composite);
  }
  return map;
}

// ─── District Layout ────────────────────────────────────────

export const DISTRICT_NAMES: Record<string, string> = {
  downtown: 'Downtown',
  frontend: 'Frontend', backend: 'Backend', fullstack: 'Full Stack',
  mobile: 'Mobile', data_ai: 'Data & AI', devops: 'DevOps & Cloud',
  security: 'Security', gamedev: 'GameDev', vibe_coder: 'Vibe Coder',
  creator: 'Creator',
};

export const DISTRICT_COLORS: Record<string, string> = {
  downtown: '#fbbf24',
  frontend: '#3b82f6', backend: '#ef4444', fullstack: '#a855f7',
  mobile: '#22c55e', data_ai: '#06b6d4', devops: '#f97316',
  security: '#dc2626', gamedev: '#ec4899', vibe_coder: '#8b5cf6',
  creator: '#eab308',
};

export const DISTRICT_DESCRIPTIONS: Record<string, string> = {
  downtown: 'The elite core. Top 50 devs by global rank.',
  frontend: 'Pixels, components, and beautiful interfaces.',
  backend: 'APIs, systems, and server-side logic.',
  fullstack: 'Jack of all trades. Ship everything.',
  mobile: 'Native apps for iOS and Android.',
  data_ai: 'Data science, ML, and AI.',
  devops: 'Infrastructure, CI/CD, and cloud.',
  security: 'Hacking, defense, and cryptography.',
  gamedev: 'Game engines, physics, and fun.',
  vibe_coder: 'Aesthetic code. Vibes over velocity.',
  creator: 'Open-source tools and content.',
};

const LANGUAGE_TO_DISTRICT: Record<string, string> = {
  TypeScript: 'frontend', JavaScript: 'frontend', CSS: 'frontend',
  HTML: 'frontend', SCSS: 'frontend', Vue: 'frontend', Svelte: 'frontend',
  Java: 'backend', Go: 'backend', Rust: 'backend', 'C#': 'backend',
  PHP: 'backend', Ruby: 'backend', Elixir: 'backend', C: 'backend',
  'C++': 'backend', Assembly: 'backend', Verilog: 'backend', VHDL: 'backend',
  Python: 'data_ai', 'Jupyter Notebook': 'data_ai', R: 'data_ai', Julia: 'data_ai',
  Swift: 'mobile', Kotlin: 'mobile', Dart: 'mobile', 'Objective-C': 'mobile',
  HCL: 'devops', Shell: 'devops', Dockerfile: 'devops', Nix: 'devops',
  GDScript: 'gamedev', Lua: 'gamedev',
};

export function inferDistrict(lang: string | null): string {
  if (!lang) return 'fullstack';
  return LANGUAGE_TO_DISTRICT[lang] ?? 'fullstack';
}

function localBlockAxisPos(idx: number, footprint: number): number {
  if (idx === 0) return 0;
  const abs = Math.abs(idx);
  const sign = idx >= 0 ? 1 : -1;
  return sign * (abs * footprint + abs * STREET_W);
}

export function generateCityLayout(devs: DeveloperRecord[]): {
  buildings: CityBuilding[];
  plazas: CityPlaza[];
  decorations: CityDecoration[];
  river: CityRiver;
  bridges: CityBridge[];
  districtZones: DistrictZone[];
} {
  const buildings: CityBuilding[] = [];
  const plazas: CityPlaza[] = [];
  const decorations: CityDecoration[] = [];
  const districtZones: DistrictZone[] = [];
  const maxContrib = devs.reduce((max, d) => Math.max(max, d.contributions), 1);
  const maxStars = devs.reduce((max, d) => Math.max(max, d.total_stars), 1);
  const maxContribV2 = devs.reduce((max, d) => Math.max(max, d.contributions_total ?? 0), 1);

  // ── 1. Group by district, sort within each, concat in priority order ──
  const composites = precomputeComposites(devs, maxContrib, maxStars, maxContribV2);

  const DISTRICT_ORDER = [
    'backend', 'frontend', 'fullstack', 'data_ai', 'devops',
    'mobile', 'gamedev', 'vibe_coder', 'creator', 'security',
  ];

  const districtGroups: Record<string, DeveloperRecord[]> = {};
  for (const dev of devs) {
    const did = dev.district ?? inferDistrict(dev.primary_language);
    if (!districtGroups[did]) districtGroups[did] = [];
    districtGroups[did].push(dev);
  }

  // Seeded shuffle for deterministic "random" order
  function seededShuffle<T>(arr: T[], seed: number): T[] {
    const result = [...arr];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(seededRandom(seed + i * 7919) * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  // ── Extract top 50 global devs as "downtown" (center, around the spire) ──
  const DOWNTOWN_COUNT = 50;
  const LOTS_PER_BLOCK = BLOCK_SIZE * BLOCK_SIZE; // 16
  const allDevsSorted = [...devs].sort((a, b) =>
    (composites.get(b.github_login) ?? 0) - (composites.get(a.github_login) ?? 0)
  );
  const downtownDevs = allDevsSorted.slice(0, DOWNTOWN_COUNT);
  const downtownSet = new Set(downtownDevs.map(d => d.github_login));

  for (let i = 0; i < downtownDevs.length; i += LOTS_PER_BLOCK) {
    const end = Math.min(i + LOTS_PER_BLOCK, downtownDevs.length);
    const slice = downtownDevs.slice(i, end);
    const shuffled = seededShuffle(slice, hashStr('downtown') + i);
    for (let j = 0; j < shuffled.length; j++) downtownDevs[i + j] = shuffled[j];
  }

  const downtownOverride = new Set(downtownDevs.map(d => d.github_login));

  // ── Per-district dev arrays (sorted by composite, block-shuffled, minus downtown) ──
  const districtDevArrays: { did: string; devs: DeveloperRecord[] }[] = [];
  for (const did of DISTRICT_ORDER) {
    const group = districtGroups[did];
    if (!group || group.length === 0) continue;
    const filtered = group.filter(d => !downtownSet.has(d.github_login));
    if (filtered.length === 0) continue;
    // Full shuffle: organic mix of tall and short buildings
    districtDevArrays.push({ did, devs: seededShuffle(filtered, hashStr(did)) });
  }
  for (const [did, group] of Object.entries(districtGroups)) {
    if (!DISTRICT_ORDER.includes(did)) {
      const filtered = group.filter(d => !downtownSet.has(d.github_login));
      if (filtered.length === 0) continue;
      districtDevArrays.push({ did, devs: seededShuffle(filtered, hashStr(did)) });
    }
  }

  // ── 2. Place blocks on a GLOBAL axis-aligned grid ──
  // Downtown spiral at center, each district spiral at an offset.
  // occupiedCells prevents any overlap.
  const BLOCK_STEP_X = BLOCK_FOOTPRINT_X + STREET_W; // 173
  const BLOCK_STEP_Z = BLOCK_FOOTPRINT_Z + STREET_W; // 149
  const RIVER_Z_THRESHOLD = BLOCK_STEP_Z / 2;
  const RIVER_PUSH = RIVER_WIDTH + 2 * RIVER_MARGIN - STREET_W;

  // Distance (in grid cells) from center to district spiral origins
  const DISTRICT_GRID_RADIUS = 4;

  const occupiedCells = new Set<string>();
  let globalDevIndex = 0;
  let globalBlockSeed = 0;
  const allBlocks: { cx: number; cz: number; gx: number; gz: number }[] = [];

  // ── Helper: grid coord → world position ──
  function gridToWorld(gx: number, gz: number): [number, number] {
    return [localBlockAxisPos(gx, BLOCK_FOOTPRINT_X), localBlockAxisPos(gz, BLOCK_FOOTPRINT_Z)];
  }

  // ── Helper: create buildings + decorations for one block ──
  function placeBlockContent(
    blockCX: number, blockCZ: number,
    blockDevs: DeveloperRecord[],
    seedIdx: number,
  ) {
    for (let i = 0; i < blockDevs.length; i++) {
      const dev = blockDevs[i];
      const localRow = Math.floor(i / BLOCK_SIZE);
      const localCol = i % BLOCK_SIZE;
      const posX = blockCX + (localCol - (BLOCK_SIZE - 1) / 2) * (LOT_W + ALLEY_W);
      const posZ = blockCZ + (localRow - (BLOCK_SIZE - 1) / 2) * (LOT_D + ALLEY_W);

      let height: number, composite: number, w: number, d: number, litPercentage: number;

      if (isV2Dev(dev)) {
        ({ height, composite } = calcHeightV2(dev, maxContribV2, maxStars));
        w = calcWidthV2(dev);
        d = calcDepthV2(dev);
        litPercentage = calcLitPercentageV2(dev);
      } else {
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
      const did = downtownOverride.has(dev.github_login)
        ? 'downtown'
        : (dev.district ?? inferDistrict(dev.primary_language));

      buildings.push({
        login: dev.github_login,
        rank: dev.rank ?? globalDevIndex + i + 1,
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
        raid_xp: (dev as unknown as Record<string, unknown>).raid_xp as number ?? 0,
        current_week_contributions: (dev as unknown as Record<string, unknown>).current_week_contributions as number ?? 0,
        current_week_kudos_given: (dev as unknown as Record<string, unknown>).current_week_kudos_given as number ?? 0,
        current_week_kudos_received: (dev as unknown as Record<string, unknown>).current_week_kudos_received as number ?? 0,
        active_raid_tag: (dev as unknown as Record<string, unknown>).active_raid_tag as CityBuilding["active_raid_tag"] ?? null,
        rabbit_completed: (dev as unknown as Record<string, unknown>).rabbit_completed as boolean ?? false,
        district: did,
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

    decorations.push({
      type: 'sidewalk',
      position: [blockCX, 0.1, blockCZ],
      rotation: 0,
      variant: 0,
      size: [BLOCK_FOOTPRINT_X + 8, BLOCK_FOOTPRINT_Z + 8],
    });

    const lampSeed = seedIdx * 1000 + 31;
    const lampCount = 2 + Math.floor(seededRandom(lampSeed * 311) * 3);
    for (let li = 0; li < lampCount; li++) {
      const seed = lampSeed * 5000 + li;
      const edge = Math.floor(seededRandom(seed) * 4);
      const alongX = (seededRandom(seed + 50) - 0.5) * BLOCK_FOOTPRINT_X;
      const alongZ = (seededRandom(seed + 50) - 0.5) * BLOCK_FOOTPRINT_Z;
      let lx = blockCX, lz = blockCZ;
      if (edge === 0) { lz -= BLOCK_FOOTPRINT_Z / 2 + 4; lx += alongX; }
      else if (edge === 1) { lx += BLOCK_FOOTPRINT_X / 2 + 4; lz += alongZ; }
      else if (edge === 2) { lz += BLOCK_FOOTPRINT_Z / 2 + 4; lx += alongX; }
      else { lx -= BLOCK_FOOTPRINT_X / 2 + 4; lz += alongZ; }
      decorations.push({ type: 'streetLamp', position: [lx, 0, lz], rotation: 0, variant: 0 });
    }

    for (let bi = 0; bi < blockDevs.length; bi++) {
      const bld = buildings[buildings.length - blockDevs.length + bi];
      const carSeed = hashStr(blockDevs[bi].github_login) + 777;
      if (seededRandom(carSeed) > 0.6) {
        const side = seededRandom(carSeed + 1) > 0.5 ? 1 : -1;
        const carX = bld.position[0] + side * (bld.width / 2 + 6);
        decorations.push({
          type: 'car',
          position: [carX, 0, bld.position[2]],
          rotation: seededRandom(carSeed + 2) > 0.5 ? 0 : Math.PI,
          variant: Math.floor(seededRandom(carSeed + 3) * 4),
        });
      }
    }

    const treeSeed = seedIdx * 2000 + 77;
    const treeCount = 1 + Math.floor(seededRandom(treeSeed * 421) * 2);
    for (let ti = 0; ti < treeCount; ti++) {
      const seed = treeSeed * 6000 + ti;
      const edge = Math.floor(seededRandom(seed) * 4);
      const alongX = (seededRandom(seed + 50) - 0.5) * BLOCK_FOOTPRINT_X * 0.8;
      const alongZ = (seededRandom(seed + 50) - 0.5) * BLOCK_FOOTPRINT_Z * 0.8;
      let tx = blockCX, tz = blockCZ;
      if (edge === 0) { tz -= BLOCK_FOOTPRINT_Z / 2 + 6; tx += alongX; }
      else if (edge === 1) { tx += BLOCK_FOOTPRINT_X / 2 + 6; tz += alongZ; }
      else if (edge === 2) { tz += BLOCK_FOOTPRINT_Z / 2 + 6; tx += alongX; }
      else { tx -= BLOCK_FOOTPRINT_X / 2 + 6; tz += alongZ; }
      decorations.push({
        type: 'tree',
        position: [tx, 0, tz],
        rotation: seededRandom(seed + 100) * Math.PI * 2,
        variant: Math.floor(seededRandom(seed + 200) * 3),
      });
    }

    globalDevIndex += blockDevs.length;
  }

  // ── Helper: place a spiral of devs at grid origin (ogx, ogz) ──
  function placeSpiralCluster(
    clusterDevs: DeveloperRecord[],
    ogx: number, ogz: number,
    addPlaza: boolean,
  ) {
    // Plaza at origin cell
    if (addPlaza) {
      const key = `${ogx},${ogz}`;
      occupiedCells.add(key);
      let [pcx, pcz] = gridToWorld(ogx, ogz);
      if (pcz > RIVER_Z_THRESHOLD) pcz += RIVER_PUSH;
      plazas.push({
        position: [pcx, 0, pcz],
        size: Math.min(BLOCK_FOOTPRINT_X, BLOCK_FOOTPRINT_Z) * 0.8,
        variant: seededRandom(globalBlockSeed * 997 + 42),
      });
      allBlocks.push({ cx: pcx, cz: pcz, gx: ogx, gz: ogz });
      globalBlockSeed++;
    }

    let devIdx = 0;
    let spiralIdx = 0;

    while (devIdx < clusterDevs.length) {
      const [bx, by] = spiralCoord(spiralIdx);
      const gx = ogx + bx;
      const gz = ogz + by;
      const key = `${gx},${gz}`;

      if (occupiedCells.has(key)) { spiralIdx++; continue; }
      occupiedCells.add(key);

      let [blockCX, blockCZ] = gridToWorld(gx, gz);
      if (blockCZ > RIVER_Z_THRESHOLD) blockCZ += RIVER_PUSH;

      const jitterSeed = globalBlockSeed * 10000;
      blockCX += (seededRandom(jitterSeed) - 0.5) * 6;
      blockCZ += (seededRandom(jitterSeed + 7777) - 0.5) * 6;

      const blockDevs = clusterDevs.slice(devIdx, devIdx + LOTS_PER_BLOCK);
      placeBlockContent(blockCX, blockCZ, blockDevs, globalBlockSeed);
      allBlocks.push({ cx: blockCX, cz: blockCZ, gx, gz });

      devIdx += blockDevs.length;
      spiralIdx++;
      globalBlockSeed++;
    }
  }

  // ── A) Downtown: spiral at grid (0, 0) ──
  placeSpiralCluster(downtownDevs, 0, 0, true);

  // ── B) Districts: spiral at offset grid positions ──
  for (let di = 0; di < districtDevArrays.length; di++) {
    const angle = (di / districtDevArrays.length) * Math.PI * 2 - Math.PI / 2;
    // Snap district origin to global grid
    const ogx = Math.round(Math.cos(angle) * DISTRICT_GRID_RADIUS);
    const ogz = Math.round(Math.sin(angle) * DISTRICT_GRID_RADIUS);
    placeSpiralCluster(districtDevArrays[di].devs, ogx, ogz, true);
  }

  // ── Road markings between adjacent blocks (global grid) ──
  const DASH_LENGTH = 6;
  const DASH_GAP = 8;
  const DASH_STEP = DASH_LENGTH + DASH_GAP;
  const blockByGrid = new Map<string, typeof allBlocks[0]>();
  for (const b of allBlocks) blockByGrid.set(`${b.gx},${b.gz}`, b);
  for (const block of allBlocks) {
    const halfX = BLOCK_FOOTPRINT_X / 2;
    const halfZ = BLOCK_FOOTPRINT_Z / 2;
    const right = blockByGrid.get(`${block.gx + 1},${block.gz}`);
    if (right) {
      const roadCX = (block.cx + halfX + right.cx - halfX) / 2;
      const zMin = Math.min(block.cz, right.cz) - halfZ;
      const zMax = Math.max(block.cz, right.cz) + halfZ;
      for (let z = zMin; z <= zMax; z += DASH_STEP) {
        decorations.push({ type: 'roadMarking', position: [roadCX, 0.2, z], rotation: 0, variant: 0, size: [2, DASH_LENGTH] });
      }
    }
    const bottom = blockByGrid.get(`${block.gx},${block.gz + 1}`);
    if (bottom) {
      const roadCZ = (block.cz + halfZ + bottom.cz - halfZ) / 2;
      const xMin = Math.min(block.cx, bottom.cx) - halfX;
      const xMax = Math.max(block.cx, bottom.cx) + halfX;
      for (let x = xMin; x <= xMax; x += DASH_STEP) {
        decorations.push({ type: 'roadMarking', position: [x, 0.2, roadCZ], rotation: Math.PI / 2, variant: 0, size: [2, DASH_LENGTH] });
      }
    }
  }

  // ── Plaza decorations ──
  for (let pi = 0; pi < plazas.length; pi++) {
    const plaza = plazas[pi];
    const [px, , pz] = plaza.position;
    const halfSize = plaza.size / 2;
    const ptreeCount = 4 + Math.floor(seededRandom(pi * 137 + 7777) * 5);
    for (let t = 0; t < ptreeCount; t++) {
      const seed = pi * 10000 + t;
      decorations.push({
        type: 'tree',
        position: [px + (seededRandom(seed) - 0.5) * halfSize * 1.6, 0, pz + (seededRandom(seed + 50) - 0.5) * halfSize * 1.6],
        rotation: seededRandom(seed + 100) * Math.PI * 2,
        variant: Math.floor(seededRandom(seed + 200) * 3),
      });
    }
    const benchCount = 2 + Math.floor(seededRandom(pi * 251 + 8888) * 2);
    for (let b = 0; b < benchCount; b++) {
      const seed = pi * 20000 + b;
      decorations.push({
        type: 'bench',
        position: [px + (seededRandom(seed) - 0.5) * halfSize, 0, pz + (seededRandom(seed + 50) - 0.5) * halfSize],
        rotation: seededRandom(seed + 100) * Math.PI * 2,
        variant: 0,
      });
    }
    if (pi === 0) {
      decorations.push({ type: 'fountain', position: [px, 0, pz], rotation: 0, variant: 0 });
    }
  }

  // ── District zones (computed from actual building positions) ──
  const dzMap: Record<string, CityBuilding[]> = {};
  for (const b of buildings) {
    const did = b.district ?? 'fullstack';
    if (!dzMap[did]) dzMap[did] = [];
    dzMap[did].push(b);
  }
  for (const [did, dBlds] of Object.entries(dzMap)) {
    let mnX = Infinity, mxX = -Infinity, mnZ = Infinity, mxZ = -Infinity;
    let sX = 0, sZ = 0;
    for (const b of dBlds) {
      mnX = Math.min(mnX, b.position[0]); mxX = Math.max(mxX, b.position[0]);
      mnZ = Math.min(mnZ, b.position[2]); mxZ = Math.max(mxZ, b.position[2]);
      sX += b.position[0]; sZ += b.position[2];
    }
    districtZones.push({
      id: did, name: DISTRICT_NAMES[did] ?? did,
      center: [sX / dBlds.length, 0, sZ / dBlds.length],
      bounds: { minX: mnX, maxX: mxX, minZ: mnZ, maxZ: mxZ },
      population: dBlds.length,
      color: DISTRICT_COLORS[did] ?? '#888888',
    });
  }

  // ── River ──
  const riverCenterZ = RIVER_Z_THRESHOLD + RIVER_PUSH / 2 + STREET_W / 2;
  let bMinX = 0, bMaxX = 0;
  for (const b of buildings) {
    if (b.position[0] < bMinX) bMinX = b.position[0];
    if (b.position[0] > bMaxX) bMaxX = b.position[0];
  }
  const riverPadding = 80;
  const riverXExtent = (bMaxX - bMinX) + riverPadding * 2;
  const riverCenterX = (bMinX + bMaxX) / 2;
  const river: CityRiver = {
    x: riverCenterX - riverXExtent / 2,
    width: riverXExtent,
    length: RIVER_WIDTH,
    centerZ: riverCenterZ,
  };

  // ── Bridges ──
  const bridgeWidth = RIVER_WIDTH + 20;
  const bridgeSpacing = riverXExtent / 4;
  const bridges: CityBridge[] = [
    { position: [riverCenterX, 0, riverCenterZ], width: bridgeWidth, rotation: Math.PI / 2 },
    { position: [riverCenterX + bridgeSpacing, 0, riverCenterZ], width: bridgeWidth, rotation: Math.PI / 2 },
    { position: [riverCenterX - bridgeSpacing, 0, riverCenterZ], width: bridgeWidth, rotation: Math.PI / 2 },
  ];

  return { buildings, plazas, decorations, river, bridges, districtZones };
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
