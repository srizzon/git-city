import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import LeaderboardTracker from "@/components/LeaderboardTracker";
import LeaderboardYouBadge, { LeaderboardAuthProvider } from "@/components/LeaderboardYouBadge";
import LeaderboardUserPosition from "@/components/LeaderboardUserPosition";
import LeaderboardYouVsNext from "@/components/LeaderboardYouVsNext";

export const revalidate = 300; // ISR: regenerate every 5 min

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
  created_at?: string;
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
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const activeTab = (params.tab ?? "contributors") as TabId;

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
    // DB-side aggregation: get top 50 devs by achievement count
    const { data: topAchievers } = await supabase
      .rpc("top_achievers", { lim: 50 });

    const achieverIds = (topAchievers ?? []).map((a: { developer_id: number }) => a.developer_id);
    const achCountMap: Record<number, number> = {};
    for (const a of topAchievers ?? []) {
      achCountMap[a.developer_id] = a.ach_count;
    }

    // Fetch dev details only for the top achievers
    const { data: achieverDevs } = achieverIds.length > 0
      ? await supabase
        .from("developers")
        .select("id, github_login, name, avatar_url, contributions, contributions_total, total_stars, public_repos, primary_language, rank, referral_count, kudos_count, created_at")
        .in("id", achieverIds)
      : { data: [] };

    // Sort by achievement count (preserving DB order)
    const sorted = (achieverDevs ?? [])
      .map((d) => ({ ...d, ach_count: achCountMap[d.id] ?? 0 }))
      .sort((a, b) => b.ach_count - a.ach_count || new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    devs = sorted as unknown as Developer[];
    for (const d of sorted) {
      achieverCounts[d.github_login] = d.ach_count;
    }
  } else {
    const { data } = await supabase
      .from("developers")
      .select("github_login, name, avatar_url, contributions, contributions_total, total_stars, public_repos, primary_language, rank, referral_count, kudos_count, created_at")
      .order(orderColumn, { ascending: orderAscending, nullsFirst: false })
      .order("created_at", { ascending: true })
      .limit(50);
    devs = (data ?? []) as Developer[];
  }

  // Check if recruiters tab should be hidden (no referral data)
  const hasRecruiters = activeTab === "recruiters"
    ? devs.some((d) => (d.referral_count ?? 0) > 0)
    : true;

  const topLogins = devs.map((d) => d.github_login.toLowerCase());

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

  // A4: Raw metric values for "You vs. Next" component
  function getMetricValueRaw(dev: Developer): number {
    switch (activeTab) {
      case "contributors": return (dev.contributions_total && dev.contributions_total > 0) ? dev.contributions_total : dev.contributions;
      case "stars": return dev.total_stars;
      case "architects": return dev.public_repos;
      case "achievers": return achieverCounts[dev.github_login] ?? 0;
      case "recruiters": return dev.referral_count ?? 0;
      default: return 0;
    }
  }

  const devMetrics = devs.map((d) => ({
    login: d.github_login.toLowerCase(),
    value: getMetricValueRaw(d),
  }));

  // A6: "NEW" detection — devs created in last 7 days
  const sevenDaysAgo = Date.now() - 7 * 86400000;
  const newLogins = new Set(
    devs
      .filter((d) => d.created_at && new Date(d.created_at).getTime() > sevenDaysAgo)
      .map((d) => d.github_login.toLowerCase())
  );

  return (
    <LeaderboardAuthProvider>
    <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
      <LeaderboardTracker tab={activeTab} />
      <div className="mx-auto max-w-3xl px-4 py-10">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="text-xs text-muted transition-colors hover:text-cream"
          >
            &larr; Back to City | 返回城市
          </Link>
        </div>

        <div className="mt-6 text-center">
          <h1 className="text-3xl text-cream md:text-4xl">
            Leader<span style={{ color: ACCENT }}>board</span>
          </h1>
          <p className="mt-3 text-xs text-muted normal-case whitespace-pre-line">
            Top developers ranked in Git City \n  Git City 开发者排行榜
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

        {/* A4: "You vs. Next" banner */}
        <LeaderboardYouVsNext metrics={devMetrics} metricLabel={metricLabel} />

        {/* Table */}
        <div className="mt-6 border-[3px] border-border">
          {/* Header row */}
          <div className="flex items-center gap-4 border-b-[3px] border-border bg-bg-card px-5 py-3 text-xs text-muted">
            <span className="w-10 text-center">#</span>
            <span className="flex-1">Developer | 开发者</span>
            <span className="hidden w-24 text-right sm:block">Language | 语言</span>
            <span className="w-28 text-right">{metricLabel}</span>
          </div>

          {/* Rows */}
          {devs.map((dev, i) => {
            const pos = i + 1;
            return (
              <Link
                key={dev.github_login}
                href={`/dev/${dev.github_login}`}
                className="flex items-center gap-4 border-b border-border/50 px-5 py-3.5 transition-colors hover:bg-bg-card"
              >
                <span className="w-10 text-center">
                  <span
                    className="text-sm font-bold"
                    style={{ color: rankColor(pos) }}
                  >
                    {pos}
                  </span>
                  {newLogins.has(dev.github_login.toLowerCase()) && (
                    <span className="block text-[7px] font-bold" style={{ color: "#ffd700" }}>
                      NEW | 新加入
                    </span>
                  )}
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
                      <LeaderboardYouBadge login={dev.github_login} />
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

          {/* "YOU" row if not in top 50 — handled client-side */}
          <LeaderboardUserPosition tab={activeTab} topLogins={topLogins} />

          {devs.length === 0 && (
            <div className="px-5 py-8 text-center text-xs text-muted normal-case whitespace-pre-line">
              No data for this category yet. \n 暂无此分类数据。
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
            Enter the City | 进入城市
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
              Sinicization Contribution by{" "}
              <a href="https://github.com/EndlessPixel"
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-cream"
                style={{ color: ACCENT }}>@EndlessPixel
              </a>
          </p>
        </div>
      </div>
    </main>
    </LeaderboardAuthProvider>
  );
}
