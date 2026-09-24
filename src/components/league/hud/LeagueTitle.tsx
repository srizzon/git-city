"use client";

import Link from "next/link";
import type { LeaguePageData } from "@/lib/leagues/queries";
import { townDisplayName } from "@/lib/towns/names";
import { MILESTONE_LABELS } from "@/lib/towns/milestones";
import type { TownBadges } from "@/lib/towns/milestones";
import { HUD_BOX, fmt } from "./shared";

export default function LeagueTitle({
  data,
  topCompanyLastWeek,
  badges,
}: {
  data: LeaguePageData;
  topCompanyLastWeek: boolean;
  badges: TownBadges;
}) {
  const { league, counts } = data;
  return (
    <div className="pointer-events-none flex max-w-[calc(100vw-2rem)] flex-col items-start gap-2 sm:max-w-sm">
      <div className="pointer-events-auto flex gap-2 text-[10px]">
        <Link href="/" className={`${HUD_BOX} btn-press px-2.5 py-1 text-muted transition-colors hover:text-cream`}>
          &larr; City
        </Link>
        <Link href="/towns" className={`${HUD_BOX} btn-press px-2.5 py-1 text-muted transition-colors hover:text-cream`}>
          Towns
        </Link>
      </div>
      <div className={`${HUD_BOX} px-4 py-3`}>
        <div className="flex flex-wrap items-center gap-2 text-[9px]">
          <span className="text-muted">{league.kind === "company" ? `@${league.github_org}` : "Custom town"}</span>
          {league.kind === "company" && <span className="text-lime">&#10003; Verified</span>}
          {badges.townOfWeek && <span className="border-2 border-lime bg-lime px-1.5 py-0.5 text-bg">&#9733; Town of the week</span>}
          {topCompanyLastWeek && <span className="border-2 border-lime px-1.5 py-0.5 text-lime">Top company last week</span>}
        </div>
        <h1 className="mt-1.5 text-xl leading-tight text-cream normal-case sm:text-2xl">{townDisplayName(league.name)}</h1>
        <p className="mt-1.5 text-[10px] text-muted">
          {fmt(counts.total)} buildings · {fmt(counts.joined)} joined · {fmt(counts.invited)} invited
        </p>
        {badges.milestones.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5 text-[9px]">
            {badges.milestones.map((m) => (
              <span key={m} className="border-2 border-border px-1.5 py-0.5 text-cream">
                {MILESTONE_LABELS[m]}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
