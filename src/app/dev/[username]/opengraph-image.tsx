import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

export const alt = "Developer Profile - Git City";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;

  const fontData = await readFile(join(process.cwd(), "public/fonts/Silkscreen-Regular.ttf"));

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const { data: dev } = await supabase
    .from("developers")
    .select(
      "github_login, name, avatar_url, contributions, contributions_total, public_repos, total_stars, rank, kudos_count",
    )
    .eq("github_login", username.toLowerCase())
    .single();

  const accent = "#c8e64a";
  const bg = "#0d0d0f";
  const cream = "#e8dcc8";
  const border = "#2a2a30";
  const cardBg = "#1c1c20";
  const muted = "#8c8c9c";

  if (!dev) {
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
        Developer not found
      </div>,
      {
        ...size,
        fonts: [
          { name: "Silkscreen", data: fontData, style: "normal" as const, weight: 400 as const },
        ],
      },
    );
  }

  // Window rendering (same as compare) — bigger windows for profile
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

  // Effective contributions (matches rank calculation)
  const contribs =
    dev.contributions_total && dev.contributions_total > 0
      ? dev.contributions_total
      : dev.contributions;

  // Building height — tall and dominant, scales with contributions
  const buildingH = Math.round(Math.min(480, Math.max(320, 320 + (contribs / 1000) * 160)));
  const GROUND_Y = 550;

  const stats = [
    { label: "CONTRIBS", value: contribs.toLocaleString() },
    { label: "REPOS", value: dev.public_repos.toLocaleString() },
    { label: "STARS", value: dev.total_stars.toLocaleString() },
    { label: "KUDOS", value: (dev.kudos_count ?? 0).toLocaleString() },
  ];

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
      {/* Building — hero element */}
      <div
        style={{
          position: "absolute",
          left: 80,
          top: GROUND_Y - buildingH,
          width: 260,
          height: buildingH,
          backgroundColor: cardBg,
          borderTop: `6px solid ${accent}`,
          borderLeft: `3px solid ${accent}50`,
          borderRight: `3px solid ${accent}50`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: 16,
          gap: WGAP,
        }}
      >
        {renderWindows(buildingH, accent)}
      </div>

      {/* Right column: Info + Stats */}
      <div
        style={{
          position: "absolute",
          left: 420,
          top: 40,
          width: 720,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Avatar + Name + Login */}
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          {dev.avatar_url && (
            <img
              src={dev.avatar_url}
              width={120}
              height={120}
              style={{
                border: `4px solid ${accent}`,
              }}
            />
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {dev.name && (
              <div
                style={{
                  display: "flex",
                  fontSize: 48,
                  color: cream,
                  textTransform: "uppercase",
                }}
              >
                {dev.name}
              </div>
            )}
            <div
              style={{
                display: "flex",
                fontSize: 26,
                color: muted,
                textTransform: "uppercase",
              }}
            >
              {`@${dev.github_login}`}
            </div>
            {dev.rank && (
              <div
                style={{
                  display: "flex",
                  fontSize: 20,
                  color: accent,
                  border: `3px solid ${accent}`,
                  padding: "6px 16px",
                  marginTop: 4,
                  textTransform: "uppercase",
                }}
              >
                {`#${dev.rank} in the city`}
              </div>
            )}
          </div>
        </div>

        {/* Stats — 2x2 grid */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 20,
            marginTop: 40,
          }}
        >
          {stats.map((stat) => (
            <div
              key={stat.label}
              style={{
                width: 320,
                display: "flex",
                flexDirection: "column",
                backgroundColor: cardBg,
                border: `3px solid ${border}`,
                padding: "16px 24px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  fontSize: 18,
                  color: muted,
                  textTransform: "uppercase",
                }}
              >
                {stat.label}
              </div>
              <div
                style={{
                  display: "flex",
                  fontSize: 48,
                  color: accent,
                  marginTop: 4,
                }}
              >
                {stat.value}
              </div>
            </div>
          ))}
        </div>
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
          height: 90,
          backgroundColor: "#141418",
          display: "flex",
        }}
      />

      {/* Branding bottom-right */}
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
        <span style={{ fontSize: 28, color: cream }}>GIT</span>
        <span style={{ fontSize: 28, color: accent }}>CITY</span>
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
