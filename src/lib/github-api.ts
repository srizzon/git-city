import type { TopRepo } from "@/lib/github";

// ─── Constants ───────────────────────────────────────────────

export const FETCH_TIMEOUT_MS = 15_000;

// ─── Helpers ─────────────────────────────────────────────────

export function ghHeaders(): HeadersInit {
  const h: HeadersInit = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "git-city-app",
  };
  if (process.env.GITHUB_TOKEN) {
    h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return h;
}

// ─── Expanded GitHub Data (GraphQL) ──────────────────────────

export interface ExpandedGitHubData {
  contributions: number;
  contributions_total: number;
  contribution_years: number[];
  total_prs: number;
  total_reviews: number;
  total_issues: number;
  repos_contributed_to: number;
  followers: number;
  following: number;
  organizations_count: number;
  account_created_at: string | null;
  current_streak: number;
  longest_streak: number;
  active_days_last_year: number;
  current_week_contributions: number;
}

function buildYearAliases(): string {
  const currentYear = new Date().getFullYear();
  const lines: string[] = [];
  for (let y = currentYear; y >= currentYear - 9; y--) {
    lines.push(`y${y}: contributionsCollection(from: "${y}-01-01T00:00:00Z", to: "${y}-12-31T23:59:59Z") { contributionCalendar { totalContributions } }`);
  }
  return lines.join("\n    ");
}

function computeStreaks(weeks: Array<{ contributionDays: Array<{ contributionCount: number; date: string }> }>): {
  current_streak: number;
  longest_streak: number;
  active_days_last_year: number;
} {
  const allDays: { count: number; date: string }[] = [];
  for (const week of weeks) {
    for (const day of week.contributionDays) {
      allDays.push({ count: day.contributionCount, date: day.date });
    }
  }
  allDays.sort((a, b) => a.date.localeCompare(b.date));

  let active_days_last_year = 0;
  let longest_streak = 0;
  let currentRun = 0;

  for (const day of allDays) {
    if (day.count > 0) {
      active_days_last_year++;
      currentRun++;
      if (currentRun > longest_streak) longest_streak = currentRun;
    } else {
      currentRun = 0;
    }
  }

  let current_streak = 0;
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  for (let i = allDays.length - 1; i >= 0; i--) {
    const day = allDays[i];
    if (i === allDays.length - 1 && day.date !== today && day.date !== yesterday) break;
    if (i === allDays.length - 1 && day.count === 0 && day.date === today) continue;
    if (day.count > 0) {
      current_streak++;
    } else {
      break;
    }
  }

  return { current_streak, longest_streak, active_days_last_year };
}

export async function fetchExpandedGitHubData(login: string): Promise<ExpandedGitHubData | null> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return null;

  const yearAliases = buildYearAliases();

  const query = `
    query($login: String!) {
      user(login: $login) {
        createdAt
        followers { totalCount }
        following { totalCount }
        organizations(first: 1) { totalCount }
        repositoriesContributedTo(first: 1, contributionTypes: [COMMIT, PULL_REQUEST]) {
          totalCount
        }

        current: contributionsCollection {
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays { contributionCount, date }
            }
          }
          totalPullRequestContributions
          totalIssueContributions
          totalPullRequestReviewContributions
        }

        ${yearAliases}
      }
    }
  `;

  try {
    const res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables: { login } }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!res.ok) return null;

    const json = await res.json();
    const user = json?.data?.user;
    if (!user) return null;

    const currentCollection = user.current;
    const contributions = currentCollection?.contributionCalendar?.totalContributions ?? 0;

    const currentYear = new Date().getFullYear();
    let contributions_total = 0;
    const contribution_years: number[] = [];
    for (let y = currentYear; y >= currentYear - 9; y--) {
      const yearData = user[`y${y}`];
      const yearContribs = yearData?.contributionCalendar?.totalContributions ?? 0;
      if (yearContribs > 0) {
        contributions_total += yearContribs;
        contribution_years.push(y);
      }
    }

    const weeks = currentCollection?.contributionCalendar?.weeks ?? [];
    const streaks = computeStreaks(weeks);

    const now = new Date();
    const isoWeekStart = new Date(now);
    const dayOfWeek = now.getDay();
    isoWeekStart.setDate(now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1));
    isoWeekStart.setHours(0, 0, 0, 0);
    let current_week_contributions = 0;
    for (const week of weeks) {
      for (const day of week.contributionDays ?? []) {
        if (new Date(day.date) >= isoWeekStart) {
          current_week_contributions += day.contributionCount;
        }
      }
    }

    return {
      contributions,
      contributions_total,
      contribution_years,
      total_prs: currentCollection?.totalPullRequestContributions ?? 0,
      total_reviews: currentCollection?.totalPullRequestReviewContributions ?? 0,
      total_issues: currentCollection?.totalIssueContributions ?? 0,
      repos_contributed_to: user.repositoriesContributedTo?.totalCount ?? 0,
      followers: user.followers?.totalCount ?? 0,
      following: user.following?.totalCount ?? 0,
      organizations_count: user.organizations?.totalCount ?? 0,
      account_created_at: user.createdAt ?? null,
      ...streaks,
      current_week_contributions,
    };
  } catch {
    return null;
  }
}

// ─── Full Developer Fetch ────────────────────────────────────

export class GitHubFetchError extends Error {
  code: "not_found" | "organization" | "no_activity" | "rate_limit";
  status: number;
  constructor(code: GitHubFetchError["code"], message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export interface GitHubDeveloperData {
  github_login: string;
  github_id: number;
  name: string | null;
  avatar_url: string | null;
  bio: string | null;
  contributions: number;
  public_repos: number;
  total_stars: number;
  primary_language: string | null;
  top_repos: TopRepo[];
  github_etag: string | null;
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
  current_week_contributions?: number;
}

/**
 * Fetch full developer data from GitHub REST + GraphQL APIs.
 * Throws GitHubFetchError for known error cases (404, org, no activity, rate limit).
 * @param allowEmpty - If true, skip the "no public activity" check (used during login).
 */
export async function fetchGitHubDeveloperData(
  login: string,
  options?: { allowEmpty?: boolean },
): Promise<GitHubDeveloperData> {
  const headers = ghHeaders();

  const userRes = await fetch(
    `https://api.github.com/users/${encodeURIComponent(login)}`,
    { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
  );

  if (!userRes.ok) {
    if (userRes.status === 404) throw new GitHubFetchError("not_found", "User not found", 404);
    if (userRes.status === 403) throw new GitHubFetchError("rate_limit", "GitHub API rate limit exceeded.", 429);
    throw new Error(`Failed to fetch user data (${userRes.status})`);
  }

  const ghUser = await userRes.json();

  if (ghUser.type === "Organization") {
    throw new GitHubFetchError("organization", "Organizations are not supported. Search for a user profile instead.", 400);
  }

  const resolvedLogin = ghUser.login;

  const [expanded, reposPage1Res] = await Promise.all([
    fetchExpandedGitHubData(resolvedLogin),
    fetch(
      `https://api.github.com/users/${encodeURIComponent(resolvedLogin)}/repos?sort=pushed&per_page=100&page=1`,
      { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
    ),
  ]);

  const contributions = expanded?.contributions ?? 0;
  const publicRepos = ghUser.public_repos;

  if (!options?.allowEmpty && contributions === 0 && publicRepos === 0) {
    throw new GitHubFetchError("no_activity", "This user has no public activity on GitHub yet.", 400);
  }

  type RepoItem = { name: string; stargazers_count: number; language: string | null; html_url: string; fork: boolean; size: number };
  let repos: RepoItem[] = reposPage1Res.ok ? await reposPage1Res.json() : [];

  if (repos.length >= 100) {
    const page2Res = await fetch(
      `https://api.github.com/users/${encodeURIComponent(resolvedLogin)}/repos?sort=pushed&per_page=100&page=2`,
      { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
    );
    if (page2Res.ok) {
      repos = repos.concat(await page2Res.json());
    }
  }

  const ownRepos = repos.filter((r) => !r.fork);
  const totalStars = ownRepos.reduce((s, r) => s + r.stargazers_count, 0);

  const langCounts: Record<string, number> = {};
  const uniqueLanguages = new Set<string>();
  for (const repo of ownRepos) {
    if (repo.language) {
      langCounts[repo.language] = (langCounts[repo.language] || 0) + repo.size;
      uniqueLanguages.add(repo.language);
    }
  }
  const primaryLanguage = Object.entries(langCounts).sort(([, a], [, b]) => b - a)[0]?.[0] ?? null;

  const topRepos: TopRepo[] = ownRepos
    .sort((a, b) => b.stargazers_count - a.stargazers_count)
    .slice(0, 5)
    .map((r) => ({ name: r.name, stars: r.stargazers_count, language: r.language, url: r.html_url }));

  return {
    github_login: resolvedLogin.toLowerCase(),
    github_id: ghUser.id,
    name: ghUser.name,
    avatar_url: ghUser.avatar_url,
    bio: ghUser.bio,
    contributions,
    public_repos: publicRepos,
    total_stars: totalStars,
    primary_language: primaryLanguage,
    top_repos: topRepos,
    github_etag: userRes.headers.get("etag"),
    ...(expanded ? {
      contributions_total: expanded.contributions_total,
      contribution_years: expanded.contribution_years,
      total_prs: expanded.total_prs,
      total_reviews: expanded.total_reviews,
      total_issues: expanded.total_issues,
      repos_contributed_to: expanded.repos_contributed_to,
      followers: expanded.followers,
      following: expanded.following,
      organizations_count: expanded.organizations_count,
      account_created_at: expanded.account_created_at,
      current_streak: expanded.current_streak,
      longest_streak: expanded.longest_streak,
      active_days_last_year: expanded.active_days_last_year,
      language_diversity: uniqueLanguages.size,
      current_week_contributions: expanded.current_week_contributions,
    } : {}),
  };
}
