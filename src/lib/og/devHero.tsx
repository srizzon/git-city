// Shared satori (next/og) building blocks for the profile OG image and the
// downloadable share card. Mirrors the visual identity of the profile hero:
// tier-colored gradient + pixel grid, level badge + XP bar, pixel chips.
//
// Satori rules: every multi-child div needs display:flex; no Tailwind here.

import type { ReactNode } from "react";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  tierFromLevel,
  rankFromLevel,
  levelProgress,
  xpForLevel,
  type XpTier,
} from "@/lib/xp";
import { resolveTitle } from "@/lib/profile-showcase";
import { DISTRICT_NAMES, DISTRICT_COLORS } from "@/lib/districts";

// ─── Palette (mirrors globals.css) ───────────────────────────
export const OG = {
  accent: "#c8e64a",
  bg: "#0d0d0f",
  raised: "#161618",
  cardBg: "#1c1c20",
  cream: "#e8dcc8",
  border: "#2a2a30",
  borderLight: "#3a3a44",
  muted: "#8c8c9c",
  dim: "#5c5c6c",
};

// ─── Data ─────────────────────────────────────────────────────
export interface CardDev {
  github_login: string;
  name: string | null;
  avatar_url: string | null;
  rank: number | null;
  contributions: number; // effective (contributions_total when available)
  public_repos: number;
  total_stars: number;
  kudos_count: number;
  xp_level: number;
  xp_total: number;
  claimed: boolean;
  district: string | null;
  title: string;
}

export interface CardAchievement {
  name: string;
  tier: string;
}

export async function loadDevForCard(
  username: string
): Promise<{ dev: CardDev; achievements: CardAchievement[] } | null> {
  // Admin client: developer_customizations is owner-read-only under RLS
  // (migration 005), and these renders are strictly server-side.
  const supabase = getSupabaseAdmin();

  const { data: row } = await supabase
    .from("developers")
    .select(
      "id, github_login, name, avatar_url, contributions, contributions_total, public_repos, total_stars, rank, kudos_count, xp_level, xp_total, claimed, district"
    )
    .eq("github_login", username.toLowerCase())
    .single();
  if (!row) return null;

  const [{ data: devAchievements }, { data: profileRow }] = await Promise.all([
    supabase
      .from("emblem_grants")
      .select("achievement_id:emblem_id, achievements:emblems(name, tier)")
      .eq("developer_id", row.id),
    supabase
      .from("developer_customizations")
      .select("config")
      .eq("developer_id", row.id)
      .eq("item_id", "profile")
      .maybeSingle(),
  ]);

  const achievements: CardAchievement[] = (devAchievements ?? []).map(
    (a: Record<string, unknown>) => {
      const meta = a.achievements as Record<string, unknown> | null;
      return {
        name: (meta?.name as string) ?? (a.achievement_id as string),
        tier: (meta?.tier as string) ?? "bronze",
      };
    }
  );

  const xpLevel = row.xp_level ?? 1;
  const equipped = (profileRow?.config as { equipped_title?: string } | null)
    ?.equipped_title;
  const title = resolveTitle(
    equipped,
    xpLevel,
    achievements.map((a) => ({
      achievement_id: a.name,
      name: a.name,
      tier: a.tier,
      description: null,
      unlocked_at: null,
    }))
  );

  const contributions =
    row.contributions_total && row.contributions_total > 0
      ? row.contributions_total
      : row.contributions;

  return {
    dev: {
      github_login: row.github_login,
      name: row.name,
      avatar_url: row.avatar_url,
      rank: row.rank,
      contributions,
      public_repos: row.public_repos,
      total_stars: row.total_stars,
      kudos_count: row.kudos_count ?? 0,
      xp_level: xpLevel,
      xp_total: row.xp_total ?? 0,
      claimed: !!row.claimed,
      district: row.district,
      title,
    },
    achievements,
  };
}

// ─── Color helpers ────────────────────────────────────────────
function rgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ─── Backdrop: tier gradient + pixel grid (the hero signature) ─
export function tierBackdrop(tierColor: string, gridSize = 16) {
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        display: "flex",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          display: "flex",
          backgroundImage: `linear-gradient(135deg, ${rgba(tierColor, 0.12)} 0%, ${rgba(tierColor, 0.03)} 40%, rgba(0,0,0,0) 100%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          display: "flex",
          backgroundImage:
            "linear-gradient(to bottom, rgba(255,255,255,0.035) 2px, rgba(255,255,255,0) 2px)",
          backgroundSize: `${gridSize}px ${gridSize}px`,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          display: "flex",
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.035) 2px, rgba(255,255,255,0) 2px)",
          backgroundSize: `${gridSize}px ${gridSize}px`,
        }}
      />
    </div>
  );
}

// ─── Building with lit windows, tinted by tier ───────────────
const WSIZE = 24;
const WGAP = 10;

export function building(opts: {
  left: number;
  groundY: number;
  height: number;
  width: number;
  color: string;
}) {
  const { left, groundY, height, width, color } = opts;
  const rowH = WSIZE + WGAP;
  const nRows = Math.max(2, Math.floor((height - 36) / rowH));
  // Window columns derived from the facade width so narrow buildings
  // don't overflow their walls.
  const cols = Math.max(2, Math.floor((width - 24 + WGAP) / (WSIZE + WGAP)));
  const rows = [];
  for (let r = 0; r < nRows; r++) {
    const cells = [];
    for (let c = 0; c < cols; c++) {
      const lit = (r * 5 + c * 3) % 7 > 1;
      cells.push(
        <div
          key={c}
          style={{
            width: WSIZE,
            height: WSIZE,
            backgroundColor: lit ? color : rgba(color, 0.09),
          }}
        />
      );
    }
    rows.push(
      <div key={r} style={{ display: "flex", gap: WGAP }}>
        {cells}
      </div>
    );
  }
  return (
    <div
      style={{
        position: "absolute",
        left,
        top: groundY - height,
        width,
        height,
        backgroundColor: OG.cardBg,
        borderTop: `6px solid ${color}`,
        borderLeft: `3px solid ${rgba(color, 0.31)}`,
        borderRight: `3px solid ${rgba(color, 0.31)}`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: 16,
        gap: WGAP,
      }}
    >
      {rows}
    </div>
  );
}

// ─── Chips ────────────────────────────────────────────────────
export function chip(text: string, color: string, fontSize = 16) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        fontSize,
        color,
        border: `3px solid ${color}`,
        padding: "4px 14px",
        textTransform: "uppercase",
      }}
    >
      {text}
    </div>
  );
}

export function claimedChip(fontSize = 15) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize,
        color: OG.muted,
        border: `2px solid ${OG.borderLight}`,
        backgroundColor: rgba(OG.bg, 0.5),
        padding: "4px 12px",
        textTransform: "uppercase",
      }}
    >
      <div style={{ display: "flex", width: 8, height: 8, backgroundColor: OG.accent }} />
      CLAIMED
    </div>
  );
}

export function districtChip(district: string, fontSize = 15) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        fontSize,
        color: OG.cream,
        border: `2px solid ${OG.borderLight}`,
        padding: "4px 12px",
        textTransform: "uppercase",
      }}
    >
      <div
        style={{
          display: "flex",
          width: 10,
          height: 10,
          backgroundColor: DISTRICT_COLORS[district] ?? "#888",
        }}
      />
      {DISTRICT_NAMES[district] ?? district}
    </div>
  );
}

// ─── Avatar with tier-colored pixel frame ────────────────────
export function tierAvatar(avatarUrl: string, tier: XpTier, size = 120) {
  return (
    <div
      style={{
        display: "flex",
        border: `5px solid ${tier.color}`,
        backgroundColor: rgba(tier.color, 0.08),
        padding: 5,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={avatarUrl}
        width={size}
        height={size}
        alt=""
        style={{ border: `3px solid ${OG.border}` }}
      />
    </div>
  );
}

// ─── Level badge + XP progress bar (hero signature block) ────
export function levelBlock(xpLevel: number, xpTotal: number, width: number) {
  const tier = tierFromLevel(xpLevel);
  const rank = rankFromLevel(xpLevel);
  const progress = levelProgress(xpTotal);
  const xpCurrent = xpTotal - xpForLevel(xpLevel);
  const xpNeeded = xpForLevel(xpLevel + 1) - xpForLevel(xpLevel);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20, width }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 68,
          height: 68,
          border: `4px solid ${tier.color}`,
          color: tier.color,
          backgroundColor: rgba(tier.color, 0.06),
          fontSize: 32,
        }}
      >
        {xpLevel}
      </div>
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span
            style={{ fontSize: 22, color: OG.cream, textTransform: "uppercase" }}
          >
            {`LVL ${xpLevel} · ${rank.title}`}
          </span>
          <span
            style={{
              fontSize: 14,
              color: tier.color,
              backgroundColor: rgba(tier.color, 0.13),
              padding: "3px 10px",
              textTransform: "uppercase",
            }}
          >
            {tier.name.toUpperCase()}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            width: "100%",
            height: 12,
            backgroundColor: OG.border,
            marginTop: 10,
          }}
        >
          <div
            style={{
              display: "flex",
              width: `${Math.max(2, Math.round(progress * 100))}%`,
              height: 12,
              backgroundColor: tier.color,
            }}
          />
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 6,
          }}
        >
          <span style={{ fontSize: 13, color: OG.dim }}>
            {`${xpCurrent.toLocaleString()} / ${xpNeeded.toLocaleString()} XP`}
          </span>
          <span style={{ fontSize: 13, color: OG.dim }}>
            {`${xpTotal.toLocaleString()} TOTAL`}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Stats strip — joined cells with dividers (profile grid look) ─
export function statsStrip(
  stats: { label: string; value: string }[],
  width: number
) {
  return (
    <div
      style={{
        width,
        display: "flex",
        border: `3px solid ${OG.border}`,
        backgroundColor: OG.cardBg,
      }}
    >
      {stats.map((s, i) => (
        <div
          key={s.label}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            flexGrow: 1,
            flexBasis: 0,
            // Asymmetric: Silkscreen glyphs sit low in satori's line box,
            // so equal padding reads as top-heavy.
            padding: "11px 0 21px",
            borderLeft: i > 0 ? `3px solid ${OG.border}` : "none",
          }}
        >
          <div style={{ display: "flex", fontSize: 36, color: OG.accent }}>
            {s.value}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 15,
              color: OG.muted,
              textTransform: "uppercase",
              marginTop: 6,
            }}
          >
            {s.label}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Hero card layout (shared by OG image + landscape share card) ─
// A strict grid: one content column (left, fixed width) where identity,
// XP bar and stats all share the same edges; buildings anchored to the
// footer ground line on the right; structured footer band.
export interface HeroCardOpts {
  dev: CardDev;
  width: number;
  height: number;
  statLabels: { contribs: string; repos: string; stars: string; kudos: string };
  /** Extra row under the stats (e.g. achievement chips). */
  extraRow?: ReactNode;
  footerRight: string;
}

export function heroCardLayout(opts: HeroCardOpts) {
  const { dev, width, height, statLabels, extraRow, footerRight } = opts;
  const tier = tierFromLevel(dev.xp_level);

  const M = 56; // outer margin
  const COL_W = 760; // content column width — every block ends on this edge
  const FOOTER_H = 78;
  const GROUND_Y = height - FOOTER_H;

  // Buildings anchored to the ground, right side
  const mainH = Math.round(
    Math.min(GROUND_Y - 84, Math.max(300, 300 + (dev.contributions / 1000) * 140))
  );
  const backH = Math.round(mainH * 0.62);

  const stats = [
    { label: statLabels.contribs, value: dev.contributions.toLocaleString() },
    { label: statLabels.repos, value: dev.public_repos.toLocaleString() },
    { label: statLabels.stars, value: dev.total_stars.toLocaleString() },
    { label: statLabels.kudos, value: dev.kudos_count.toLocaleString() },
  ];

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        backgroundColor: OG.bg,
        fontFamily: "Silkscreen",
        border: `6px solid ${OG.border}`,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {tierBackdrop(tier.color)}

      {/* City skyline — dim back building peeking from behind the main one */}
      {building({
        left: width - 56 - 240 - 64,
        groundY: GROUND_Y,
        height: backH,
        width: 150,
        color: OG.borderLight,
      })}
      {building({
        left: width - 56 - 240,
        groundY: GROUND_Y,
        height: mainH,
        width: 240,
        color: tier.color,
      })}

      {/* Content column */}
      <div
        style={{
          position: "absolute",
          left: M,
          top: M,
          width: COL_W,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Identity row */}
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          {dev.avatar_url && tierAvatar(dev.avatar_url, tier, 112)}
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {/* center, not baseline: Silkscreen baselines at mixed sizes drift apart in satori */}
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <span
                style={{
                  fontSize: 42,
                  color: OG.cream,
                  textTransform: "uppercase",
                  maxWidth: 460,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                }}
              >
                {dev.name ?? `@${dev.github_login}`}
              </span>
              <span
                style={{ fontSize: 20, color: tier.color, textTransform: "uppercase" }}
              >
                {`«${dev.title}»`}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span
                style={{ fontSize: 21, color: OG.muted, textTransform: "uppercase" }}
              >
                {`@${dev.github_login}`}
              </span>
              {dev.claimed && claimedChip(13)}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {dev.rank && chip(`RANK #${dev.rank.toLocaleString()}`, tier.color, 14)}
              {dev.district && districtChip(dev.district, 13)}
            </div>
          </div>
        </div>

        {/* Level + XP bar — same column edges */}
        <div style={{ display: "flex", marginTop: 34 }}>
          {levelBlock(dev.xp_level, dev.xp_total, COL_W)}
        </div>

        {/* Stats strip — same column edges */}
        <div style={{ display: "flex", marginTop: 30 }}>
          {statsStrip(stats, COL_W)}
        </div>

        {extraRow ? (
          <div style={{ display: "flex", marginTop: 20 }}>{extraRow}</div>
        ) : null}
      </div>

      {/* Ground line + footer band */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: GROUND_Y,
          width,
          height: 4,
          backgroundColor: tier.color,
          display: "flex",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          top: GROUND_Y + 4,
          width,
          height: FOOTER_H - 4,
          backgroundColor: "#141418",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          // Bottom padding optically centers Silkscreen's low baseline
          padding: `0 ${M}px 13px`,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 10,
            textTransform: "uppercase",
          }}
        >
          <span style={{ fontSize: 26, color: OG.cream }}>GIT</span>
          <span style={{ fontSize: 26, color: OG.accent }}>CITY</span>
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 16,
            color: OG.muted,
            textTransform: "uppercase",
          }}
        >
          {footerRight}
        </div>
      </div>
    </div>
  );
}
