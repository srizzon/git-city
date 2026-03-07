import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createServerSupabase } from "@/lib/supabase-server";
import type { TopRepo } from "@/lib/github";
import { calculateGithubXp } from "@/lib/xp";

// Allow up to 60s on Vercel (Pro plan). Hobby plan max is 10s.
export const maxDuration = 60;

// Timeout for external API calls (15 seconds)
const FETCH_TIMEOUT_MS = 15_000;

// ─── Rate Limiting ───────────────────────────────────────────
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
    lines.push(`y${y}: contributionsCollection(from: "${y}-01-01T00:00:00Z", to: "${y}-12-31T23:59:59Z") { contributionCalendar { totalContributions } }`);
  }
  return lines.join("\n    ");
}

function computeStreaks(weeks: Array<{ contributionDays: Array<{ contributionCount: number; date: string }> }>): {
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
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;
  const sb = getSupabaseAdmin();

  const { data: cached } = await sb
    .from("developers")
    .select("*")
    .eq("github_login", username.toLowerCase())
    .single();

  // Rate limit only applies to brand-new developers (not in DB at all).
  // Stale refreshes for existing devs are unlimited ("already in the city").
  const isInternalBackfill =
    request.headers.get("x-internal-backfill") === process.env.SUPABASE_SERVICE_ROLE_KEY;

  let rateLimitKey: string | null = null;
  if (process.env.NODE_ENV !== "development" && !cached && !isInternalBackfill) {
    // Auth user ID is preferred over IP to avoid shared-IP false positives
    // (e.g. users behind the same corporate/university NAT sharing a quota).
    let key: string;
    try {
      const authClient = await createServerSupabase();
      const { data: { user } } = await authClient.auth.getUser();
      key = user ? `user:${user.id}` : (
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        request.headers.get("x-real-ip") ??
        "unknown"
      );
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
        { status: 429 }
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

    // ETag conditional request: free 304s don't count against GitHub rate limit.
    // However, the /users ETag only covers profile fields (name, bio, public_repos).
    // Contributions (GraphQL) and stars (repos endpoint) have independent freshness,
    // so a 304 only means "profile unchanged" — we still re-fetch the expensive
    // pipelines once the cached row is older than FULL_REFRESH_INTERVAL.
    const FULL_REFRESH_INTERVAL = 60 * 60 * 1000; // 1 hour
    const cachedAge = cached ? Date.now() - new Date(cached.fetched_at).getTime() : Infinity;
    const needsFullRefresh = cachedAge >= FULL_REFRESH_INTERVAL;

    const userRes = await fetch(
      `https://api.github.com/users/${encodeURIComponent(username)}`,
      {
        headers: {
          ...headers,
          ...(cached?.github_etag ? { "If-None-Match": cached.github_etag } : {}),
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      },
    );

    if (userRes.status === 304 && !needsFullRefresh) {
      return NextResponse.json(cached, {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      });
    }

    // 304 but contributions/stars may be stale: reuse cached profile fields, re-fetch the rest
    const profileNotModified = userRes.status === 304;

    if (!profileNotModified && !userRes.ok) {
      if (userRes.status === 404) {
        return NextResponse.json(
          { error: "User not found" },
          { status: 404 }
        );
      }
      if (userRes.status === 403) {
        return NextResponse.json(
          { error: "GitHub API rate limit exceeded." },
          { status: 429 }
        );
      }
      return NextResponse.json(
        { error: "Failed to fetch user data" },
        { status: userRes.status }
      );
    }

    const ghUser = profileNotModified ? null : await userRes.json();

    // Reject organizations (only possible on a fresh 200 response)
    if (ghUser?.type === "Organization") {
      return NextResponse.json(
        { error: "Organizations are not supported. Search for a user profile instead." },
        { status: 400 }
      );
    }

    const login = ghUser?.login ?? cached!.github_login;

    // Fetch expanded GitHub data (GraphQL) and first page of repos in parallel
    const [expanded, reposPage1Res] = await Promise.all([
      fetchExpandedGitHubData(login),
      fetch(
        `https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=pushed&per_page=100&page=1`,
        { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
      ),
    ]);

    const contributions = expanded?.contributions ?? 0;

    const publicRepos = ghUser?.public_repos ?? cached!.public_repos;

    // Reject users with zero public activity
    if (contributions === 0 && publicRepos === 0) {
      return NextResponse.json(
        { error: "This user has no public activity on GitHub yet." },
        { status: 400 }
      );
    }

    // Paginated repo fetching: page 1 already fetched, fetch 2-5 if needed
    let repos: RepoItem[] = reposPage1Res.ok ? await reposPage1Res.json() : [];

    if (repos.length >= 100) {
      // Cap at 1 extra page (200 repos total) to avoid timeout
      const page2Res = await fetch(
        `https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=pushed&per_page=100&page=2`,
        { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
      );
      if (page2Res.ok) {
        const page2: RepoItem[] = await page2Res.json();
        repos = repos.concat(page2);
      }
    }

    // Derived fields
    const ownRepos = repos.filter((r) => !r.fork);
    const totalStars = ownRepos.reduce(
      (s, r) => s + r.stargazers_count,
      0
    );

    // Primary language by total repo size
    const langCounts: Record<string, number> = {};
    const uniqueLanguages = new Set<string>();
    for (const repo of ownRepos) {
      if (repo.language) {
        langCounts[repo.language] =
          (langCounts[repo.language] || 0) + repo.size;
        uniqueLanguages.add(repo.language);
      }
    }
    const primaryLanguage =
      Object.entries(langCounts).sort(([, a], [, b]) => b - a)[0]?.[0] ??
      null;

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
      github_login: login.toLowerCase(),
      github_id: ghUser?.id ?? cached!.github_id,
      name: ghUser?.name ?? cached!.name,
      avatar_url: ghUser?.avatar_url ?? cached!.avatar_url,
      bio: ghUser?.bio ?? cached!.bio,
      contributions,
      public_repos: publicRepos,
      total_stars: totalStars,
      primary_language: primaryLanguage,
      top_repos: topRepos,
      github_etag: (profileNotModified ? cached?.github_etag : userRes.headers.get("etag")) ?? null,
      fetched_at: new Date().toISOString(),
      // v2 fields
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
      return NextResponse.json(
        { error: "Failed to save developer data" },
        { status: 500 }
      );
    }

    // Recalculate GitHub XP and grant diff
    const devId = upserted?.id;
    if (devId) {
      const newGithubXp = calculateGithubXp({
        contributions: expanded?.contributions_total ?? contributions,
        total_stars: totalStars,
        public_repos: publicRepos,
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

    // Auto-claim: if an auth user exists for this github_login but dev is unclaimed, claim it now
    if (devId && upserted && !upserted.claimed) {
      const admin = getSupabaseAdmin();
      const { data: matchedUsers } = await admin.rpc("find_auth_user_by_github_login", {
        p_github_login: upserted.github_login,
      });
      const matchedUser = (matchedUsers as { id: string }[] | null)?.[0];
      if (matchedUser?.id) {
        await admin
          .from("developers")
          .update({
            claimed: true,
            claimed_by: matchedUser.id,
            claimed_at: new Date().toISOString(),
          })
          .eq("id", devId)
          .eq("claimed", false);
      }
    }

    // Assign last-place rank to new dev (lightweight, no full recalc)
    if (isNewDev && devId) {
      await sb.rpc("assign_new_dev_rank", { dev_id: devId });
    }

    // Fire-and-forget: recalculate ranks in background (don't block the response)
    if (isNewDev) {
      sb.rpc("recalculate_ranks").then(
        () =>
          console.log("Ranks recalculated for new dev:", record.github_login),
        (err: unknown) => console.error("Rank recalculation failed:", err),
      );
    }

    const { data: withRank } = await sb
      .from("developers")
      .select("*")
      .eq("github_login", record.github_login)
      .single();

    revalidatePath(`/dev/${record.github_login}`);

    return NextResponse.json(withRank ?? upserted, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (err) {
    console.error("Dev route error:", err);

    // Graceful degradation: return stale cache if GitHub fetch failed
    if (cached) {
      return NextResponse.json(
        { ...cached, _stale: true },
        {
          headers: {
            "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
          },
        },
      );
    }

    const isTimeout =
      err instanceof DOMException && err.name === "TimeoutError";
    return NextResponse.json(
      {
        error: isTimeout
          ? "GitHub API timed out. Please try again."
          : "Failed to fetch GitHub data",
      },
      { status: isTimeout ? 504 : 500 },
    );
  }
}
