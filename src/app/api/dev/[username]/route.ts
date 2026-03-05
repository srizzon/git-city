import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createServerSupabase } from "@/lib/supabase-server";
import type { TopRepo } from "@/lib/github";
import { calculateGithubXp } from "@/lib/xp";

async function hashKey(key: string): Promise<string> {
  const data = new TextEncoder().encode(key + (process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""));
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function isRateLimited(key: string): Promise<boolean> {
  const sb = getSupabaseAdmin();
  const ipHash = await hashKey(key);
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { count } = await sb
    .from("add_requests")
    .select("*", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("created_at", oneHourAgo);

  return (count ?? 0) >= 10;
}

async function recordRateLimitRequest(key: string): Promise<void> {
  const sb = getSupabaseAdmin();
  const ipHash = await hashKey(key);
  await sb.from("add_requests").insert({ ip_hash: ipHash });
}

function ghHeaders(): HeadersInit {
  const h: HeadersInit = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "git-city-app",
  };
  if (process.env.GITHUB_TOKEN) {
    h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return h;
}

interface ExpandedGitHubData {
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
    lines.push(
      `y${y}: contributionsCollection(from: "${y}-01-01T00:00:00Z", to: "${y}-12-31T23:59:59Z") { contributionCalendar { totalContributions } }`,
    );
  }
  return lines.join("\n    ");
}

function computeStreaks(
  weeks: Array<{ contributionDays: Array<{ contributionCount: number; date: string }> }>,
): {
  current_streak: number;
  longest_streak: number;
  active_days_last_year: number;
} {
  // Flatten all days in chronological order
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

  // Current streak: consecutive days ending today or yesterday
  let current_streak = 0;
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  for (let i = allDays.length - 1; i >= 0; i--) {
    const day = allDays[i];
    if (i === allDays.length - 1 && day.date !== today && day.date !== yesterday) break;
    if (i === allDays.length - 1 && day.count === 0 && day.date === today) continue; // today with 0, check yesterday
    if (day.count > 0) {
      current_streak++;
    } else {
      break;
    }
  }

  return { current_streak, longest_streak, active_days_last_year };
}

async function fetchExpandedGitHubData(login: string): Promise<ExpandedGitHubData | null> {
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
    });

    if (!res.ok) return null;

    const json = await res.json();
    const user = json?.data?.user;
    if (!user) return null;

    const currentCollection = user.current;
    const contributions = currentCollection?.contributionCalendar?.totalContributions ?? 0;

    // Sum historical years
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

    // Streaks from current year calendar
    const weeks = currentCollection?.contributionCalendar?.weeks ?? [];
    const streaks = computeStreaks(weeks);

    // Weekly contributions (ISO week: Monday-based)
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

// ─── Route Handler ───────────────────────────────────────────

export async function GET(request: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const sb = getSupabaseAdmin();

  const { data: cached } = await sb
    .from("developers")
    .select("*")
    .eq("github_login", username.toLowerCase())
    .single();

  if (cached) {
    const age = Date.now() - new Date(cached.fetched_at).getTime();
    if (age < 24 * 60 * 60 * 1000) {
      return NextResponse.json(cached, {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      });
    }
  }

  // Rate limit only applies to brand-new developers (not in DB at all).
  // Stale refreshes for existing devs are unlimited ("already in the city").
  let rateLimitKey: string | null = null;
  if (process.env.NODE_ENV !== "development" && !cached) {
    // Auth user ID is preferred over IP to avoid shared-IP false positives
    // (e.g. users behind the same corporate/university NAT sharing a quota).
    let key: string;
    try {
      const authClient = await createServerSupabase();
      const {
        data: { user },
      } = await authClient.auth.getUser();
      key = user
        ? `user:${user.id}`
        : (request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          request.headers.get("x-real-ip") ??
          "unknown");
    } catch {
      key =
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        request.headers.get("x-real-ip") ??
        "unknown";
    }

    rateLimitKey = key;
    const limited = await isRateLimited(key);
    if (limited) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Max 10 lookups per hour." },
        { status: 429 },
      );
    }
  }

  try {
    const headers = ghHeaders();

    type RepoItem = {
      name: string;
      stargazers_count: number;
      language: string | null;
      html_url: string;
      fork: boolean;
      size: number;
    };

    const userRes = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, {
      headers,
    });

    if (!userRes.ok) {
      if (userRes.status === 404) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
      if (userRes.status === 403) {
        return NextResponse.json({ error: "GitHub API rate limit exceeded." }, { status: 429 });
      }
      return NextResponse.json({ error: "Failed to fetch user data" }, { status: userRes.status });
    }

    const ghUser = await userRes.json();

    // Reject organizations
    if (ghUser.type === "Organization") {
      return NextResponse.json(
        { error: "Organizations are not supported. Search for a user profile instead." },
        { status: 400 },
      );
    }

    // Fetch expanded GitHub data (GraphQL) and first page of repos in parallel
    const [expanded, reposPage1Res] = await Promise.all([
      fetchExpandedGitHubData(ghUser.login),
      fetch(
        `https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=pushed&per_page=100&page=1`,
        { headers },
      ),
    ]);

    const contributions = expanded?.contributions ?? 0;

    // Reject users with zero public activity
    if (contributions === 0 && ghUser.public_repos === 0) {
      return NextResponse.json(
        { error: "This user has no public activity on GitHub yet." },
        { status: 400 },
      );
    }

    // Paginated repo fetching: page 1 already fetched, fetch 2-5 if needed
    let repos: RepoItem[] = reposPage1Res.ok ? await reposPage1Res.json() : [];

    if (repos.length >= 100) {
      const extraPages = await Promise.all(
        [2, 3, 4, 5].map((page) =>
          fetch(
            `https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=pushed&per_page=100&page=${page}`,
            { headers },
          ).then((r) => (r.ok ? (r.json() as Promise<RepoItem[]>) : [])),
        ),
      );
      for (const page of extraPages) {
        if (page.length === 0) break;
        repos = repos.concat(page);
      }
    }

    // Derived fields
    const ownRepos = repos.filter((r) => !r.fork);
    const totalStars = ownRepos.reduce((s, r) => s + r.stargazers_count, 0);

    // Primary language by total repo size
    const langCounts: Record<string, number> = {};
    const uniqueLanguages = new Set<string>();
    for (const repo of ownRepos) {
      if (repo.language) {
        langCounts[repo.language] = (langCounts[repo.language] || 0) + repo.size;
        uniqueLanguages.add(repo.language);
      }
    }
    const primaryLanguage =
      Object.entries(langCounts).sort(([, a], [, b]) => b - a)[0]?.[0] ?? null;

    // Top 5 repos by stars
    const topRepos: TopRepo[] = ownRepos
      .sort((a, b) => b.stargazers_count - a.stargazers_count)
      .slice(0, 5)
      .map((r) => ({
        name: r.name,
        stars: r.stargazers_count,
        language: r.language,
        url: r.html_url,
      }));

    // Record after validation so failed lookups (typos, orgs) don't burn slots.
    if (rateLimitKey) {
      await recordRateLimitRequest(rateLimitKey);
    }

    // Upsert into Supabase
    const record = {
      github_login: ghUser.login.toLowerCase(),
      github_id: ghUser.id,
      name: ghUser.name,
      avatar_url: ghUser.avatar_url,
      bio: ghUser.bio,
      contributions,
      public_repos: ghUser.public_repos,
      total_stars: totalStars,
      primary_language: primaryLanguage,
      top_repos: topRepos,
      fetched_at: new Date().toISOString(),
      // v2 fields
      ...(expanded
        ? {
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
          }
        : {}),
    };

    // Check if this dev already exists (to detect new buildings)
    const { data: existing } = await sb
      .from("developers")
      .select("id")
      .eq("github_login", record.github_login)
      .maybeSingle();
    const isNewDev = !existing;

    const { data: upserted, error: upsertError } = await sb
      .from("developers")
      .upsert(record, { onConflict: "github_login" })
      .select()
      .single();

    if (upsertError) {
      console.error("Upsert error:", upsertError);
      return NextResponse.json({ error: "Failed to save developer data" }, { status: 500 });
    }

    // Recalculate GitHub XP and grant diff
    const devId = upserted?.id;
    if (devId) {
      const newGithubXp = calculateGithubXp({
        contributions: expanded?.contributions_total ?? contributions,
        total_stars: totalStars,
        public_repos: ghUser.public_repos,
        total_prs: expanded?.total_prs ?? 0,
      });
      const prevGithubXp = (cached?.xp_github as number) ?? 0;
      if (newGithubXp > prevGithubXp) {
        const diff = newGithubXp - prevGithubXp;
        await sb.rpc("grant_xp", { p_developer_id: devId, p_source: "github", p_amount: diff });
        await sb.from("developers").update({ xp_github: newGithubXp }).eq("id", devId);
      }
    }

    // New building added to the city → feed event
    if (isNewDev && devId) {
      await sb.from("activity_feed").insert({
        event_type: "dev_joined",
        actor_id: devId,
        metadata: { login: record.github_login },
      });
    }

    // Assign last-place rank to new dev (lightweight, no full recalc)
    if (isNewDev && devId) {
      await sb.rpc("assign_new_dev_rank", { dev_id: devId });
    }

    const { data: withRank } = await sb
      .from("developers")
      .select("*")
      .eq("github_login", record.github_login)
      .single();

    return NextResponse.json(withRank ?? upserted, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (err) {
    console.error("Dev route error:", err);
    return NextResponse.json({ error: "Failed to fetch GitHub data" }, { status: 500 });
  }
}
