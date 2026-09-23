// City layout maths shared by every layout: building size/lit formulas,
// normalization and centrality. Kept free of React/three imports (unlike
// lib/github, which pulls the sponsor registry) so it can run in a Web Worker.
import type { DeveloperRecord } from "./github";

export const MAX_BUILDING_HEIGHT = 600;
export const MIN_BUILDING_HEIGHT = 35;
export const HEIGHT_RANGE = MAX_BUILDING_HEIGHT - MIN_BUILDING_HEIGHT; // 565

export function calcHeight(
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

export function isV2Dev(dev: DeveloperRecord): boolean {
  return (dev.contributions_total ?? 0) > 0;
}

export function calcHeightV2(
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

export function calcWidthV2(dev: DeveloperRecord): number {
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

export function calcDepthV2(dev: DeveloperRecord): number {
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

export function calcLitPercentageV2(dev: DeveloperRecord): number {
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


// ─── Layout normalization ───────────────────────────────────
// Every size/centrality score is normalized against city-wide maxima. The
// server computes them over the full developer table and ships them with the
// trimmed city snapshot, so a client laying out only the placed subset gets
// exactly the same buildings as a layout over everyone.

export interface LayoutNorms {
  maxContrib: number;
  maxStars: number;
  maxContribV2: number;
  maxComposite: number;
  maxXp: number;
  maxSpent: number;
  maxVisits: number;
  maxCustom: number;
  devCount: number;
}

export function resolveNorms(devs: DeveloperRecord[], base?: LayoutNorms) {
  let maxContrib = base?.maxContrib ?? 1;
  let maxStars = base?.maxStars ?? 1;
  let maxContribV2 = base?.maxContribV2 ?? 1;
  for (const d of devs) {
    if (d.contributions > maxContrib) maxContrib = d.contributions;
    if (d.total_stars > maxStars) maxStars = d.total_stars;
    if ((d.contributions_total ?? 0) > maxContribV2) maxContribV2 = d.contributions_total ?? 0;
  }
  const composites = precomputeComposites(devs, maxContrib, maxStars, maxContribV2);
  const norms: LayoutNorms = {
    maxContrib, maxStars, maxContribV2,
    maxComposite: base?.maxComposite ?? 1e-6,
    maxXp: base?.maxXp ?? 1,
    maxSpent: base?.maxSpent ?? 1,
    maxVisits: base?.maxVisits ?? 1,
    maxCustom: base?.maxCustom ?? 1,
    devCount: Math.max(base?.devCount ?? 0, devs.length),
  };
  for (const dev of devs) {
    norms.maxComposite = Math.max(norms.maxComposite, composites.get(dev.github_login) ?? 0);
    norms.maxXp = Math.max(norms.maxXp, dev.xp_total ?? 0);
    norms.maxSpent = Math.max(norms.maxSpent, dev.pixels_spent ?? 0);
    norms.maxVisits = Math.max(norms.maxVisits, dev.visit_count ?? 0);
    norms.maxCustom = Math.max(norms.maxCustom, customizationCount(dev));
  }
  return { norms, composites };
}

export function computeLayoutNorms(devs: DeveloperRecord[]): LayoutNorms {
  return resolveNorms(devs).norms;
}

export function precomputeComposites(
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

export function customizationCount(dev: DeveloperRecord): number {
  const owned = dev.owned_items?.length ?? 0;
  const color = dev.custom_color ? 1 : 0;
  const billboards = Math.min(dev.billboard_images?.length ?? 0, 3);
  const loadout = dev.loadout
    ? (dev.loadout.crown ? 1 : 0) + (dev.loadout.roof ? 1 : 0) + (dev.loadout.aura ? 1 : 0)
    : 0;
  return owned + color + billboards + loadout;
}

export function precomputeCentrality(
  devs: DeveloperRecord[],
  composites: Map<string, number>,
  norms: LayoutNorms,
): Map<string, number> {
  const { maxComposite, maxXp, maxSpent, maxVisits, maxCustom } = norms;
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
