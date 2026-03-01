import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getOwnedItems } from "@/lib/items";
import { TIER_COLORS } from "@/lib/achievements";
import { DISTRICT_NAMES, DISTRICT_COLORS } from "@/lib/github";
import { ITEM_NAMES } from "@/lib/zones";
import ClaimButton from "@/components/ClaimButton";
import ShareButtons from "@/components/ShareButtons";
import CompareChallenge from "@/components/CompareChallenge";
import ReferralCTA from "@/components/ReferralCTA";
import ProfileTracker from "@/components/ProfileTracker";

export const revalidate = 3600; // ISR: regenerate every 1 hour

interface Props {
  params: Promise<{ username: string }>;
}

const getDeveloper = cache(async (username: string) => {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("developers")
    .select("*")
    .eq("github_login", username.toLowerCase())
    .single();
  return data;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const dev = await getDeveloper(username);

  if (!dev) {
    return { title: "Developer Not Found | 开发者未找到 - Git City" };
  }

  const contribs = (dev.contributions_total && dev.contributions_total > 0) ? dev.contributions_total : dev.contributions;
  const title = `@${dev.github_login} - Git City | ${contribs.toLocaleString()} contributions`;
  const description = `See @${dev.github_login}'s building in Git City. ${contribs.toLocaleString()} contributions, ${dev.public_repos.toLocaleString()} repos, ${dev.total_stars.toLocaleString()} stars. Rank #${dev.rank ?? "?"} in the city.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
    },
    twitter: {
      card: "summary_large_image",
      creator: "@samuelrizzondev",
      site: "@samuelrizzondev",
    },
  };
}

interface AchievementRow {
  achievement_id: string;
  name: string;
  tier: string;
}

export default async function DevPage({ params }: Props) {
  const { username } = await params;
  const dev = await getDeveloper(username);

  if (!dev) notFound();

  const accent = "#c8e64a";
  const shadow = "#5a7a00";
  const ownedItems = await getOwnedItems(dev.id);

  // Fetch achievements with name+tier from DB (no hardcoded maps)
  const sb = getSupabaseAdmin();
  const { data: devAchievements } = await sb
    .from("developer_achievements")
    .select("achievement_id, achievements(name, tier)")
    .eq("developer_id", dev.id);
  const achievements: AchievementRow[] = (devAchievements ?? []).map((a: Record<string, unknown>) => ({
    achievement_id: a.achievement_id as string,
    name: (a.achievements as Record<string, unknown>)?.name as string ?? (a.achievement_id as string),
    tier: (a.achievements as Record<string, unknown>)?.tier as string ?? "bronze",
  }));

  // Fetch referred developers (who this dev brought to the city)
  const { data: referredDevs } = await sb
    .from("developers")
    .select("github_login, avatar_url")
    .eq("referred_by", dev.github_login)
    .order("claimed_at", { ascending: false })
    .limit(20);

  // Check if the logged-in user owns this building
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const authLogin = (
    user?.user_metadata?.user_name ??
    user?.user_metadata?.preferred_username ??
    ""
  ).toLowerCase();
  const isOwner = !!user && authLogin === dev.github_login.toLowerCase() && dev.claimed;

  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ??
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");

  const profileJsonLd = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    mainEntity: {
      "@type": "Person",
      name: dev.name ?? dev.github_login,
      alternateName: dev.github_login,
      image: dev.avatar_url,
      url: `${baseUrl}/dev/${dev.github_login}`,
      sameAs: `https://github.com/${dev.github_login}`,
    },
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Git City", item: baseUrl },
      {
        "@type": "ListItem",
        position: 2,
        name: `@${dev.github_login}`,
        item: `${baseUrl}/dev/${dev.github_login}`,
      },
    ],
  };

  return (
    <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
      <ProfileTracker login={dev.github_login} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(profileJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <div className="mx-auto max-w-2xl px-3 py-6 sm:px-4 sm:py-10">
        {/* Header */}
        <Link
          href="/"
          className="mb-6 inline-block text-sm text-muted transition-colors hover:text-cream sm:mb-8"
        >
          &larr; Back to City | 返回城市
        </Link>

        {/* Profile Card */}
        <div className="border-[3px] border-border bg-bg-raised p-4 sm:p-8">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-6">
            {/* Avatar */}
            {dev.avatar_url && (
              <Image
                src={dev.avatar_url}
                alt={dev.github_login}
                width={100}
                height={100}
                className="border-[3px] border-border flex-shrink-0"
                style={{ imageRendering: "pixelated" }}
              />
            )}

            <div className="flex-1 text-center sm:text-left">
              {dev.name && (
                <h1 className="text-xl text-cream sm:text-2xl">{dev.name}</h1>
              )}
              <p className="mt-1 text-sm text-muted">@{dev.github_login}</p>

              {/* Rank Badge */}
              {dev.rank && (
                <div className="mt-3 inline-block border-[2px] px-3 py-1 text-sm" style={{ borderColor: accent, color: accent }}>
                  #{dev.rank} in the city | 城市排名 #{dev.rank}
                </div>
              )}

              {/* District badge */}
              {dev.district && (
                <div className="mt-2 flex items-center gap-2">
                  <span
                    className="px-2 py-0.5 text-[10px] text-bg"
                    style={{ backgroundColor: DISTRICT_COLORS[dev.district] ?? '#888' }}
                  >
                    {DISTRICT_NAMES[dev.district] ?? dev.district}
                  </span>
                  {dev.district_rank && (
                    <span className="text-[10px] text-muted">
                      {dev.district_rank === 1 ? 'Mayor' : `#${dev.district_rank}`} in {DISTRICT_NAMES[dev.district]}
                    </span>
                  )}
                </div>
              )}

              {/* Claim */}
              <div className="mt-3">
                <ClaimButton githubLogin={dev.github_login} claimed={dev.claimed ?? false} />
              </div>
            </div>
          </div>

          {/* Bio */}
          {dev.bio && (
            <p className="mt-5 text-sm leading-relaxed text-muted normal-case">
              {dev.bio}
            </p>
          )}
        </div>

        {/* View in City (prominent) */}
        <div className="mt-5">
          <Link
            href={`/?user=${dev.github_login}`}
            className="btn-press flex w-full items-center justify-center gap-2 px-6 py-3.5 text-sm text-bg"
            style={{
              backgroundColor: accent,
              boxShadow: `4px 4px 0 0 ${shadow}`,
            }}
          >
            View in City | 在城市查看
          </Link>
        </div>

        {/* Customize Building — only for the logged-in owner */}
        {isOwner && (
          <div className="mt-3">
            <Link
              href={`/shop/${dev.github_login}`}
              className="btn-press flex w-full items-center justify-center gap-2 border-[3px] border-border px-6 py-3 text-sm text-cream transition-colors hover:border-border-light"
            >
              Customize Building | 自定义建筑
            </Link>
          </div>
        )}

        {/* Share + Compare */}
        <div className="mt-5 space-y-3">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <ShareButtons
              login={dev.github_login}
              contributions={(dev.contributions_total && dev.contributions_total > 0) ? dev.contributions_total : dev.contributions}
              rank={dev.rank}
              accent={accent}
              shadow={shadow}
            />
          </div>
          <CompareChallenge login={dev.github_login} accent={accent} shadow={shadow} />
        </div>

        {/* Stats Grid */}
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {[
            { label: "Contributions", value: ((dev.contributions_total && dev.contributions_total > 0) ? dev.contributions_total : dev.contributions).toLocaleString() },
            { label: "Repos", value: dev.public_repos.toLocaleString() },
            { label: "Stars", value: dev.total_stars.toLocaleString() },
            { label: "Kudos", value: (dev.kudos_count ?? 0).toLocaleString() },
            { label: "Visits", value: (dev.visit_count ?? 0).toLocaleString() },
            { label: "Referrals", value: (dev.referral_count ?? 0).toLocaleString() },
          ].map((stat) => (
            <div
              key={stat.label}
              className="border-[3px] border-border bg-bg-card p-4 text-center"
            >
              <div className="text-xl" style={{ color: accent }}>
                {stat.value}
              </div>
              <div className="mt-2 text-xs text-muted">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Achievements */}
        {achievements.length > 0 && (
          <div className="mt-5">
            <h2 className="mb-3 text-sm text-cream">
              Achievements | 成就
              <span className="ml-2 text-[10px] text-muted">{achievements.length}</span>
            </h2>
            <div className="flex flex-wrap gap-2">
              {achievements
                .sort((a, b) => {
                  const tierOrder = ["diamond", "gold", "silver", "bronze"];
                  return tierOrder.indexOf(a.tier) - tierOrder.indexOf(b.tier);
                })
                .map((ach) => {
                  const color = TIER_COLORS[ach.tier] ?? accent;
                  return (
                    <span
                      key={ach.achievement_id}
                      className="border-[2px] px-3 py-1 text-[10px]"
                      style={{ borderColor: color, color }}
                    >
                      {ach.name}
                    </span>
                  );
                })}
            </div>
          </div>
        )}

        {/* Owned Items */}
        {ownedItems.length > 0 && (
          <div className="mt-5">
            <h2 className="mb-3 text-sm text-cream">Building Items | 建筑项目</h2>
            <div className="flex flex-wrap gap-2">
              {ownedItems.map((itemId) => (
                <span
                  key={itemId}
                  className="border-[2px] px-3 py-1 text-[10px]"
                  style={{ borderColor: accent, color: accent }}
                >
                  {ITEM_NAMES[itemId] ?? itemId}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Referral CTA — only for the logged-in owner */}
        {isOwner && (
          <div className="mt-5">
            <ReferralCTA login={dev.github_login} accent={accent} />
          </div>
        )}

        {/* Referred Developers */}
        {referredDevs && referredDevs.length > 0 && (
          <div className="mt-5">
            <h2 className="mb-3 text-sm text-cream">
              Invited Devs | 邀请的开发者
              <span className="ml-2 text-[10px] text-muted">{dev.referral_count ?? referredDevs.length}</span>
            </h2>
            <div className="flex flex-wrap gap-2">
              {referredDevs.map((rd) => (
                <Link
                  key={rd.github_login}
                  href={`/dev/${rd.github_login}`}
                  className="flex items-center gap-2 border-[2px] border-border px-3 py-1.5 text-[10px] text-muted transition-colors hover:border-border-light hover:text-cream"
                >
                  {rd.avatar_url && (
                    <Image
                      src={rd.avatar_url}
                      alt={rd.github_login}
                      width={16}
                      height={16}
                      className="border border-border"
                      style={{ imageRendering: "pixelated" }}
                    />
                  )}
                  @{rd.github_login}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* GitHub link */}
        <div className="mt-8 text-center">
          <a
            href={`https://github.com/${dev.github_login}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted transition-colors hover:text-cream normal-case"
          >
            github.com/{dev.github_login} &rarr;
          </a>
        </div>

        {/* Creator credit */}
        <div className="mt-10 border-t border-border/50 pt-4 text-center">
          <p className="text-[9px] text-muted normal-case">
            built by{" "}
            <a
              href="https://x.com/samuelrizzondev"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-cream"
              style={{ color: accent }}
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
  );
}
