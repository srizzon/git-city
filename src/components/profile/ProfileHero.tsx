import Image from "next/image";
import { inferDistrict } from "@/lib/github";
import { rankFromLevel, tierFromLevel, levelProgress, xpForLevel } from "@/lib/xp";
import ClaimButton from "@/components/ClaimButton";
import ProfileDistrict from "@/components/ProfileDistrict";
import TitlePicker from "./TitlePicker";
import SocialLinksRow from "./SocialLinksRow";
import type { SocialLinks } from "@/lib/social-links";

interface DeveloperRow {
  github_login: string;
  name: string | null;
  avatar_url: string | null;
  bio: string | null;
  rank: number | null;
  claimed: boolean | null;
  district: string | null;
  district_rank: number | null;
  district_chosen: boolean | null;
  district_changes_count: number | null;
  district_changed_at: string | null;
  primary_language: string | null;
  xp_level: number | null;
  xp_total: number | null;
}

interface Props {
  dev: DeveloperRow;
  isOwner: boolean;
  equippedTitle: string;
  titlePool: string[];
  socialLinks: SocialLinks;
}

export default function ProfileHero({ dev, isOwner, equippedTitle, titlePool, socialLinks }: Props) {
  const xpLevel = dev.xp_level ?? 1;
  const xpTotal = dev.xp_total ?? 0;
  const tier = tierFromLevel(xpLevel);
  const rank = rankFromLevel(xpLevel);
  const progress = levelProgress(xpTotal);
  const xpCurrent = xpTotal - xpForLevel(xpLevel);
  const xpNeeded = xpForLevel(xpLevel + 1) - xpForLevel(xpLevel);

  return (
    <header
      className="relative border-[3px] border-border"
      style={{
        background: `linear-gradient(135deg, ${tier.color}1f 0%, ${tier.color}08 40%, var(--color-bg-raised) 100%)`,
      }}
    >
      {/* Pixel grid overlay — pure CSS, no assets */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
          backgroundSize: "8px 8px",
        }}
      />
      {/* Tier-colored baseline strip */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-[3px]"
        style={{
          background: `linear-gradient(90deg, ${tier.color} 0%, ${tier.color}00 70%)`,
        }}
      />

      {/* City rank — top right */}
      {dev.rank && (
        <div className="absolute right-4 top-4 hidden items-baseline gap-1.5 border-2 border-border-light bg-bg/50 px-2.5 py-1.5 sm:flex">
          <span className="text-[8px] text-dim">RANK</span>
          <span className="text-xs" style={{ color: tier.color }}>
            #{dev.rank.toLocaleString()}
          </span>
        </div>
      )}

      <div className="relative p-4 sm:p-7">
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start sm:gap-6">
          {/* Avatar with tier-colored pixel frame */}
          {dev.avatar_url && (
            <div
              className="shrink-0 border-[3px] p-1"
              style={{ borderColor: tier.color, backgroundColor: `${tier.color}14` }}
            >
              <Image
                src={dev.avatar_url}
                alt={dev.github_login}
                width={104}
                height={104}
                className="border-2 border-border"
                style={{ imageRendering: "pixelated" }}
              />
            </div>
          )}

          <div className="min-w-0 flex-1 text-center sm:text-left">
            <div className="flex flex-col items-center gap-1 sm:flex-row sm:items-baseline sm:gap-3">
              <h1 className="text-xl text-cream sm:text-2xl">
                {dev.name ?? `@${dev.github_login}`}
              </h1>
              <TitlePicker
                current={equippedTitle}
                pool={titlePool}
                isOwner={isOwner}
                color={tier.color}
              />
            </div>

            {/* Meta line — quiet, single visual weight */}
            <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 sm:justify-start">
              <span className="text-sm text-muted">@{dev.github_login}</span>
              {dev.rank && (
                <span className="text-[10px] text-muted sm:hidden">
                  RANK <span style={{ color: tier.color }}>#{dev.rank.toLocaleString()}</span>
                </span>
              )}
              <ClaimButton githubLogin={dev.github_login} claimed={dev.claimed ?? false} />
            </div>

            {dev.district && (
              <ProfileDistrict
                district={dev.district}
                districtRank={dev.district_rank}
                inferredDistrict={inferDistrict(dev.primary_language)}
                isOwner={isOwner}
                districtChosen={dev.district_chosen ?? false}
                districtChangesCount={dev.district_changes_count ?? 0}
                districtChangedAt={dev.district_changed_at ?? null}
              />
            )}

            {/* Bio — terminal comment style */}
            {dev.bio && (
              <p className="mx-auto mt-3 line-clamp-2 max-w-2xl text-[11px] leading-relaxed text-muted normal-case sm:mx-0">
                <span className="select-none text-dim">{"// "}</span>
                {dev.bio}
              </p>
            )}

            {/* Social links — icons only, GitHub always present */}
            <SocialLinksRow
              login={dev.github_login}
              initialLinks={socialLinks}
              isOwner={isOwner}
              color={tier.color}
            />
          </div>
        </div>

        {/* Level + XP */}
        <div className="mt-5 flex items-center gap-3 max-sm:mx-auto">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center border-2 text-lg font-bold"
            style={{ borderColor: tier.color, color: tier.color, backgroundColor: `${tier.color}10` }}
          >
            {xpLevel}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-[11px] font-bold text-cream">
                LVL {xpLevel} · {rank.title}
              </span>
              <span
                className="px-1.5 py-0.5 text-[8px] font-bold tracking-wider"
                style={{ backgroundColor: tier.color + "22", color: tier.color }}
              >
                {tier.name.toUpperCase()}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 w-full bg-border">
              <div
                className="h-full"
                style={{
                  width: `${Math.max(2, Math.round(progress * 100))}%`,
                  backgroundColor: tier.color,
                }}
              />
            </div>
            <div className="mt-1 flex justify-between text-[8px] text-dim">
              <span>
                {xpCurrent.toLocaleString()} / {xpNeeded.toLocaleString()} XP
              </span>
              <span>{xpTotal.toLocaleString()} TOTAL</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
