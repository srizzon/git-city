"use client";

import { useEffect } from "react";
import Link from "next/link";
import type { CityBuilding } from "@/lib/github";
import type { LeaguePageData } from "@/lib/leagues/queries";
import { levelProgress, rankFromLevel, tierFromLevel, xpForLevel } from "@/lib/xp";
import { Avatar, fmt } from "./shared";
import { useSheet } from "./useSheet";

// Same card as the home city's building profile (header, level, stats,
// actions), plus the dev's place in this league.

export default function BuildingCard({
  building: b,
  data,
  onClose,
}: {
  building: CityBuilding;
  data: LeaguePageData;
  onClose: () => void;
}) {
  const sheet = useSheet(onClose);
  const { close } = sheet;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  const member = data.members.find((m) => m.login.toLowerCase() === b.loginLower);
  const standing = data.week.standings.find((s) => s.login.toLowerCase() === b.loginLower);
  const level = b.xp_level ?? 1;
  const tier = tierFromLevel(level);
  const rank = rankFromLevel(level);
  const progress = levelProgress(b.xp_total ?? 0);
  const xpCurrent = (b.xp_total ?? 0) - xpForLevel(level);
  const xpNeeded = xpForLevel(level + 1) - xpForLevel(level);

  return (
    <>
      {/* Nav hints, desktop only */}
      <div className="pointer-events-none fixed bottom-6 right-6 z-30 hidden text-right text-[9px] leading-loose text-muted sm:block">
        <div>
          <span className="text-cream">Drag</span> orbit
        </div>
        <div>
          <span className="text-cream">Scroll</span> zoom
        </div>
        <div>
          <span className="text-lime">ESC</span> close
        </div>
      </div>

      <div className="pointer-events-auto fixed inset-x-0 bottom-0 z-40 sm:inset-x-auto sm:bottom-auto sm:right-5 sm:top-1/2 sm:-translate-y-1/2">
        <div
          role="dialog"
          aria-label={`@${b.login}`}
          className={`${sheet.className} relative max-h-[50vh] w-full overflow-y-auto border-t-[3px] border-border bg-bg-raised/95 font-pixel uppercase text-warm backdrop-blur-sm sm:max-h-[85vh] sm:w-[320px] sm:border-[3px]`}
        >
          <button
            type="button"
            onClick={close}
            className="absolute right-3 top-2 z-10 text-[10px] text-muted transition-colors hover:text-cream"
          >
            ESC
          </button>

          <div className="flex justify-center py-2 sm:hidden">
            <div className="h-1 w-10 rounded-full bg-border" />
          </div>

          {/* Header in the building's XP-tier color */}
          <div
            className="relative px-4 pb-3 pt-3 sm:pt-4"
            style={{ background: `linear-gradient(135deg, ${tier.color}1c 0%, ${tier.color}06 55%, transparent 100%)` }}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
                backgroundSize: "8px 8px",
              }}
            />
            <div className="relative flex items-center gap-3">
              <div className="shrink-0 border-2 p-0.5" style={{ borderColor: tier.color, backgroundColor: `${tier.color}14` }}>
                <Avatar src={b.avatar_url} size={44} faded={member?.status === "invited"} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {b.name && <p className="truncate text-sm text-cream normal-case">{b.name}</p>}
                  {b.claimed && (
                    <span className="inline-flex shrink-0 items-center gap-1 border border-border-light bg-bg/40 px-1.5 py-0.5 text-[7px] text-muted">
                      <span className="h-1 w-1 bg-lime" />
                      Claimed
                    </span>
                  )}
                </div>
                <p className="truncate text-[10px] text-muted normal-case">@{b.login}</p>
              </div>
            </div>
          </div>

          {/* Level */}
          <div className="mx-4 mb-2.5 mt-1 flex items-center gap-2.5">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center border-2 text-xs font-bold"
              style={{ borderColor: tier.color, color: tier.color, backgroundColor: `${tier.color}10` }}
            >
              {level}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1.5">
                <span className="truncate text-[10px] font-bold text-cream">
                  Lv {level} · {rank.title}
                </span>
                <span className="shrink-0 px-1 py-px text-[7px] font-bold tracking-wider" style={{ backgroundColor: tier.color + "22", color: tier.color }}>
                  {tier.name.toUpperCase()}
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full bg-border">
                <div className="h-full" style={{ width: `${Math.max(2, Math.round(progress * 100))}%`, backgroundColor: tier.color }} />
              </div>
              <div className="mt-0.5 text-[7px] text-dim">
                {fmt(xpCurrent)} / {fmt(xpNeeded)} XP
              </div>
            </div>
          </div>

          {/* This league */}
          <div className="mx-4 mb-3 flex items-center justify-between border-2 border-border px-3 py-2">
            <span className={`text-[9px] ${member?.status === "invited" ? "text-dim" : "text-cream"}`}>
              {member?.status === "invited" ? "Invited · not joined yet" : "Joined"}
            </span>
            {standing ? (
              <span className="text-[9px] text-muted">
                This week <span className="text-lime">#{standing.rank}</span> · {fmt(standing.total)}
              </span>
            ) : (
              <span className="text-[9px] text-dim">Not racing</span>
            )}
          </div>

          {/* Stats */}
          <div className="mx-4 mb-3 grid grid-cols-3 gap-px border border-border/50 bg-border/30">
            {[
              { label: "Rank", value: `#${b.rank}` },
              { label: "Contribs", value: fmt(b.contributions) },
              { label: "Repos", value: fmt(b.public_repos) },
              { label: "Stars", value: fmt(b.total_stars) },
              { label: "+1s", value: fmt(b.kudos_count ?? 0) },
              { label: "Visits", value: fmt(b.visit_count ?? 0) },
            ].map((s) => (
              <div key={s.label} className="bg-bg-card p-2 text-center">
                <div className="text-xs text-lime">{s.value}</div>
                <div className="mt-0.5 text-[8px] text-muted">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-2 p-4 pb-5 pt-0 sm:pb-4">
            <Link
              href={`/dev/${b.login}`}
              className="btn-press flex-1 bg-lime py-2 text-center text-[10px] text-bg"
              style={{ boxShadow: "2px 2px 0 0 #5a7a00" }}
            >
              View Profile
            </Link>
            <a
              href={`https://github.com/${b.login}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-press flex-1 border-2 border-border py-2 text-center text-[10px] text-cream transition-colors hover:border-border-light"
            >
              GitHub
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
