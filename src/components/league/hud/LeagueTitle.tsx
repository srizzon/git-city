"use client";

import Link from "next/link";
import type { LeaguePageData } from "@/lib/leagues/queries";
import { HUD_BOX, fmt } from "./shared";

export default function LeagueTitle({ data, topCompanyLastWeek }: { data: LeaguePageData; topCompanyLastWeek: boolean }) {
  const { league, counts } = data;
  return (
    <div className="pointer-events-none flex max-w-[calc(100vw-2rem)] flex-col items-start gap-2 sm:max-w-sm">
      <div className="pointer-events-auto flex gap-2 text-[10px]">
        <Link href="/" className={`${HUD_BOX} btn-press px-2.5 py-1 text-muted transition-colors hover:text-cream`}>
          &larr; City
        </Link>
        <Link href="/leagues" className={`${HUD_BOX} btn-press px-2.5 py-1 text-muted transition-colors hover:text-cream`}>
          Leagues
        </Link>
      </div>
      <div className={`${HUD_BOX} px-4 py-3`}>
        <div className="flex flex-wrap items-center gap-2 text-[9px]">
          <span className="text-muted">{league.kind === "company" ? `Company · @${league.github_org}` : "Custom league"}</span>
          {topCompanyLastWeek && <span className="border-2 border-lime px-1.5 py-0.5 text-lime">Top company last week</span>}
        </div>
        <h1 className="mt-1.5 text-xl leading-tight text-cream normal-case sm:text-2xl">{league.name}</h1>
        <p className="mt-1.5 text-[10px] text-muted">
          {fmt(counts.total)} buildings · {fmt(counts.joined)} joined · {fmt(counts.invited)} invited
        </p>
      </div>
    </div>
  );
}
