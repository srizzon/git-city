import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { SENIORITY_LABELS, WEB_TYPE_LABELS, CONTRACT_LABELS } from "@/lib/jobs/constants";
import { rankFromLevel, tierFromLevel } from "@/lib/xp";

export const revalidate = 3600;

interface Props {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ saved?: string; first?: string }>;
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

const getCareerProfile = cache(async (developerId: number) => {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("career_profiles")
    .select("*")
    .eq("id", developerId)
    .maybeSingle();
  return data;
});

const getAchievements = cache(async (developerId: number) => {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("developer_achievements")
    .select("achievement_id, name, tier")
    .eq("developer_id", developerId);
  return data ?? [];
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const dev = await getDeveloper(username);

  if (!dev) {
    return { title: "Developer Not Found - Git City" };
  }

  return {
    title: `@${dev.github_login} Career Profile - Git City Jobs`,
    description: `Career profile for @${dev.github_login} on Git City. Real devs. Real jobs.`,
  };
}

function daysAgo(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

export default async function CareerPage({ params, searchParams }: Props) {
  const { username } = await params;
  const { saved, first } = await searchParams;
  const dev = await getDeveloper(username);
  if (!dev) notFound();

  const profile = await getCareerProfile(dev.id);
  if (!profile) notFound();

  const achievements = await getAchievements(dev.id);
  const contribs = (dev.contributions_total && dev.contributions_total > 0) ? dev.contributions_total : (dev.contributions ?? 0);
  const level = dev.xp_level ?? 1;
  const staleDays = daysAgo(profile.updated_at);

  return (
    <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        {/* Back link */}
        <Link
          href={`/dev/${dev.github_login}`}
          className="text-sm text-muted transition-colors hover:text-cream"
        >
          &lt; Back to building
        </Link>

        {/* Success banner */}
        {saved && (
          <div className="mt-6 border-[3px] border-lime/30 bg-lime/5 p-5 text-center space-y-2">
            <p className="text-sm text-lime">
              {first ? "Career Profile created! +500 XP" : "Profile updated!"}
            </p>
            <p className="text-xs text-muted normal-case">
              This is what companies see when you apply.
            </p>
            <div className="flex justify-center gap-4 pt-1">
              <Link href="/jobs" className="text-xs text-lime transition-colors hover:text-cream">
                Browse Jobs
              </Link>
              <Link href="/jobs/career-profile" className="text-xs text-muted transition-colors hover:text-cream">
                Edit Profile
              </Link>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="mt-6 text-center">
          <h1 className="text-2xl text-lime sm:text-3xl">
            @{dev.github_login}
          </h1>
          <p className="mt-2 text-sm text-muted">Career Profile</p>
          {staleDays >= 90 && (
            <p className="mt-3 border-[3px] border-yellow-500/40 bg-yellow-500/5 px-4 py-2 text-xs text-yellow-500 inline-block">
              Last updated {staleDays} days ago
            </p>
          )}
        </div>

        {/* Verified Data */}
        <div className="mt-8 border-[3px] border-border bg-bg-raised p-5 sm:p-8">
          <h2 className="text-sm text-dim tracking-widest">
            Verified
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div>
              <span className="text-xs text-muted">Contributions</span>
              <p className="mt-1 text-base text-cream">{contribs.toLocaleString()}</p>
            </div>
            <div>
              <span className="text-xs text-muted">Stars</span>
              <p className="mt-1 text-base text-cream">{(dev.total_stars ?? 0).toLocaleString()}</p>
            </div>
            <div>
              <span className="text-xs text-muted">Public Repos</span>
              <p className="mt-1 text-base text-cream">{(dev.public_repos ?? 0).toLocaleString()}</p>
            </div>
            <div>
              <span className="text-xs text-muted">Level</span>
              <p className="mt-1 text-base text-cream">
                {level} · {tierFromLevel(level).name} {rankFromLevel(level).title}
              </p>
            </div>
            <div>
              <span className="text-xs text-muted">Streak</span>
              <p className="mt-1 text-base text-cream">{dev.current_streak ?? 0} days</p>
            </div>
            <div>
              <span className="text-xs text-muted">Member Since</span>
              <p className="mt-1 text-base text-cream normal-case">
                {new Date(dev.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  year: "numeric",
                })}
              </p>
            </div>
          </div>

          {achievements.length > 0 && (
            <div className="mt-5">
              <span className="text-xs text-muted">Achievements</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {achievements.map((a: { achievement_id: string; name: string; tier: string }) => (
                  <span
                    key={a.achievement_id}
                    className="border-[3px] border-border px-3 py-1 text-xs text-cream-dark"
                  >
                    {a.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Declared Data */}
        <div className="mt-3 border-[3px] border-border bg-bg-raised p-5 sm:p-8">
          <h2 className="text-sm text-dim tracking-widest">
            Profile
          </h2>

          <p className="mt-4 text-sm text-cream-dark normal-case leading-relaxed">
            {profile.bio}
          </p>

          <div className="mt-5 grid grid-cols-2 gap-4">
            <div>
              <span className="text-xs text-muted">Seniority</span>
              <p className="mt-1 text-sm text-cream">{SENIORITY_LABELS[profile.seniority] ?? profile.seniority}</p>
            </div>
            {profile.years_experience != null && (
              <div>
                <span className="text-xs text-muted">Experience</span>
                <p className="mt-1 text-sm text-cream">{profile.years_experience} years</p>
              </div>
            )}
            <div>
              <span className="text-xs text-muted">Focus</span>
              <p className="mt-1 text-sm text-cream">{WEB_TYPE_LABELS[profile.web_type] ?? profile.web_type}</p>
            </div>
            {profile.contract_type?.length > 0 && (
              <div>
                <span className="text-xs text-muted">Contract</span>
                <p className="mt-1 text-sm text-cream">
                  {profile.contract_type.map((c: string) => CONTRACT_LABELS[c] ?? c).join(", ")}
                </p>
              </div>
            )}
            {profile.salary_visible && profile.salary_min != null && (
              <div className="col-span-2">
                <span className="text-xs text-muted">Desired Salary</span>
                <p className="mt-1 text-base text-lime">
                  {profile.salary_currency} {profile.salary_min.toLocaleString()}
                  {profile.salary_max ? `–${profile.salary_max.toLocaleString()}` : "+"}
                </p>
              </div>
            )}
            {profile.timezone && (
              <div>
                <span className="text-xs text-muted">Timezone</span>
                <p className="mt-1 text-sm text-cream normal-case">{profile.timezone}</p>
              </div>
            )}
            {profile.languages?.length > 0 && (
              <div>
                <span className="text-xs text-muted">Languages</span>
                <p className="mt-1 text-sm text-cream normal-case">{profile.languages.join(", ")}</p>
              </div>
            )}
          </div>

          {/* Skills */}
          <div className="mt-5">
            <span className="text-xs text-muted">Skills</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {profile.skills.map((skill: string) => (
                <span
                  key={skill}
                  className="border-[3px] px-3 py-1 text-xs"
                  style={{ borderColor: "rgba(200,230,74,0.3)", color: "#c8e64a" }}
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>

          {/* Links */}
          {(profile.link_portfolio || profile.link_linkedin || profile.link_website) && (
            <div className="mt-5 flex flex-wrap gap-4 border-t border-border/50 pt-5">
              {profile.link_portfolio && (
                <a
                  href={profile.link_portfolio}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-lime transition-colors hover:text-cream"
                >
                  Portfolio
                </a>
              )}
              {profile.link_linkedin && (
                <a
                  href={profile.link_linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-lime transition-colors hover:text-cream"
                >
                  LinkedIn
                </a>
              )}
              {profile.link_website && (
                <a
                  href={profile.link_website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-lime transition-colors hover:text-cream"
                >
                  Website
                </a>
              )}
            </div>
          )}
        </div>

        {/* Footer disclaimer */}
        <p className="mt-6 text-center text-xs text-dim normal-case">
          GitHub stats reflect open-source activity, not professional capability.
        </p>

        <div className="h-12" />
      </div>
    </main>
  );
}
