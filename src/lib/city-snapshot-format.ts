/**
 * Compact city snapshot (v2).
 *
 * The v1 snapshot shipped every developer row as a keyed object: ~90 MB of
 * JSON (~9 MB gzipped) for 87k developers, of which only ~35k ever get a
 * building on the SF map. v2 ships only the developers the layout places,
 * column-oriented (no repeated keys), with lossy-but-sufficient encodings:
 *
 *  - timestamps → whole days since epoch (only used for tenure/age maths)
 *  - contribution_years → its length (the layout only reads `.length`)
 *  - avatar_url → dropped, rebuilt from the login
 *  - rank → delta from the previous row (rows are rank-ordered)
 *  - always-zero weekly counters (never selected by the cron) → dropped
 *
 * `norms` carries the city-wide maxima the layout normalizes against, so a
 * layout over the trimmed subset matches a layout over everyone.
 *
 * Pure module: imported by the snapshot cron (encode) and the browser (decode).
 */
import type { LayoutNorms } from "./github";

export const SNAPSHOT_V2_PATH = "city-v2.json";

const DAY_MS = 86_400_000;

type Loadout = { crown: string | null; roof: string | null; aura: string | null };
type RaidTag = { attacker_login: string; tag_style: string; expires_at: string };
type LeagueCrown = { league_slug: string; league_name: string; week_start: string; expires_at: string };

export interface SnapshotV2 {
  v: 2;
  generated_at: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stats: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _d: any[];
  norms: LayoutNorms;
  n: number;
  c: {
    id: number[];
    login: string[];
    name: (string | null)[];
    contributions: number[];
    total_stars: number[];
    public_repos: number[];
    primary_language: (string | null)[];
    rank_delta: number[];
    claimed: (0 | 1)[];
    claimed_at: (number | null)[];
    created_at: (number | null)[];
    kudos_count: number[];
    visit_count: number[];
    contributions_total: number[];
    years: number[];
    total_prs: number[];
    total_reviews: number[];
    repos_contributed_to: number[];
    followers: number[];
    following: number[];
    organizations_count: number[];
    account_created_at: (number | null)[];
    current_streak: number[];
    active_days_last_year: number[];
    language_diversity: number[];
    app_streak: number[];
    rabbit_completed: (0 | 1)[];
    district: (string | null)[];
    district_chosen: (0 | 1)[];
    xp_total: number[];
    xp_level: number[];
    owned_items: (string[] | 0)[];
    custom_color: (string | null)[];
    billboard_images: (string[] | 0)[];
    achievements: (string[] | 0)[];
    loadout: (Loadout | null)[];
    active_raid_tag: (RaidTag | null)[];
    pixels_spent: number[];
    /** Optional: snapshots written before leagues don't have it. */
    active_league_crown?: (LeagueCrown | null)[];
  };
}

const toDay = (v: unknown): number | null => {
  if (typeof v !== "string") return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? Math.floor(t / DAY_MS) : null;
};
const fromDay = (d: number | null): string | null =>
  d == null ? null : new Date(d * DAY_MS).toISOString();
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const list = (v: unknown): string[] | 0 => (Array.isArray(v) && v.length > 0 ? (v as string[]) : 0);

/** Encode rank-ordered developer rows (the v1 row shape) into v2 columns. */
export function encodeSnapshotV2(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  devs: Record<string, any>[],
  meta: { norms: LayoutNorms; stats: unknown; _d: unknown[]; generated_at: string },
): SnapshotV2 {
  const c = {} as SnapshotV2["c"];
  for (const k of [
    "id", "login", "name", "contributions", "total_stars", "public_repos", "primary_language",
    "rank_delta", "claimed", "claimed_at", "created_at", "kudos_count", "visit_count",
    "contributions_total", "years", "total_prs", "total_reviews", "repos_contributed_to",
    "followers", "following", "organizations_count", "account_created_at", "current_streak",
    "active_days_last_year", "language_diversity", "app_streak", "rabbit_completed", "district",
    "district_chosen", "xp_total", "xp_level", "owned_items", "custom_color", "billboard_images",
    "achievements", "loadout", "active_raid_tag", "pixels_spent", "active_league_crown",
  ] as const) {
    (c as Record<string, unknown[]>)[k] = [];
  }

  let prevRank = 0;
  for (const d of devs) {
    const rank = num(d.rank);
    c.id.push(num(d.id));
    c.login.push(d.github_login);
    c.name.push(d.name ?? null);
    c.contributions.push(num(d.contributions));
    c.total_stars.push(num(d.total_stars));
    c.public_repos.push(num(d.public_repos));
    c.primary_language.push(d.primary_language ?? null);
    c.rank_delta.push(rank - prevRank);
    prevRank = rank;
    c.claimed.push(d.claimed ? 1 : 0);
    c.claimed_at.push(toDay(d.claimed_at));
    c.created_at.push(toDay(d.created_at));
    c.kudos_count.push(num(d.kudos_count));
    c.visit_count.push(num(d.visit_count));
    c.contributions_total.push(num(d.contributions_total));
    c.years.push(Array.isArray(d.contribution_years) ? d.contribution_years.length : 0);
    c.total_prs.push(num(d.total_prs));
    c.total_reviews.push(num(d.total_reviews));
    c.repos_contributed_to.push(num(d.repos_contributed_to));
    c.followers.push(num(d.followers));
    c.following.push(num(d.following));
    c.organizations_count.push(num(d.organizations_count));
    c.account_created_at.push(toDay(d.account_created_at));
    c.current_streak.push(num(d.current_streak));
    c.active_days_last_year.push(num(d.active_days_last_year));
    c.language_diversity.push(num(d.language_diversity));
    c.app_streak.push(num(d.app_streak));
    c.rabbit_completed.push(d.rabbit_completed ? 1 : 0);
    c.district.push(d.district ?? null);
    c.district_chosen.push(d.district_chosen ? 1 : 0);
    c.xp_total.push(num(d.xp_total));
    c.xp_level.push(num(d.xp_level) || 1);
    c.owned_items.push(list(d.owned_items));
    c.custom_color.push(d.custom_color ?? null);
    c.billboard_images.push(list(d.billboard_images));
    c.achievements.push(list(d.achievements));
    c.loadout.push(d.loadout ?? null);
    c.active_raid_tag.push(d.active_raid_tag ?? null);
    c.pixels_spent.push(num(d.pixels_spent));
    c.active_league_crown!.push((d.active_league_crown as LeagueCrown | null | undefined) ?? null);
  }

  return { v: 2, n: devs.length, c, ...meta } as SnapshotV2;
}

/** Decode v2 columns back into the v1 row shape the city code consumes. */
export function decodeSnapshotV2(s: SnapshotV2) {
  const { c, n } = s;
  const thisYear = new Date().getUTCFullYear();
  const developers = new Array(n);
  let rank = 0;
  for (let i = 0; i < n; i++) {
    rank += c.rank_delta[i];
    const login = c.login[i];
    const years = c.years[i];
    developers[i] = {
      id: c.id[i],
      github_login: login,
      name: c.name[i],
      avatar_url: `https://avatars.githubusercontent.com/${login}`,
      contributions: c.contributions[i],
      total_stars: c.total_stars[i],
      public_repos: c.public_repos[i],
      primary_language: c.primary_language[i],
      rank,
      claimed: c.claimed[i] === 1,
      claimed_at: fromDay(c.claimed_at[i]),
      created_at: fromDay(c.created_at[i]),
      kudos_count: c.kudos_count[i],
      visit_count: c.visit_count[i],
      contributions_total: c.contributions_total[i],
      contribution_years: Array.from({ length: years }, (_, y) => thisYear - y),
      total_prs: c.total_prs[i],
      total_reviews: c.total_reviews[i],
      repos_contributed_to: c.repos_contributed_to[i],
      followers: c.followers[i],
      following: c.following[i],
      organizations_count: c.organizations_count[i],
      account_created_at: fromDay(c.account_created_at[i]),
      current_streak: c.current_streak[i],
      active_days_last_year: c.active_days_last_year[i],
      language_diversity: c.language_diversity[i],
      app_streak: c.app_streak[i],
      rabbit_completed: c.rabbit_completed[i] === 1,
      district: c.district[i],
      district_chosen: c.district_chosen[i] === 1,
      xp_total: c.xp_total[i],
      xp_level: c.xp_level[i],
      owned_items: c.owned_items[i] || [],
      custom_color: c.custom_color[i],
      billboard_images: c.billboard_images[i] || [],
      achievements: c.achievements[i] || [],
      loadout: c.loadout[i],
      raid_xp: 0,
      current_week_contributions: 0,
      current_week_kudos_given: 0,
      current_week_kudos_received: 0,
      active_raid_tag: c.active_raid_tag[i],
      pixels_spent: c.pixels_spent[i],
      active_league_crown: c.active_league_crown?.[i] ?? null,
    };
  }
  return { developers, stats: s.stats, _d: s._d, norms: s.norms, generated_at: s.generated_at };
}
