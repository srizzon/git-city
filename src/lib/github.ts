import { SPONSORS } from "./sponsors/registry";

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
  // XP fields
  xp_total?: number;
  xp_level?: number;
  xp_github?: number;
  // Economy
  pixels_spent?: number; // wallets.lifetime_spent — cumulative pixel sink
  // Game fields
  achievements?: string[];
  kudos_count?: number;
  visit_count?: number;
  loadout?: { crown: string | null; roof: string | null; aura: string | null } | null;
  app_streak?: number;
  raid_xp?: number;
  active_raid_tag?: { attacker_login: string; tag_style: string; expires_at: string } | null;
  active_drop?: { id: string; rarity: string; points: number; max_pulls: number; pull_count: number; expires_at: string } | null;
  rabbit_completed?: boolean;
}

export interface TopRepo {
  name: string;
  stars: number;
  language: string | null;
  url: string;
}

export interface CityBuilding {
  login: string;
  // Precomputed lowercase login. Lots of code paths (live presence, raycast
  // resolution, focus lookup) need this and were calling `.toLowerCase()`
  // inside per-frame or per-heartbeat loops over all 80k buildings. Caching
  // it on the building once at layout time eliminates a tidal wave of
  // ephemeral strings.
  loginLower: string;
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
  active_drop?: { id: string; rarity: string; points: number; max_pulls: number; pull_count: number; expires_at: string } | null;
  rabbit_completed: boolean;
  xp_total: number;
  xp_level: number;
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

// ─── Centrality (proximity to center = merit) ───────────────
// Cumulative signals only, so the score is "sticky": inactivity never pushes
// a building outward (others simply climb past it). Higher score = closer to
// the city center, where customizations are seen.

function customizationCount(dev: DeveloperRecord): number {
  const owned = dev.owned_items?.length ?? 0;
  const color = dev.custom_color ? 1 : 0;
  const billboards = Math.min(dev.billboard_images?.length ?? 0, 3);
  const loadout = dev.loadout
    ? (dev.loadout.crown ? 1 : 0) + (dev.loadout.roof ? 1 : 0) + (dev.loadout.aura ? 1 : 0)
    : 0;
  return owned + color + billboards + loadout;
}

function precomputeCentrality(
  devs: DeveloperRecord[],
  composites: Map<string, number>,
): Map<string, number> {
  // Normalization maxes
  let maxComposite = 1e-6, maxXp = 1, maxSpent = 1, maxVisits = 1, maxCustom = 1;
  for (const dev of devs) {
    maxComposite = Math.max(maxComposite, composites.get(dev.github_login) ?? 0);
    maxXp = Math.max(maxXp, dev.xp_total ?? 0);
    maxSpent = Math.max(maxSpent, dev.pixels_spent ?? 0);
    maxVisits = Math.max(maxVisits, dev.visit_count ?? 0);
    maxCustom = Math.max(maxCustom, customizationCount(dev));
  }
  const lnXp = Math.log1p(maxXp);
  const lnSpent = Math.log1p(maxSpent);
  const lnVisits = Math.log1p(maxVisits);
  const now = Date.now();
  const TENURE_FULL_MS = 730 * 24 * 60 * 60 * 1000; // ~2 years in city = full marks

  const map = new Map<string, number>();
  for (const dev of devs) {
    const ghN = (composites.get(dev.github_login) ?? 0) / maxComposite;
    const xpN = lnXp > 0 ? Math.log1p(dev.xp_total ?? 0) / lnXp : 0;
    const customN = (customizationCount(dev) / maxCustom);
    const spentN = lnSpent > 0 ? Math.log1p(dev.pixels_spent ?? 0) / lnSpent : 0;

    const joined = dev.claimed_at ?? dev.created_at;
    const tenureN = joined
      ? Math.min(1, Math.max(0, (now - new Date(joined).getTime()) / TENURE_FULL_MS))
      : 0;
    const visitsN = lnVisits > 0 ? Math.log1p(dev.visit_count ?? 0) / lnVisits : 0;
    const timeN = 0.6 * tenureN + 0.4 * visitsN;

    const centrality =
      0.40 * ghN +
      0.20 * xpN +
      0.15 * customN +
      0.15 * timeN +
      0.10 * spentN;
    map.set(dev.github_login, centrality);
  }
  return map;
}

// ─── District Layout ────────────────────────────────────────

// Display maps live in lib/districts (lightweight, OG-image safe); re-exported
// here so existing imports keep working.
export { DISTRICT_NAMES, DISTRICT_COLORS } from './districts';
import { DISTRICT_NAMES, DISTRICT_COLORS } from './districts';

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

// ─── San Francisco map asset (baked from OSM by scripts/bake-sf-map.mjs) ──
export interface SFMapAsset {
  meta: {
    attribution: string;
    origin: [number, number];
    bounds: [number, number, number, number];
    downtown: [number, number];
    goldenGate: [[number, number], [number, number]];
    count: number;
  };
  footprints: number[]; // flat [x, z, cap] * N (meters)
  roads: { c: number; p: number[] }[];
  parks: { p: number[] }[];
  coast: { p: number[] }[];
  market: number[] | null;
  landMask?: { res: number; data: string };
}

// Geometry handed to the renderer to draw streets/water/parks/landmarks.
export interface SFRenderMap {
  attribution: string;
  bounds: [number, number, number, number];
  downtown: [number, number];
  goldenGate: [[number, number], [number, number]];
  roads: { c: number; p: number[] }[];
  parks: { p: number[] }[];
  coast: { p: number[] }[];
  market: number[] | null;
  landMask?: { res: number; data: string };
  // Grid road tiles (Kenney): flat [x, z, lenAlong, width, horizontal?1:0] per straight,
  // and flat [x, z, size] per crossroad. Axis-aligned so the tiles fit cleanly.
  roadStraights?: number[];
  roadCrosses?: number[];
}

export interface CityLayout {
  buildings: CityBuilding[];
  plazas: CityPlaza[];
  decorations: CityDecoration[];
  river: CityRiver | null;
  bridges: CityBridge[];
  districtZones: DistrictZone[];
  sfMap?: SFRenderMap;
}

export function generateCityLayout(devs: DeveloperRecord[], sfMap?: SFMapAsset): CityLayout {
  if (sfMap) return generateSFCityLayout(devs, sfMap);
  const buildings: CityBuilding[] = [];
  const plazas: CityPlaza[] = [];
  const decorations: CityDecoration[] = [];
  const districtZones: DistrictZone[] = [];
  const maxContrib = devs.reduce((max, d) => Math.max(max, d.contributions), 1);
  const maxStars = devs.reduce((max, d) => Math.max(max, d.total_stars), 1);
  const maxContribV2 = devs.reduce((max, d) => Math.max(max, d.contributions_total ?? 0), 1);

  // ── 1. Group by district, sort within each, concat in priority order ──
  const composites = precomputeComposites(devs, maxContrib, maxStars, maxContribV2);
  // Centrality blends GitHub + game engagement (XP, customizations, time, spend).
  // It drives proximity to the center: higher = closer.
  const centrality = precomputeCentrality(devs, composites);
  const score = (login: string) => centrality.get(login) ?? 0;

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

  // ── Extract top global devs as "downtown" (champions core at the center) ──
  const DOWNTOWN_COUNT = 50;
  const LOTS_PER_BLOCK = BLOCK_SIZE * BLOCK_SIZE; // 16
  const allDevsSorted = [...devs].sort((a, b) => score(b.github_login) - score(a.github_login));
  const downtownDevs = allDevsSorted.slice(0, DOWNTOWN_COUNT);
  const downtownSet = new Set(downtownDevs.map(d => d.github_login));

  // Downtown devs stay sorted by centrality (biggest first = center of spiral)

  const downtownOverride = new Set(downtownDevs.map(d => d.github_login));

  // ── Per-district dev arrays (sorted by centrality, minus downtown) ──
  // Highest centrality first so the wedge fill places them nearest the center.
  const byCentralityDesc = (a: DeveloperRecord, b: DeveloperRecord) =>
    score(b.github_login) - score(a.github_login);
  const districtDevArrays: { did: string; devs: DeveloperRecord[] }[] = [];
  for (const did of DISTRICT_ORDER) {
    const group = districtGroups[did];
    if (!group || group.length === 0) continue;
    const filtered = group.filter(d => !downtownSet.has(d.github_login));
    if (filtered.length === 0) continue;
    districtDevArrays.push({ did, devs: filtered.sort(byCentralityDesc) });
  }
  for (const [did, group] of Object.entries(districtGroups)) {
    if (!DISTRICT_ORDER.includes(did)) {
      const filtered = group.filter(d => !downtownSet.has(d.github_login));
      if (filtered.length === 0) continue;
      districtDevArrays.push({ did, devs: filtered.sort(byCentralityDesc) });
    }
  }

  // ── 2. Place blocks on a GLOBAL axis-aligned grid ──
  // Downtown champions core at the center; districts fan out as angular wedges
  // (angle = district identity, radius = merit). occupiedCells prevents overlap.
  const BLOCK_STEP_X = BLOCK_FOOTPRINT_X + STREET_W; // 173
  const BLOCK_STEP_Z = BLOCK_FOOTPRINT_Z + STREET_W; // 149
  const RIVER_Z_THRESHOLD = BLOCK_STEP_Z / 2;
  const RIVER_PUSH = RIVER_WIDTH + 2 * RIVER_MARGIN - STREET_W;

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
        loginLower: dev.github_login.toLowerCase(),
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
        active_drop: null,
        rabbit_completed: (dev as unknown as Record<string, unknown>).rabbit_completed as boolean ?? false,
        xp_total: (dev as unknown as Record<string, unknown>).xp_total as number ?? 0,
        xp_level: (dev as unknown as Record<string, unknown>).xp_level as number ?? 1,
        district: did,
        district_chosen: (dev as unknown as Record<string, unknown>).district_chosen as boolean ?? false,
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
      const [pcx, initialPcz] = gridToWorld(ogx, ogz);
      let pcz = initialPcz;
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

  // ── Helper: place one block at an exact grid cell (wedge layout) ──
  function placeBlockAtCell(gx: number, gz: number, blockDevs: DeveloperRecord[]) {
    occupiedCells.add(`${gx},${gz}`);
    let [blockCX, blockCZ] = gridToWorld(gx, gz);
    if (blockCZ > RIVER_Z_THRESHOLD) blockCZ += RIVER_PUSH;
    const jitterSeed = globalBlockSeed * 10000;
    blockCX += (seededRandom(jitterSeed) - 0.5) * 6;
    blockCZ += (seededRandom(jitterSeed + 7777) - 0.5) * 6;
    placeBlockContent(blockCX, blockCZ, blockDevs, globalBlockSeed);
    allBlocks.push({ cx: blockCX, cz: blockCZ, gx, gz });
    globalBlockSeed++;
  }

  // ── Helper: angle = district, radius = merit ──
  // Walk grid cells outward from the center. Each free cell joins the district
  // wedge its angle falls into and receives that district's next-best block
  // (already sorted by centrality), so top devs land on the innermost cells.
  function placeWedgeFill(
    wedges: { did: string; devs: DeveloperRecord[]; start: number; end: number }[],
  ) {
    const queues = wedges
      .map(w => {
        const blocks: DeveloperRecord[][] = [];
        for (let i = 0; i < w.devs.length; i += LOTS_PER_BLOCK) {
          blocks.push(w.devs.slice(i, i + LOTS_PER_BLOCK));
        }
        return { start: w.start, end: w.end, blocks, ptr: 0 };
      })
      .filter(q => q.blocks.length > 0);
    if (queues.length === 0) return;

    const hasRemaining = (q: typeof queues[number]) => q.ptr < q.blocks.length;

    function pickQueue(theta: number): number {
      // Primary: the wedge whose angular range contains theta.
      for (let i = 0; i < queues.length; i++) {
        if (theta >= queues[i].start && theta < queues[i].end && hasRemaining(queues[i])) return i;
      }
      // Overflow (wedge already drained): nearest wedge still holding blocks.
      let best = -1, bestDist = Infinity;
      for (let i = 0; i < queues.length; i++) {
        if (!hasRemaining(queues[i])) continue;
        const mid = (queues[i].start + queues[i].end) / 2;
        let d = Math.abs(theta - mid);
        if (d > Math.PI) d = Math.PI * 2 - d;
        if (d < bestDist) { bestDist = d; best = i; }
      }
      return best;
    }

    // Incremental square-spiral walk from the center, outward (matches spiralCoord).
    let sx = 0, sy = 0, sdx = 1, sdy = 0, segLen = 1, segPassed = 0, turns = 0;
    const totalBlocks = queues.reduce((n, q) => n + q.blocks.length, 0);
    const maxGuard = (totalBlocks + occupiedCells.size) * 8 + 1000;
    let placed = 0, guard = 0;
    while (placed < totalBlocks && guard++ < maxGuard) {
      const gx = sx, gz = sy;
      // advance spiral state for the next iteration
      sx += sdx; sy += sdy; segPassed++;
      if (segPassed === segLen) {
        segPassed = 0;
        const t = sdx; sdx = -sdy; sdy = t;
        turns++;
        if (turns % 2 === 0) segLen++;
      }
      if (occupiedCells.has(`${gx},${gz}`)) continue;
      let theta = Math.atan2(gz, gx);
      if (theta < 0) theta += Math.PI * 2;
      const qi = pickQueue(theta);
      if (qi < 0) break;
      placeBlockAtCell(gx, gz, queues[qi].blocks[queues[qi].ptr++]);
      placed++;
    }
  }

  // ── Reserve grid cells for landmarks ──
  // E.Arcade: grid(1, -1)
  occupiedCells.add("1,-1");
  // FounderSpire: grid(3, 0)
  occupiedCells.add("3,0");
  // Sponsored landmarks (dynamic)
  for (const s of SPONSORS) occupiedCells.add(`${s.gridX},${s.gridZ}`);

  // ── A) Downtown: champions core at grid (0, 0) — top global by centrality ──
  placeSpiralCluster(downtownDevs, 0, 0, false);

  // ── B) Districts as angular wedges: angle = identity, radius = merit ──
  // Each wedge's angle is proportional to its block count, so the disc fills
  // evenly and every wedge reaches a similar outer radius (no holes/lopsiding).
  const totalDistrictBlocks = districtDevArrays.reduce(
    (n, d) => n + Math.ceil(d.devs.length / LOTS_PER_BLOCK), 0,
  );
  if (totalDistrictBlocks > 0) {
    const wedges: { did: string; devs: DeveloperRecord[]; start: number; end: number }[] = [];
    let acc = 0;
    for (const { did, devs: ddevs } of districtDevArrays) {
      const start = (acc / totalDistrictBlocks) * Math.PI * 2;
      acc += Math.ceil(ddevs.length / LOTS_PER_BLOCK);
      const end = (acc / totalDistrictBlocks) * Math.PI * 2;
      wedges.push({ did, devs: ddevs, start, end });
    }
    placeWedgeFill(wedges);
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

// ─── San Francisco layout ───────────────────────────────────
// Devs on real SF building footprints. Size-aware greedy placement by merit
// (top centrality -> nearest downtown), rejecting footprints on roads / inside
// parks / in the downtown landmark plaza. Building dimensions stay stat-driven.

function generateSFCityLayout(devs: DeveloperRecord[], asset: SFMapAsset): CityLayout {
  const buildings: CityBuilding[] = [];
  const districtZones: DistrictZone[] = [];

  const maxContrib = devs.reduce((m, d) => Math.max(m, d.contributions), 1);
  const maxStars = devs.reduce((m, d) => Math.max(m, d.total_stars), 1);
  const maxContribV2 = devs.reduce((m, d) => Math.max(m, d.contributions_total ?? 0), 1);
  const composites = precomputeComposites(devs, maxContrib, maxStars, maxContribV2);
  const centrality = precomputeCentrality(devs, composites);
  const score = (login: string) => centrality.get(login) ?? 0;

  const DISTRICT_ORDER = [
    'backend', 'frontend', 'fullstack', 'data_ai', 'devops',
    'mobile', 'gamedev', 'vibe_coder', 'creator', 'security',
  ];

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

  // ---- size-aware greedy placement (dimensions stay 100% stat-driven) ----
  const sorted = [...devs].sort((a, b) => score(b.github_login) - score(a.github_login));
  const m = Math.min(sorted.length, NF);
  const DOWNTOWN = Math.min(m, Math.max(400, Math.round(m * 0.02)));
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
  for (let oi = 0; oi < NF && di < m; oi++) {
    if (cur !== di) { cur = di; const dv = sorted[di]; cw = statW(dv); cd = statD(dv); chalf = Math.max(cw, cd) / 2 + PLACE_GAP; }
    const fi = order[oi];
    const x = F[fi * 3], z = F[fi * 3 + 1];
    if (onRoad(x, z)) continue;
    if (inPark(x, z)) continue;
    if ((x - dtx) * (x - dtx) + (z - dtz) * (z - dtz) < PLAZA_R2) continue;
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
    sfMap: {
      attribution: asset.meta.attribution,
      bounds: asset.meta.bounds,
      downtown: asset.meta.downtown,
      goldenGate: asset.meta.goldenGate,
      roads: asset.roads,
      parks: asset.parks,
      coast: asset.coast,
      market: asset.market,
      landMask: asset.landMask,
    },
  };
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
