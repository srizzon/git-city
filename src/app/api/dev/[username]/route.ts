import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createServerSupabase } from "@/lib/supabase-server";
import type { TopRepo } from "@/lib/github";
import { calculateGithubXp } from "@/lib/xp";
import {
  ghHeaders,
  fetchExpandedGitHubData,
  fetchGitHubDeveloperData,
  GitHubFetchError,
  FETCH_TIMEOUT_MS,
} from "@/lib/github-api";

// Allow up to 60s on Vercel (Pro plan). Hobby plan max is 10s.
export const maxDuration = 60;

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

async function resolveRateLimitKey(request: Request): Promise<string> {
  try {
    const authClient = await createServerSupabase();
    const { data: { user } } = await authClient.auth.getUser();
    if (user) return `user:${user.id}`;
  } catch { /* fall through to IP */ }
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
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

  // ─── New dev: return preview without creating a building ───
  if (!cached) {
    let rateLimitKey: string | null = null;
    if (process.env.NODE_ENV !== "development") {
      const key = await resolveRateLimitKey(request);
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
      const data = await fetchGitHubDeveloperData(username);
      if (rateLimitKey) await recordRateLimitRequest(rateLimitKey);

      return NextResponse.json({
        exists: false,
        preview: {
          github_login: data.github_login,
          avatar_url: data.avatar_url,
          name: data.name,
          bio: data.bio,
          contributions: data.contributions,
          public_repos: data.public_repos,
          total_stars: data.total_stars,
          primary_language: data.primary_language,
        },
      });
    } catch (err) {
      if (err instanceof GitHubFetchError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      const isTimeout = err instanceof DOMException && err.name === "TimeoutError";
      return NextResponse.json(
        { error: isTimeout ? "GitHub API timed out. Please try again." : "Failed to fetch GitHub data" },
        { status: isTimeout ? 504 : 500 },
      );
    }
  }

  // ─── Existing dev: refresh + upsert (unchanged flow) ──────

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

    // ETag conditional request
    const FULL_REFRESH_INTERVAL = 60 * 60 * 1000; // 1 hour
    const cachedAge = Date.now() - new Date(cached.fetched_at).getTime();
    const needsFullRefresh = cachedAge >= FULL_REFRESH_INTERVAL;

    const userRes = await fetch(
      `https://api.github.com/users/${encodeURIComponent(username)}`,
      {
        headers: {
          ...headers,
          ...(cached.github_etag ? { "If-None-Match": cached.github_etag } : {}),
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      },
    );

    if (userRes.status === 304 && !needsFullRefresh) {
      return NextResponse.json({ ...cached, exists: true }, {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      });
    }

    const profileNotModified = userRes.status === 304;

    if (!profileNotModified && !userRes.ok) {
      if (userRes.status === 404) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
      if (userRes.status === 403) {
        return NextResponse.json({ error: "GitHub API rate limit exceeded." }, { status: 429 });
      }
      return NextResponse.json({ error: "Failed to fetch user data" }, { status: userRes.status });
    }

    const ghUser = profileNotModified ? null : await userRes.json();

    if (ghUser?.type === "Organization") {
      return NextResponse.json(
        { error: "Organizations are not supported. Search for a user profile instead." },
        { status: 400 },
      );
    }

    const login = ghUser?.login ?? cached.github_login;

    const [expanded, reposPage1Res] = await Promise.all([
      fetchExpandedGitHubData(login),
      fetch(
        `https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=pushed&per_page=100&page=1`,
        { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
      ),
    ]);

    const contributions = expanded?.contributions ?? 0;
    const publicRepos = ghUser?.public_repos ?? cached.public_repos;

    if (contributions === 0 && publicRepos === 0) {
      return NextResponse.json(
        { error: "This user has no public activity on GitHub yet." },
        { status: 400 },
      );
    }

    let repos: RepoItem[] = reposPage1Res.ok ? await reposPage1Res.json() : [];

    if (repos.length >= 100) {
      const page2Res = await fetch(
        `https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=pushed&per_page=100&page=2`,
        { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
      );
      if (page2Res.ok) {
        const page2: RepoItem[] = await page2Res.json();
        repos = repos.concat(page2);
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
    const primaryLanguage =
      Object.entries(langCounts).sort(([, a], [, b]) => b - a)[0]?.[0] ?? null;

    const topRepos: TopRepo[] = ownRepos
      .sort((a, b) => b.stargazers_count - a.stargazers_count)
      .slice(0, 5)
      .map((r) => ({
        name: r.name,
        stars: r.stargazers_count,
        language: r.language,
        url: r.html_url,
      }));

    const record = {
      github_login: login.toLowerCase(),
      github_id: ghUser?.id ?? cached.github_id,
      name: ghUser?.name ?? cached.name,
      avatar_url: ghUser?.avatar_url ?? cached.avatar_url,
      bio: ghUser?.bio ?? cached.bio,
      contributions,
      public_repos: publicRepos,
      total_stars: totalStars,
      primary_language: primaryLanguage,
      top_repos: topRepos,
      github_etag: (profileNotModified ? cached.github_etag : userRes.headers.get("etag")) ?? null,
      fetched_at: new Date().toISOString(),
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
        public_repos: publicRepos,
        total_prs: expanded?.total_prs ?? 0,
      });
      const prevGithubXp = (cached.xp_github as number) ?? 0;
      if (newGithubXp > prevGithubXp) {
        const diff = newGithubXp - prevGithubXp;
        await sb.rpc("grant_xp", { p_developer_id: devId, p_source: "github", p_amount: diff });
        await sb.from("developers").update({ xp_github: newGithubXp }).eq("id", devId);
      }
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

    const { data: withRank } = await sb
      .from("developers")
      .select("*")
      .eq("github_login", record.github_login)
      .single();

    revalidatePath(`/dev/${record.github_login}`);

    return NextResponse.json({ ...(withRank ?? upserted), exists: true }, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (err) {
    console.error("Dev route error:", err);

    if (cached) {
      return NextResponse.json(
        { ...cached, _stale: true, exists: true },
        {
          headers: {
            "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
          },
        },
      );
    }

    const isTimeout = err instanceof DOMException && err.name === "TimeoutError";
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
