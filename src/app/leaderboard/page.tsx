import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createServerSupabase } from "@/lib/supabase-server";
import LeaderboardTracker from "@/components/LeaderboardTracker";

export const dynamic = "force-dynamic"; // needs auth session per request

export const metadata: Metadata = {
  title: "Leaderboard - Git City",
  description:
    "Top GitHub developers ranked by contributions, stars, repos, achievements, and referrals in Git City.",
};

interface Developer {
  github_login: string;
  name: string | null;
  avatar_url: string | null;
  contributions: number;
  contributions_total: number | null;
  total_stars: number;
  public_repos: number;
  primary_language: string | null;
  rank: number | null;
  referral_count: number;
  kudos_count: number;
}

type TabId = "contributors" | "stars" | "architects" | "achievers" | "recruiters";

const TABS: { id: TabId; label: string; metric: string }[] = [
  { id: "contributors", label: "Contributors", metric: "contributions" },
  { id: "stars", label: "Stars", metric: "total_stars" },
  { id: "architects", label: "Architects", metric: "public_repos" },
  { id: "achievers", label: "Achievers", metric: "achievements" },
  { id: "recruiters", label: "Recruiters", metric: "referral_count" },
];

const ACCENT = "#c8e64a";

function rankColor(rank: number): string {
  if (rank === 1) return "#ffd700";
  if (rank === 2) return "#c0c0c0";
  if (rank === 3) return "#cd7f32";
  return ACCENT;
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; user?: string }>;
}) {
  const params = await searchParams;
  const activeTab = (params.tab ?? "contributors") as TabId;

  // Auto-detect logged-in user, fallback to ?user= param
  const authSupabase = await createServerSupabase();
  const { data: { user: authUser } } = await authSupabase.auth.getUser();
  const authLogin = (
    authUser?.user_metadata?.user_name ??
    authUser?.user_metadata?.preferred_username ??
    ""
  ).toLowerCase();
  const currentUser = params.user?.toLowerCase() || authLogin || undefined;

  const supabase = getSupabaseAdmin();

  // Fetch devs sorted by the active metric
  // Contributors uses rank (based on contributions_total) for consistency
  const orderColumn = activeTab === "contributors" ? "rank"
    : activeTab === "stars" ? "total_stars"
    : activeTab === "architects" ? "public_repos"
    : activeTab === "recruiters" ? "referral_count"
    : "contributions"; // achievers handled separately
  const orderAscending = activeTab === "contributors"; // rank is ascending (1 = best)

  let devs: Developer[] = [];
  let achieverCounts: Record<string, number> = {};

  if (activeTab === "achievers") {
    // Get achievement counts
    const { data: achData } = await supabase
      .from("developer_achievements")
      .select("developer_id");

    const counts: Record<number, number> = {};
    for (const row of achData ?? []) {
      counts[row.developer_id] = (counts[row.developer_id] ?? 0) + 1;
    }

    // Get all devs and sort by achievement count, tiebreak by created_at
    const { data: allDevs } = await supabase
      .from("developers")
      .select("id, github_login, name, avatar_url, contributions, contributions_total, total_stars, public_repos, primary_language, rank, referral_count, kudos_count, created_at")
      .order("contributions", { ascending: false })
      .limit(500);

    const sorted = (allDevs ?? [])
      .map((d) => ({ ...d, ach_count: counts[d.id] ?? 0 }))
      .filter((d) => d.ach_count > 0)
      .sort((a, b) => b.ach_count - a.ach_count || new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .slice(0, 50);

    devs = sorted as unknown as Developer[];
    for (const d of sorted) {
      achieverCounts[d.github_login] = d.ach_count;
    }
  } else {
    const { data } = await supabase
      .from("developers")
      .select("github_login, name, avatar_url, contributions, contributions_total, total_stars, public_repos, primary_language, rank, referral_count, kudos_count")
      .order(orderColumn, { ascending: orderAscending, nullsFirst: false })
      .order("created_at", { ascending: true })
      .limit(50);
    devs = (data ?? []) as Developer[];
  }

  // Check if recruiters tab should be hidden (no referral data)
  const hasRecruiters = activeTab === "recruiters"
    ? devs.some((d) => (d.referral_count ?? 0) > 0)
    : true;

  // Find current user position
  let userRow: Developer | null = null;
  let userPosition: number | null = null;
  if (currentUser) {
    const userInList = devs.findIndex(
      (d) => d.github_login.toLowerCase() === currentUser
    );
    if (userInList >= 0) {
      userRow = devs[userInList];
      userPosition = userInList + 1;
    } else {
      // Fetch user outside top 50
      const { data: userData } = await supabase
        .from("developers")
        .select("github_login, name, avatar_url, contributions, contributions_total, total_stars, public_repos, primary_language, rank, referral_count, kudos_count")
        .eq("github_login", currentUser)
        .single();
      if (userData) {
        userRow = userData as Developer;
        if (activeTab === "achievers") {
          // Count how many devs have more achievements
          const userAchCount = achieverCounts[userData.github_login] ?? 0;
          let pos = 1;
          for (const [, count] of Object.entries(achieverCounts)) {
            if (count > userAchCount) pos++;
          }
          userPosition = pos;
          if (!achieverCounts[userData.github_login]) {
            // User has 0 achievements — fetch their count
            const { count: achCount } = await supabase
              .from("developer_achievements")
              .select("id", { count: "exact", head: true })
              .eq("developer_id", (userData as Record<string, unknown>).id);
            achieverCounts[userData.github_login] = achCount ?? 0;
          }
        } else if (activeTab === "contributors") {
          // Contributors tab uses rank directly
          userPosition = (userData as Record<string, unknown>).rank as number ?? null;
        } else {
          // Calculate position via count of devs with higher metric
          const metricValue = activeTab === "stars" ? userData.total_stars
            : activeTab === "architects" ? userData.public_repos
            : activeTab === "recruiters" ? ((userData as Record<string, unknown>).referral_count as number ?? 0)
            : 0;
          const { count } = await supabase
            .from("developers")
            .select("id", { count: "exact", head: true })
            .gt(orderColumn, metricValue);
          userPosition = (count ?? 0) + 1;
        }
      }
    }
  }

  function getMetricValue(dev: Developer): string {
    switch (activeTab) {
      case "contributors": return ((dev.contributions_total && dev.contributions_total > 0) ? dev.contributions_total : dev.contributions).toLocaleString();
      case "stars": return dev.total_stars.toLocaleString();
      case "architects": return dev.public_repos.toLocaleString();
      case "achievers": return String(achieverCounts[dev.github_login] ?? 0);
      case "recruiters": return (dev.referral_count ?? 0).toLocaleString();
      default: return "";
    }
  }

  const metricLabel = activeTab === "contributors" ? "Contributions"
    : activeTab === "stars" ? "Stars"
    : activeTab === "architects" ? "Repos"
    : activeTab === "achievers" ? "Achievements"
    : "Referrals";

  return (
    <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
      <LeaderboardTracker tab={activeTab} />
      <div className="mx-auto max-w-3xl px-4 py-10">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="text-xs text-muted transition-colors hover:text-cream"
          >
            &larr; Back to City
          </Link>
        </div>

        <div className="mt-6 text-center">
          <h1 className="text-3xl text-cream md:text-4xl">
            Leader<span style={{ color: ACCENT }}>board</span>
          </h1>
          <p className="mt-3 text-xs text-muted normal-case">
            Top developers ranked in Git City
          </p>
        </div>

        {/* Tabs */}
        <div className="mt-6 flex flex-wrap justify-center gap-1">
          {TABS.filter((t) => t.id !== "recruiters" || hasRecruiters).map((tab) => (
            <Link
              key={tab.id}
              href={`/leaderboard?tab=${tab.id}`}
              className="px-3 py-1.5 text-[10px] transition-colors border-[2px]"
              style={{
                borderColor: activeTab === tab.id ? ACCENT : "var(--color-border)",
                color: activeTab === tab.id ? ACCENT : "var(--color-muted)",
                backgroundColor: activeTab === tab.id ? "rgba(200, 230, 74, 0.1)" : "transparent",
              }}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        {/* Table */}
        <div className="mt-6 border-[3px] border-border">
          {/* Header row */}
          <div className="flex items-center gap-4 border-b-[3px] border-border bg-bg-card px-5 py-3 text-xs text-muted">
            <span className="w-10 text-center">#</span>
            <span className="flex-1">Developer</span>
            <span className="hidden w-24 text-right sm:block">Language</span>
            <span className="w-28 text-right">{metricLabel}</span>
          </div>

          {/* Rows */}
          {devs.map((dev, i) => {
            const pos = i + 1;
            const isCurrentUser = currentUser && dev.github_login.toLowerCase() === currentUser;
            return (
              <Link
                key={dev.github_login}
                href={`/dev/${dev.github_login}`}
                className="flex items-center gap-4 border-b border-border/50 px-5 py-3.5 transition-colors hover:bg-bg-card"
                style={isCurrentUser ? { backgroundColor: "rgba(200, 230, 74, 0.08)" } : undefined}
              >
                <span
                  className="w-10 text-center text-sm font-bold"
                  style={{ color: rankColor(pos) }}
                >
                  {pos}
                </span>

                <div className="flex flex-1 items-center gap-3 overflow-hidden">
                  {dev.avatar_url && (
                    <Image
                      src={dev.avatar_url}
                      alt={dev.github_login}
                      width={36}
                      height={36}
                      className="border-[2px] border-border"
                      style={{ imageRendering: "pixelated" }}
                    />
                  )}
                  <div className="overflow-hidden">
                    <p className="truncate text-sm text-cream">
                      {dev.name ?? dev.github_login}
                      {isCurrentUser && (
                        <span className="ml-2 text-[10px]" style={{ color: ACCENT }}>
                          YOU
                        </span>
                      )}
                    </p>
                    {dev.name && (
                      <p className="truncate text-[10px] text-muted">
                        @{dev.github_login}
                      </p>
                    )}
                  </div>
                </div>

                <span className="hidden w-24 text-right text-xs text-muted sm:block">
                  {dev.primary_language ?? "\u2014"}
                </span>

                <span className="w-28 text-right text-sm" style={{ color: ACCENT }}>
                  {getMetricValue(dev)}
                </span>
              </Link>
            );
          })}

          {/* "YOU" row if not in top 50 */}
          {userRow && userPosition && userPosition > 50 && (
            <>
              <div className="px-5 py-1 text-center text-[9px] text-dim">
                \u22EE
              </div>
              <Link
                href={`/dev/${userRow.github_login}`}
                className="flex items-center gap-4 border-t border-border/50 px-5 py-3.5 hover:bg-bg-card"
                style={{ backgroundColor: "rgba(200, 230, 74, 0.08)" }}
              >
                <span className="w-10 text-center text-sm font-bold" style={{ color: ACCENT }}>
                  {userPosition}
                </span>
                <div className="flex flex-1 items-center gap-3 overflow-hidden">
                  {userRow.avatar_url && (
                    <Image
                      src={userRow.avatar_url}
                      alt={userRow.github_login}
                      width={36}
                      height={36}
                      className="border-[2px] border-border"
                      style={{ imageRendering: "pixelated" }}
                    />
                  )}
                  <div className="overflow-hidden">
                    <p className="truncate text-sm text-cream">
                      {userRow.name ?? userRow.github_login}
                      <span className="ml-2 text-[10px]" style={{ color: ACCENT }}>YOU</span>
                    </p>
                  </div>
                </div>
                <span className="w-28 text-right text-sm" style={{ color: ACCENT }}>
                  {getMetricValue(userRow)}
                </span>
              </Link>
            </>
          )}

          {devs.length === 0 && (
            <div className="px-5 py-8 text-center text-xs text-muted normal-case">
              No data for this category yet.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <Link
            href="/"
            className="btn-press inline-block px-7 py-3.5 text-sm text-bg"
            style={{
              backgroundColor: ACCENT,
              boxShadow: "4px 4px 0 0 #5a7a00",
            }}
          >
            Enter the City
          </Link>

          <p className="mt-6 text-[9px] text-muted normal-case">
            built by{" "}
            <a
              href="https://x.com/samuelrizzondev"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-cream"
              style={{ color: ACCENT }}
            >
              @samuelrizzondev
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}
