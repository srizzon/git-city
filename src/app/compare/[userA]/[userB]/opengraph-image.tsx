import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

export const alt = "Developer Comparison - Git City";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ userA: string; userB: string }>;
}) {
  const { userA, userB } = await params;

  const fontData = await readFile(join(process.cwd(), "public/fonts/Silkscreen-Regular.ttf"));

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const accent = "#c8e64a";
  const bg = "#0d0d0f";
  const cream = "#e8dcc8";
  const border = "#2a2a30";
  const cardBg = "#1c1c20";
  const muted = "#8c8c9c";

  const [{ data: devA }, { data: devB }] = await Promise.all([
    supabase
      .from("developers")
      .select(
        "github_login, name, avatar_url, contributions, contributions_total, public_repos, total_stars, rank, kudos_count",
      )
      .eq("github_login", userA.toLowerCase())
      .single(),
    supabase
      .from("developers")
      .select(
        "github_login, name, avatar_url, contributions, contributions_total, public_repos, total_stars, rank, kudos_count",
      )
      .eq("github_login", userB.toLowerCase())
      .single(),
  ]);

  if (!devA || !devB) {
    return new ImageResponse(
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: bg,
          fontFamily: "Silkscreen",
          color: cream,
          fontSize: 48,
          border: `6px solid ${border}`,
        }}
      >
        Comparison not found
      </div>,
      {
        ...size,
        fonts: [
          { name: "Silkscreen", data: fontData, style: "normal" as const, weight: 400 as const },
        ],
      },
    );
  }

  // Effective contributions (matches rank calculation)
  const contribsA =
    devA.contributions_total && devA.contributions_total > 0
      ? devA.contributions_total
      : devA.contributions;
  const contribsB =
    devB.contributions_total && devB.contributions_total > 0
      ? devB.contributions_total
      : devB.contributions;

  // Stats comparison
  const statDefs = [
    { label: "RANK", key: "rank" as const, invert: true },
    { label: "CONTRIBS", key: "contributions" as const, invert: false },
    { label: "STARS", key: "total_stars" as const, invert: false },
    { label: "REPOS", key: "public_repos" as const, invert: false },
    { label: "KUDOS", key: "kudos_count" as const, invert: false },
  ];

  // Override contributions with effective values for comparison
  const devAEff = { ...devA, contributions: contribsA };
  const devBEff = { ...devB, contributions: contribsB };

  let aWinsCount = 0;
  let bWinsCount = 0;
  const statRows = statDefs.map((s) => {
    const a: number = (devAEff as Record<string, number>)[s.key] ?? 0;
    const b: number = (devBEff as Record<string, number>)[s.key] ?? 0;
    let aWin = false;
    let bWin = false;
    if (s.invert) {
      aWin = a > 0 && (a < b || b === 0);
      bWin = b > 0 && (b < a || a === 0);
    } else {
      aWin = a > b;
      bWin = b > a;
    }
    if (aWin) aWinsCount++;
    if (bWin) bWinsCount++;
    return { label: s.label, a, b, aWin, bWin, isRank: s.key === "rank" };
  });

  const isTie = aWinsCount === bWinsCount;
  const winnerLogin = aWinsCount > bWinsCount ? devA.github_login : devB.github_login;
  const summary = isTie
    ? `Tie ${aWinsCount}-${bWinsCount}`
    : `@${winnerLogin} wins ${Math.max(aWinsCount, bWinsCount)}-${Math.min(aWinsCount, bWinsCount)}`;

  const aIsWinner = aWinsCount > bWinsCount;
  const bIsWinner = bWinsCount > aWinsCount;
  const aColor = aIsWinner || isTie ? accent : muted;
  const bColor = bIsWinner || isTie ? accent : muted;

  // Building heights proportional to contributions
  const maxContrib = Math.max(contribsA, contribsB, 1);
  const MIN_H = 200;
  const MAX_H = 400;
  const heightA = Math.round(MIN_H + (contribsA / maxContrib) * (MAX_H - MIN_H));
  const heightB = Math.round(MIN_H + (contribsB / maxContrib) * (MAX_H - MIN_H));
  const GROUND_Y = 520;

  // Building window generator
  const WSIZE = 24;
  const WGAP = 10;
  const WCOLS = 5;

  function renderWindows(bHeight: number, color: string) {
    const rowH = WSIZE + WGAP;
    const usable = bHeight - 36;
    const nRows = Math.max(2, Math.floor(usable / rowH));
    const rows = [];
    for (let r = 0; r < nRows; r++) {
      const cells = [];
      for (let c = 0; c < WCOLS; c++) {
        const lit = (r * 5 + c * 3) % 7 > 1;
        cells.push(
          <div
            key={c}
            style={{
              width: WSIZE,
              height: WSIZE,
              backgroundColor: lit ? color : `${color}18`,
            }}
          />,
        );
      }
      rows.push(
        <div key={r} style={{ display: "flex", gap: WGAP }}>
          {cells}
        </div>,
      );
    }
    return rows;
  }

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        backgroundColor: bg,
        fontFamily: "Silkscreen",
        border: `6px solid ${border}`,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Dev A: Avatar + Name (top-left) */}
      <div
        style={{
          position: "absolute",
          left: 40,
          top: 30,
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        {devA.avatar_url && (
          <img
            src={devA.avatar_url}
            width={80}
            height={80}
            style={{ border: `3px solid ${aColor}` }}
          />
        )}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 32, color: cream, textTransform: "uppercase" }}>
            {(devA.name ?? devA.github_login).slice(0, 12)}
          </div>
          <div style={{ display: "flex", fontSize: 22, color: muted }}>@{devA.github_login}</div>
        </div>
      </div>

      {/* Dev B: Avatar + Name (top-right) */}
      <div
        style={{
          position: "absolute",
          right: 40,
          top: 30,
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          <div style={{ display: "flex", fontSize: 32, color: cream, textTransform: "uppercase" }}>
            {(devB.name ?? devB.github_login).slice(0, 12)}
          </div>
          <div style={{ display: "flex", fontSize: 22, color: muted }}>@{devB.github_login}</div>
        </div>
        {devB.avatar_url && (
          <img
            src={devB.avatar_url}
            width={80}
            height={80}
            style={{ border: `3px solid ${bColor}` }}
          />
        )}
      </div>

      {/* Building A */}
      <div
        style={{
          position: "absolute",
          left: 55,
          top: GROUND_Y - heightA,
          width: 220,
          height: heightA,
          backgroundColor: cardBg,
          borderTop: `6px solid ${aColor}`,
          borderLeft: `3px solid ${aIsWinner || isTie ? `${accent}50` : border}`,
          borderRight: `3px solid ${aIsWinner || isTie ? `${accent}50` : border}`,
          borderBottom: `3px solid ${aIsWinner || isTie ? `${accent}50` : border}`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: 14,
          gap: WGAP,
        }}
      >
        {renderWindows(heightA, aColor)}
      </div>

      {/* Building B */}
      <div
        style={{
          position: "absolute",
          left: 925,
          top: GROUND_Y - heightB,
          width: 220,
          height: heightB,
          backgroundColor: cardBg,
          borderTop: `6px solid ${bColor}`,
          borderLeft: `3px solid ${bIsWinner || isTie ? `${accent}50` : border}`,
          borderRight: `3px solid ${bIsWinner || isTie ? `${accent}50` : border}`,
          borderBottom: `3px solid ${bIsWinner || isTie ? `${accent}50` : border}`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: 14,
          gap: WGAP,
        }}
      >
        {renderWindows(heightB, bColor)}
      </div>

      {/* Center: VS + Stats */}
      <div
        style={{
          position: "absolute",
          left: 310,
          top: 0,
          width: 580,
          height: GROUND_Y,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {/* VS badge */}
        <div
          style={{
            display: "flex",
            fontSize: 56,
            color: accent,
            border: `4px solid ${accent}`,
            padding: "4px 30px",
            marginBottom: 24,
          }}
        >
          VS
        </div>
        {/* Stats rows */}
        {statRows.map((s) => (
          <div
            key={s.label}
            style={{
              display: "flex",
              alignItems: "center",
              marginBottom: 10,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                width: 150,
                fontSize: 42,
                color: s.aWin ? accent : muted,
              }}
            >
              {s.isRank ? (s.a > 0 ? `#${s.a}` : "-") : s.a.toLocaleString()}
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                width: 140,
                fontSize: 20,
                color: `${muted}aa`,
              }}
            >
              {s.label}
            </div>
            <div
              style={{
                display: "flex",
                width: 150,
                fontSize: 42,
                color: s.bWin ? accent : muted,
              }}
            >
              {s.isRank ? (s.b > 0 ? `#${s.b}` : "-") : s.b.toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      {/* Ground line */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: GROUND_Y,
          width: 1200,
          height: 4,
          backgroundColor: accent,
          display: "flex",
        }}
      />

      {/* Ground fill */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: GROUND_Y + 4,
          width: 1200,
          height: 120,
          backgroundColor: "#141418",
          display: "flex",
        }}
      />

      {/* Summary (bottom-left) */}
      <div
        style={{
          position: "absolute",
          bottom: 16,
          left: 40,
          display: "flex",
          fontSize: 32,
          color: accent,
          textTransform: "uppercase",
        }}
      >
        {summary}
      </div>

      {/* Branding (bottom-right) */}
      <div
        style={{
          position: "absolute",
          bottom: 16,
          right: 40,
          display: "flex",
          alignItems: "baseline",
          gap: 10,
          textTransform: "uppercase",
        }}
      >
        <span style={{ fontSize: 34, color: cream }}>GIT</span>
        <span style={{ fontSize: 34, color: accent }}>CITY</span>
        <span style={{ fontSize: 16, color: muted, marginLeft: 8 }}>by @samuelrizzondev</span>
      </div>
    </div>,
    {
      ...size,
      fonts: [
        {
          name: "Silkscreen",
          data: fontData,
          style: "normal" as const,
          weight: 400 as const,
        },
      ],
    },
  );
}
