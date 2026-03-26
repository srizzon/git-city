import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getPitchStats } from "@/lib/pitch-stats";

export const alt = "Git City - Pitch Deck";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const [fontData, stats] = await Promise.all([
    readFile(join(process.cwd(), "public/fonts/Silkscreen-Regular.ttf")),
    getPitchStats(),
  ]);

  const accent = "#c8e64a";
  const bg = "#0d0d0f";
  const cream = "#e8dcc8";
  const border = "#2a2a30";
  const muted = "#8c8c9c";
  const dim = "#5c5c6c";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: bg,
          fontFamily: "Silkscreen",
          border: `6px solid ${border}`,
          gap: 40,
        }}
      >
        {/* Logo */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 24,
            textTransform: "uppercase",
          }}
        >
          <span style={{ fontSize: 120, color: cream }}>GIT</span>
          <span style={{ fontSize: 120, color: accent }}>CITY</span>
        </div>

        {/* Pitch Deck label */}
        <div
          style={{
            display: "flex",
            border: `4px solid ${border}`,
            padding: "12px 40px",
            fontSize: 36,
            textTransform: "uppercase",
            color: muted,
            gap: 16,
          }}
        >
          <span>Pitch</span>
          <span style={{ color: accent }}>Deck</span>
        </div>

        {/* Stats row */}
        <div
          style={{
            display: "flex",
            gap: 40,
            fontSize: 20,
            textTransform: "uppercase",
            color: dim,
          }}
        >
          <span>{stats.formattedDevelopers} devs</span>
          <span style={{ color: border }}>|</span>
          <span>{stats.formattedRevenue} revenue</span>
          <span style={{ color: border }}>|</span>
          <span>$0 marketing</span>
        </div>
      </div>
    ),
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
    }
  );
}
