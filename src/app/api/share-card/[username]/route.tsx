import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type NextRequest } from "next/server";
import { tierFromLevel, rankFromLevel } from "@/lib/xp";
import {
  OG,
  loadDevForCard,
  tierBackdrop,
  building,
  chip,
  districtChip,
  tierAvatar,
  heroCardLayout,
  type CardDev,
  type CardAchievement,
} from "@/lib/og/devHero";

export const runtime = "nodejs";

// Achievement tier colors (trophy tiers — distinct from XP tiers)
const TIER_COLORS: Record<string, string> = {
  bronze: "#cd7f32",
  silver: "#c0c0c0",
  gold: "#ffd700",
  diamond: "#b9f2ff",
};

// ─── i18n ─────────────────────────────────────────────────────
type Lang = "en" | "pt";

const i18n: Record<Lang, {
  inTheCity: string;
  commits: string;
  repos: string;
  stars: string;
  kudos: string;
  cta: string;
  notFound: string;
}> = {
  en: {
    inTheCity: "in the city",
    commits: "COMMITS",
    repos: "REPOS",
    stars: "STARS",
    kudos: "KUDOS",
    cta: "Can you beat this?",
    notFound: "Developer not found",
  },
  pt: {
    inTheCity: "na cidade",
    commits: "COMMITS",
    repos: "REPOS",
    stars: "ESTRELAS",
    kudos: "KUDOS",
    cta: "Consegue me superar?",
    notFound: "Desenvolvedor nao encontrado",
  },
};

// ─── Taunt phrases by rank/contributions ──────────────────────
const TAUNTS: Record<Lang, { rank: [number, string][]; contribs: [number, string][]; fallback: string }> = {
  en: {
    rank: [
      [5, "I AM THE SKYLINE"],
      [15, "THE VIEW FROM UP HERE IS INSANE"],
      [50, "I CAN SEE YOUR BUILDING FROM HERE"],
      [100, "MY ELEVATOR DOESN'T GO THAT LOW"],
      [250, "PENTHOUSE VIBES ONLY"],
      [500, "MY BUILDING HAS A ROOFTOP POOL"],
      [1000, "NOT BAD FOR SOMEONE WHO SLEEPS"],
    ],
    contribs: [
      [5000, "I DON'T TOUCH GRASS. I PUSH CODE."],
      [2000, "YOUR BUILDING FITS IN MY LOBBY"],
      [1000, "MY COMMITS HAVE COMMITS"],
      [500, "TALLER THAN YOUR ATTENTION SPAN"],
      [200, "SMALL BUILDING, BIG ENERGY"],
      [50, "EVERY SKYSCRAPER STARTS SOMEWHERE"],
    ],
    fallback: "JUST MOVED IN. WATCH ME GROW.",
  },
  pt: {
    rank: [
      [5, "EU SOU O HORIZONTE"],
      [15, "A VISTA DAQUI DE CIMA E INSANA"],
      [50, "DA PRA VER SEU PRÉDIO DAQUI"],
      [100, "MEU ELEVADOR NAO DESCE ATE AI"],
      [250, "SÓ COBERTURA"],
      [500, "MEU PRÉDIO TEM PISCINA NO TOPO"],
      [1000, "NADA MAL PRA QUEM DORME"],
    ],
    contribs: [
      [5000, "EU NAO TOCO GRAMA. EU FAÇO PUSH."],
      [2000, "SEU PRÉDIO CABE NO MEU LOBBY"],
      [1000, "MEUS COMMITS TEM COMMITS"],
      [500, "MAIS ALTO QUE SUA PACIÊNCIA"],
      [200, "PRÉDIO PEQUENO, ENERGIA GRANDE"],
      [50, "TODO ARRANHA-CEU COMEÇA EM ALGUM LUGAR"],
    ],
    fallback: "ACABEI DE CHEGAR. ME OBSERVE.",
  },
};

function getTaunt(rank: number | null, contributions: number, lang: Lang): string {
  const t = TAUNTS[lang];
  if (rank) {
    for (const [threshold, phrase] of t.rank) {
      if (rank <= threshold) return phrase;
    }
  }
  for (const [threshold, phrase] of t.contribs) {
    if (contributions >= threshold) return phrase;
  }
  return t.fallback;
}

// Achievement chips row (shared by both formats)
function achievementChips(
  achievements: CardAchievement[],
  max: number,
  fontSize: number
) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
        justifyContent: "center",
      }}
    >
      {achievements.slice(0, max).map((ach, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            fontSize,
            color: TIER_COLORS[ach.tier] ?? OG.accent,
            border: `2px solid ${TIER_COLORS[ach.tier] ?? OG.accent}`,
            padding: "3px 10px",
            textTransform: "uppercase",
          }}
        >
          {ach.name}
        </div>
      ))}
      {achievements.length > max && (
        <div style={{ display: "flex", fontSize, color: OG.muted }}>
          +{achievements.length - max}
        </div>
      )}
    </div>
  );
}

// ─── GET handler ──────────────────────────────────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;
  const format = request.nextUrl.searchParams.get("format") ?? "landscape";
  const lang = (request.nextUrl.searchParams.get("lang") === "pt" ? "pt" : "en") as Lang;

  const fontData = await readFile(
    join(process.cwd(), "public/fonts/Silkscreen-Regular.ttf")
  );

  const loaded = await loadDevForCard(username);
  const t = i18n[lang];

  if (!loaded) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: OG.bg,
            fontFamily: "Silkscreen",
            color: OG.cream,
            fontSize: 48,
            border: `6px solid ${OG.border}`,
          }}
        >
          {t.notFound}
        </div>
      ),
      {
        width: 1200,
        height: 675,
        fonts: [
          { name: "Silkscreen", data: fontData, style: "normal" as const, weight: 400 as const },
        ],
      }
    );
  }

  const { dev, achievements } = loaded;
  if (format === "stories") {
    return renderStories(dev, achievements, fontData, t, lang);
  }
  return renderLandscape(dev, achievements, fontData, t);
}

// ─── Landscape (1200x675) — shared hero layout + achievements row ─
function renderLandscape(
  dev: CardDev,
  achievements: CardAchievement[],
  fontData: Buffer,
  t: typeof i18n.en
) {
  return new ImageResponse(
    heroCardLayout({
      dev,
      width: 1200,
      height: 675,
      statLabels: { contribs: t.commits, repos: t.repos, stars: t.stars, kudos: t.kudos },
      extraRow: achievements.length > 0 ? achievementChips(achievements, 4, 13) : undefined,
      footerRight: `thegitcity.com/dev/${dev.github_login}`,
    }),
    {
      width: 1200,
      height: 675,
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
      fonts: [
        { name: "Silkscreen", data: fontData, style: "normal" as const, weight: 400 as const },
      ],
    }
  );
}

// ─── Stories (1080x1920) ──────────────────────────────────────
// IG safe zones: top ~130px, bottom ~120px
//   150  taunt phrase
//   230  avatar + name + chips
//   ≥560 building top (dynamic)
//   1320 ground line
//   1360 stats (3 flat)
//   1470 achievement badges
//   1540 CTA
function renderStories(
  dev: CardDev,
  achievements: CardAchievement[],
  fontData: Buffer,
  t: typeof i18n.en,
  lang: Lang
) {
  const tier = tierFromLevel(dev.xp_level);
  const rank = rankFromLevel(dev.xp_level);
  const buildingH = Math.round(
    Math.min(720, Math.max(480, 480 + (dev.contributions / 1000) * 200))
  );
  const BWIDTH = 320;
  const GROUND_Y = 1320;
  const taunt = getTaunt(dev.rank, dev.contributions, lang);

  const stats = [
    { label: t.commits, value: dev.contributions.toLocaleString() },
    { label: t.repos, value: dev.public_repos.toLocaleString() },
    { label: t.stars, value: dev.total_stars.toLocaleString() },
  ];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: OG.bg,
          fontFamily: "Silkscreen",
          position: "relative",
          overflow: "hidden",
          alignItems: "center",
        }}
      >
        {tierBackdrop(tier.color, 20)}

        {/* ── Taunt (the hook — first thing you read) ── */}
        <div
          style={{
            position: "absolute",
            top: 150,
            width: 920,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 36,
              color: OG.accent,
              textTransform: "uppercase",
              textAlign: "center",
              justifyContent: "center",
            }}
          >
            &ldquo;{taunt}&rdquo;
          </div>
        </div>

        {/* ── Profile ── */}
        <div
          style={{
            position: "absolute",
            top: 230,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            width: 920,
          }}
        >
          {dev.avatar_url && tierAvatar(dev.avatar_url, tier, 104)}
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 12,
              marginTop: 16,
              justifyContent: "center",
            }}
          >
            <span
              style={{ fontSize: 42, color: OG.cream, textTransform: "uppercase" }}
            >
              {dev.name ?? `@${dev.github_login}`}
            </span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginTop: 6,
            }}
          >
            <span style={{ fontSize: 22, color: OG.muted, textTransform: "uppercase" }}>
              {`@${dev.github_login}`}
            </span>
            <span style={{ fontSize: 20, color: tier.color, textTransform: "uppercase" }}>
              {`«${dev.title}»`}
            </span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginTop: 12,
            }}
          >
            {dev.rank && chip(`#${dev.rank.toLocaleString()} ${t.inTheCity}`, tier.color, 17)}
            {chip(`LVL ${dev.xp_level} · ${rank.title}`, tier.color, 17)}
            {dev.district && districtChip(dev.district, 15)}
          </div>
        </div>

        {/* ── Building (HERO — fills the center) ── */}
        {building({
          left: (1080 - BWIDTH) / 2,
          groundY: GROUND_Y,
          height: buildingH,
          width: BWIDTH,
          color: tier.color,
        })}

        {/* ── Ground line ── */}
        <div
          style={{
            position: "absolute",
            left: 100,
            top: GROUND_Y,
            width: 880,
            height: 4,
            backgroundColor: tier.color,
            display: "flex",
          }}
        />

        {/* ── Stats: 3 across, clean ── */}
        <div
          style={{
            position: "absolute",
            top: GROUND_Y + 36,
            left: 100,
            width: 880,
            display: "flex",
            justifyContent: "space-around",
          }}
        >
          {stats.map((stat) => (
            <div
              key={stat.label}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              <div style={{ display: "flex", fontSize: 50, color: OG.accent }}>
                {stat.value}
              </div>
              <div
                style={{
                  display: "flex",
                  fontSize: 16,
                  color: OG.muted,
                  textTransform: "uppercase",
                  marginTop: 4,
                }}
              >
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        {/* ── Achievement badges ── */}
        {achievements.length > 0 && (
          <div
            style={{
              position: "absolute",
              top: GROUND_Y + 150,
              left: 80,
              width: 920,
              display: "flex",
              justifyContent: "center",
            }}
          >
            {achievementChips(achievements, 5, 15)}
          </div>
        )}

        {/* ── Challenge CTA ── */}
        <div
          style={{
            position: "absolute",
            top: GROUND_Y + 220,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            width: 1080,
            gap: 14,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 26,
              color: OG.bg,
              backgroundColor: OG.accent,
              padding: "14px 44px",
              textTransform: "uppercase",
            }}
          >
            {t.cta} → thegitcity.com
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 8,
              textTransform: "uppercase",
            }}
          >
            <span style={{ fontSize: 20, color: OG.cream }}>GIT</span>
            <span style={{ fontSize: 20, color: OG.accent }}>CITY</span>
          </div>
        </div>
      </div>
    ),
    {
      width: 1080,
      height: 1920,
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
      fonts: [
        { name: "Silkscreen", data: fontData, style: "normal" as const, weight: 400 as const },
      ],
    }
  );
}
