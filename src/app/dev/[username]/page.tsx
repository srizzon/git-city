import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  buildTitlePool,
  resolveTitle,
  type ProfileShowcaseConfig,
  type ShowcaseAchievement,
} from "@/lib/profile-showcase";
import DeleteAccountButton from "@/components/DeleteAccountButton";
import ReferralCTA from "@/components/ReferralCTA";
import ProfileTracker from "@/components/ProfileTracker";
import ProfileHero from "@/components/profile/ProfileHero";
import { sanitizeSocialLinks } from "@/lib/social-links";
import TrophyCase from "@/components/profile/TrophyCase";
import ProfileStats from "@/components/profile/ProfileStats";
import ProfileActions from "@/components/profile/ProfileActions";

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
    return { title: "Developer Not Found - Git City" };
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

export default async function DevPage({ params }: Props) {
  const { username } = await params;
  const dev = await getDeveloper(username);

  if (!dev) notFound();

  const accent = "#c8e64a";
  const shadow = "#5a7a00";

  // Fetch earned emblems (the Trophy Case source) + their catalog metadata.
  // The grant's `tier` is the evolved tier (after milestones); name/glyph/etc
  // come from the catalog. emblem ids == old achievement ids, so saved pins/titles
  // keep resolving.
  const sb = getSupabaseAdmin();
  const [{ data: devEmblems }, { data: profileRow }, { data: socialRow }] = await Promise.all([
    sb
      .from("emblem_grants")
      .select("emblem_id, count, tier, first_earned_at, emblems(name, description, glyph, is_counter, tier)")
      .eq("developer_id", dev.id),
    sb
      .from("developer_customizations")
      .select("config")
      .eq("developer_id", dev.id)
      .eq("item_id", "profile")
      .maybeSingle(),
    sb
      .from("developer_customizations")
      .select("config")
      .eq("developer_id", dev.id)
      .eq("item_id", "social_links")
      .maybeSingle(),
  ]);
  const socialLinks = sanitizeSocialLinks(socialRow?.config);
  const achievements: ShowcaseAchievement[] = (devEmblems ?? []).map(
    (row: Record<string, unknown>) => {
      const meta = row.emblems as Record<string, unknown> | null;
      return {
        achievement_id: row.emblem_id as string,
        name: (meta?.name as string) ?? (row.emblem_id as string),
        tier: (row.tier as string) ?? (meta?.tier as string) ?? "bronze",
        description: (meta?.description as string) ?? null,
        unlocked_at: (row.first_earned_at as string) ?? null,
        glyph: (meta?.glyph as string) ?? null,
        count: (row.count as number) ?? 1,
        is_counter: (meta?.is_counter as boolean) ?? false,
      };
    }
  );

  // Showcase curation (item_id = "profile" row; separate from "loadout")
  const showcase = (profileRow?.config ?? {}) as ProfileShowcaseConfig;
  const xpLevel = dev.xp_level ?? 1;
  const equippedTitle = resolveTitle(showcase.equipped_title, xpLevel, achievements);
  const titlePool = buildTitlePool(xpLevel, achievements);
  const ownedIds = new Set(achievements.map((a) => a.achievement_id));
  const pinnedIds = (showcase.featured_achievements ?? []).filter((id) =>
    ownedIds.has(id)
  );

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

  // Fire-and-forget: earn PX for visiting another dev's profile
  if (user && authLogin && !isOwner) {
    const sb = getSupabaseAdmin();
    sb.from("developers")
      .select("id")
      .eq("github_login", authLogin)
      .single()
      .then(({ data: viewer }) => {
        if (viewer) {
          import("@/lib/pixels").then(({ earnPixels }) => {
            const today = new Date().toISOString().slice(0, 10);
            earnPixels(viewer.id, "visit_city", dev.id.toString(), `visit:${today}:${viewer.id}`);
          }).catch(() => {});
        }
      });
  }

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
      sameAs: [`https://github.com/${dev.github_login}`, ...Object.values(socialLinks)],
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

  const contributions =
    (dev.contributions_total && dev.contributions_total > 0)
      ? dev.contributions_total
      : dev.contributions;

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
      <div className="mx-auto max-w-5xl px-3 py-6 sm:px-4 sm:py-10">
        {/* Header */}
        <Link
          href="/"
          className="mb-6 inline-block text-sm text-muted transition-colors hover:text-cream sm:mb-8"
        >
          &larr; Back to City
        </Link>

        {/* Hero banner */}
        <ProfileHero
          dev={dev}
          isOwner={isOwner}
          equippedTitle={equippedTitle}
          titlePool={titlePool}
          socialLinks={socialLinks}
        />

        {/* Trophy case (hero content) + side rail.
            Mobile DOM order: actions → trophy case → stats.
            Desktop: trophy case spans cols 1-2; rail = stats over actions in col 3. */}
        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3 lg:grid-rows-[auto_auto_1fr] lg:items-start">
          <div className="lg:col-start-3 lg:row-start-2">
            <ProfileActions
              login={dev.github_login}
              isOwner={isOwner}
              contributions={contributions}
              rank={dev.rank}
              accent={accent}
              shadow={shadow}
            />
          </div>
          <div className="lg:col-start-1 lg:col-span-2 lg:row-start-1 lg:row-span-3">
            <TrophyCase
              achievements={achievements}
              pinnedIds={pinnedIds}
              isOwner={isOwner}
            />
          </div>
          <div className="lg:col-start-3 lg:row-start-1">
            <ProfileStats
              contributions={contributions}
              repos={dev.public_repos}
              stars={dev.total_stars}
              kudos={dev.kudos_count ?? 0}
              visits={dev.visit_count ?? 0}
              referrals={dev.referral_count ?? 0}
              accent={accent}
            />
          </div>
        </div>

        {/* Social — invite + invited devs */}
        {(isOwner || (referredDevs?.length ?? 0) > 0) && (
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            {isOwner && (
              <div className={referredDevs?.length ? "" : "md:col-span-2"}>
                <ReferralCTA login={dev.github_login} accent={accent} />
              </div>
            )}
            {referredDevs && referredDevs.length > 0 && (
              <section
                className={`border-[3px] border-border bg-bg-raised p-4 sm:p-6 ${
                  isOwner ? "" : "md:col-span-2"
                }`}
              >
                <h2 className="text-sm text-cream">
                  Invited Devs
                  <span className="ml-2 text-[10px] text-dim">
                    {dev.referral_count ?? referredDevs.length}
                  </span>
                </h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {referredDevs.map((rd) => (
                    <Link
                      key={rd.github_login}
                      href={`/dev/${rd.github_login}`}
                      className="flex items-center gap-2 border-2 border-border px-2.5 py-1.5 text-[10px] text-muted transition-colors hover:border-border-light hover:text-cream"
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
              </section>
            )}
          </div>
        )}

        {/* Footer */}
        <footer className="mt-10 border-t-2 border-border/60 pt-5">
          <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
            <a
              href={`https://github.com/${dev.github_login}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 border-2 border-border px-3 py-1.5 text-[9px] text-muted transition-colors hover:border-border-light hover:text-cream normal-case"
            >
              github.com/{dev.github_login} &rarr;
            </a>
            <p className="text-[9px] text-dim normal-case">
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
            </p>
          </div>

          {/* Danger zone — subdued, owner only */}
          {isOwner && (
            <div className="mt-6 flex flex-col gap-3 border-t border-border/40 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[9px] text-dim normal-case">
                <span className="text-red-400/80 uppercase">Danger zone</span>
                {" — "}permanently delete your account, your building, and all associated data.
              </p>
              <DeleteAccountButton />
            </div>
          )}
        </footer>
      </div>
    </main>
  );
}
