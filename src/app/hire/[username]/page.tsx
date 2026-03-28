import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createServerSupabase } from "@/lib/supabase-server";
import {
  tierFromLevel,
  rankFromLevel,
  levelProgress,
} from "@/lib/xp";
import {
  SENIORITY_LABELS,
  CONTRACT_LABELS,
  WEB_TYPE_LABELS,
} from "@/lib/jobs/constants";
import PortfolioProjects from "./PortfolioProjects";
import PortfolioExperiences from "./PortfolioExperiences";
import type {
  PortfolioProject,
  PortfolioExperience,
} from "@/lib/portfolio/types";

export const revalidate = 0;

interface Props {
  params: Promise<{ username: string }>;
}

/* ─── Data fetcher ─── */

const getPortfolio = cache(async (username: string) => {
  const admin = getSupabaseAdmin();

  const { data: dev } = await admin
    .from("developers")
    .select(
      "id, github_login, name, avatar_url, bio, contributions, contributions_total, public_repos, total_stars, current_streak, longest_streak, active_days_last_year, primary_language, followers, xp_level, xp_total, top_repos, created_at"
    )
    .ilike("github_login", username)
    .single();

  if (!dev) return null;

  const [profileRes, projectsRes, experiencesRes, achievementsRes] =
    await Promise.all([
      admin.from("career_profiles").select("*").eq("id", dev.id).maybeSingle(),
      admin.from("portfolio_projects").select("*").eq("developer_id", dev.id).order("sort_order").limit(6),
      admin.from("portfolio_experiences").select("*").eq("developer_id", dev.id).order("sort_order").limit(5),
      admin.from("developer_achievements").select("achievement_id, name:achievements(name), tier:achievements(tier)").eq("developer_id", dev.id),
    ]);

  const contribs = (dev.contributions_total && dev.contributions_total > 0) ? dev.contributions_total : (dev.contributions ?? 0);

  return {
    dev: { ...dev, contributions: contribs, top_repos: Array.isArray(dev.top_repos) ? dev.top_repos : [] },
    profile: profileRes.data,
    projects: (projectsRes.data ?? []) as PortfolioProject[],
    experiences: (experiencesRes.data ?? []) as PortfolioExperience[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    achievements: (achievementsRes.data ?? []).map((a: any) => ({
      achievement_id: a.achievement_id as string,
      name: (Array.isArray(a.name) ? a.name[0]?.name : a.name?.name) ?? a.achievement_id,
      tier: (Array.isArray(a.tier) ? a.tier[0]?.tier : a.tier?.tier) ?? "bronze",
    })),
  };
});

/* ─── Metadata ─── */

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const data = await getPortfolio(username);
  if (!data) return { title: "Not Found - Git City" };

  const { dev, profile } = data;
  const title = `Hire ${dev.name ?? `@${dev.github_login}`} - Git City`;
  const description = profile?.bio ?? `Developer profile for @${dev.github_login} on Git City.`;

  return {
    title,
    description,
    openGraph: { title, description, type: "profile", images: dev.avatar_url ? [dev.avatar_url] : [] },
    twitter: { card: "summary", title, description },
  };
}

/* ─── Page ─── */

export default async function PortfolioPage({ params }: Props) {
  const { username } = await params;
  const data = await getPortfolio(username);
  if (!data) notFound();

  const { dev, profile, projects, experiences, achievements } = data;

  // Owner detection
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const viewerLogin = (user?.user_metadata?.user_name ?? user?.user_metadata?.preferred_username ?? "").toLowerCase();
  const isOwner = viewerLogin === dev.github_login.toLowerCase();

  // XP
  const level = dev.xp_level ?? 1;
  const tier = tierFromLevel(level);
  const rank = rankFromLevel(level);
  const progress = levelProgress(dev.xp_total ?? 0);

  const contribs = dev.contributions;
  const stars = dev.total_stars ?? 0;
  const repos = dev.public_repos ?? 0;
  const streak = dev.current_streak ?? 0;

  // Stats worth showing
  const statParts: string[] = [];
  if (contribs > 0) statParts.push(`${contribs.toLocaleString()} contributions`);
  if (stars > 0) statParts.push(`${stars.toLocaleString()} stars`);
  if (repos > 0) statParts.push(`${repos.toLocaleString()} repos`);
  if (streak > 0) statParts.push(`${streak}-day streak`);

  return (
    <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
      <div className="mx-auto max-w-[1400px] px-4 py-8 sm:py-12">

        <Link href="/" className="mb-6 inline-block text-sm text-muted transition-colors hover:text-cream sm:mb-8">
          &larr; Back to City
        </Link>

        <div className="lg:flex lg:gap-6 lg:items-start">

          {/* ─── Left: Sticky Sidebar (Profile) ─── */}
          <div className="lg:w-[420px] lg:shrink-0 lg:sticky lg:top-6 space-y-3">

            {/* Profile card */}
            <div className="border-[3px] border-border bg-bg-raised p-6">
              <div className="flex items-start justify-between">
                {dev.avatar_url && (
                  <img src={dev.avatar_url} alt={`${dev.name ?? dev.github_login} avatar`} className="h-20 w-20 border-2 border-border" />
                )}
                {profile?.open_to_work && (
                  <span className="inline-flex items-center gap-1.5 border-2 border-[#4ade80]/30 px-2 py-0.5 text-[10px] text-[#4ade80]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#4ade80] live-dot" />
                    Hiring
                  </span>
                )}
              </div>
              <div className="mt-3">
                <h1 className="text-xl text-cream">{dev.name ?? `@${dev.github_login}`}</h1>
                <p className="mt-0.5 text-sm text-muted">@{dev.github_login}</p>
                {profile && (
                  <p className="mt-0.5 text-xs text-muted">
                    {SENIORITY_LABELS[profile.seniority] ?? profile.seniority}
                    {profile.years_experience != null && ` · ${profile.years_experience} years`}
                  </p>
                )}
              </div>

              {/* Bio - truncated */}
              {profile ? (
                <p className="mt-3 text-sm text-cream/70 normal-case leading-relaxed line-clamp-4">{profile.bio}</p>
              ) : (
                <p className="mt-3 text-sm text-muted normal-case">{dev.bio ?? "No bio yet."}</p>
              )}

              {/* Skills */}
              {profile && profile.skills.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {profile.skills.map((s: string) => (
                    <span key={s} className="border-[2px] border-[#c8e64a]/30 px-2 py-0.5 text-[10px] text-[#c8e64a]">{s}</span>
                  ))}
                </div>
              )}

              {/* Verified stats - right after skills */}
              {statParts.length > 0 && (
                <p className="mt-3 text-[10px] text-muted">
                  {statParts.join(" · ")} · <span className="text-[#4ade80]">&#10003;</span> GitHub
                </p>
              )}

              {/* Details */}
              {profile && (profile.salary_visible || profile.contract_type?.length > 0 || profile.timezone || profile.languages?.length > 0) && (
                <div className="mt-3 pt-3 border-t border-border/30 grid grid-cols-2 gap-x-4 gap-y-2">
                  {profile.salary_visible && profile.salary_min != null && (
                    <div className="col-span-2">
                      <span className="text-[10px] text-muted">Salary</span>
                      <p className="text-sm text-[#c8e64a]">
                        {profile.salary_currency} {profile.salary_min.toLocaleString()}
                        {profile.salary_max ? `\u2013${profile.salary_max.toLocaleString()}` : "+"}/mo
                      </p>
                    </div>
                  )}
                  {profile.contract_type?.length > 0 && (
                    <div>
                      <span className="text-[10px] text-muted">Contract</span>
                      <p className="text-xs text-cream">{profile.contract_type.map((c: string) => CONTRACT_LABELS[c] ?? c).join(", ")}</p>
                    </div>
                  )}
                  {profile.timezone && (
                    <div>
                      <span className="text-[10px] text-muted">Timezone</span>
                      <p className="text-xs text-cream normal-case">{profile.timezone}</p>
                    </div>
                  )}
                  {profile.languages?.length > 0 && (
                    <div>
                      <span className="text-[10px] text-muted">Languages</span>
                      <p className="text-xs text-cream normal-case">{profile.languages.join(", ")}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Links + Edit */}
            {(() => {
              const allLinks: Array<{ label: string; url: string }> = [];
              if (profile?.link_portfolio) allLinks.push({ label: "Portfolio", url: profile.link_portfolio });
              if (profile?.link_linkedin) allLinks.push({ label: "LinkedIn", url: profile.link_linkedin });
              if (profile?.link_website) allLinks.push({ label: "Website", url: profile.link_website });
              const extras = (profile as unknown as Record<string, unknown>)?.extra_links;
              if (Array.isArray(extras)) {
                for (const l of extras) {
                  if (l && typeof l === "object" && "url" in l) {
                    allLinks.push({ label: (l as { label: string }).label || "Link", url: (l as { url: string }).url });
                  }
                }
              }
              if (allLinks.length === 0 && !isOwner) return null;
              return (
                <div className="space-y-2">
                  {allLinks.length > 0 && (
                    <div className="grid grid-cols-2 gap-2">
                      {allLinks.map((link, i) => (
                        <a
                          key={i}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block border-[3px] border-[#c8e64a]/20 px-3 py-2.5 text-xs text-center text-[#c8e64a] transition-colors hover:border-[#c8e64a]/50 hover:bg-[#c8e64a]/5 cursor-pointer"
                        >
                          {link.label} &#8599;
                        </a>
                      ))}
                    </div>
                  )}
                  {isOwner && (
                    <Link href="/hire/edit" className="block w-full border-[3px] border-border px-3 py-2.5 text-xs text-center text-muted transition-colors hover:border-border-light hover:text-cream cursor-pointer">
                      Edit profile
                    </Link>
                  )}
                </div>
              );
            })()}
          </div>

          {/* ─── Right: Scrollable Content ─── */}
          <div className="flex-1 min-w-0 mt-6 lg:mt-0 space-y-4">

            {/* Projects */}
            <PortfolioProjects projects={projects} isOwner={isOwner} />

            {/* Experience */}
            <PortfolioExperiences experiences={experiences} isOwner={isOwner} />

            {/* Git City */}
            <div className="border-[3px] border-border bg-bg-raised p-6">
              <h2 className="text-xs text-muted/50 tracking-[0.15em] mb-4">Git City</h2>
              <div className="flex items-center gap-4">
                <span className="text-3xl" style={{ color: tier.color }}>Lv{level}</span>
                <div>
                  <p className="text-sm text-cream">{tier.name} · {rank.title}</p>
                  <div className="mt-1.5 h-2 w-32 bg-border/50">
                    <div className="h-full transition-all" style={{ width: `${Math.round(progress * 100)}%`, backgroundColor: tier.color }} />
                  </div>
                </div>
              </div>
              <Link href={`/dev/${dev.github_login}`} className="mt-4 inline-block text-xs text-muted transition-colors hover:text-cream cursor-pointer">
                See my building in the city &rarr;
              </Link>
            </div>

            {/* Footer */}
            <div className="pt-4 text-center">
              <p className="text-xs text-muted/30 normal-case">
                GitHub data verified · thegitcity.com/hire/{dev.github_login}
              </p>
            </div>

            <div className="h-8" />
          </div>
        </div>
      </div>
    </main>
  );
}
