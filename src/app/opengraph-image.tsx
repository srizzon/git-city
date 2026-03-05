import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "Git City - Your GitHub as a 3D City";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const fontData = await readFile(join(process.cwd(), "public/fonts/Silkscreen-Regular.ttf"));

  const accent = "#c8e64a";
  const bg = "#0d0d0f";
  const cream = "#e8dcc8";
  const border = "#2a2a30";
  const cardBg = "#1c1c20";
  const muted = "#8c8c9c";

  // Window rendering (same as compare)
  const WSIZE = 20;
  const WGAP = 8;
  const WCOLS = 4;

  function renderWindows(bHeight: number, color: string, seed: number) {
    const rowH = WSIZE + WGAP;
    const usable = bHeight - 30;
    const nRows = Math.max(2, Math.floor(usable / rowH));
    const rows = [];
    for (let r = 0; r < nRows; r++) {
      const cells = [];
      for (let c = 0; c < WCOLS; c++) {
        const lit = (r * 5 + c * 3 + seed * 7) % 7 > 1;
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

  // Skyline buildings — max height 180px so they never overlap the title zone
  const GROUND_Y = 500;
  const buildings = [
    { x: 50, w: 100, h: 130 },
    { x: 158, w: 80, h: 80 },
    { x: 246, w: 110, h: 170 },
    { x: 364, w: 90, h: 110 },
    { x: 462, w: 120, h: 155 },
    { x: 590, w: 80, h: 90 },
    { x: 678, w: 110, h: 180 },
    { x: 796, w: 90, h: 130 },
    { x: 894, w: 120, h: 160 },
    { x: 1022, w: 100, h: 105 },
  ];

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: bg,
        fontFamily: "Silkscreen",
        border: `6px solid ${border}`,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Title — positioned above buildings with z layering */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: 1200,
          height: GROUND_Y - 180,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 20,
            textTransform: "uppercase",
          }}
        >
          <span style={{ fontSize: 110, color: cream }}>GIT</span>
          <span style={{ fontSize: 110, color: accent }}>CITY</span>
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 20,
            fontSize: 26,
            textTransform: "uppercase",
            gap: 10,
          }}
        >
          <span style={{ color: muted }}>Where code</span>
          <span style={{ color: accent }}>builds cities</span>
        </div>
      </div>

      {/* Buildings */}
      {buildings.map((b, i) => {
        const bColor = i % 2 === 0 ? accent : muted;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: b.x,
              top: GROUND_Y - b.h,
              width: b.w,
              height: b.h,
              backgroundColor: cardBg,
              borderTop: `6px solid ${bColor}`,
              borderLeft: `3px solid ${bColor}50`,
              borderRight: `3px solid ${bColor}50`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              paddingTop: 14,
              gap: WGAP,
            }}
          >
            {renderWindows(b.h, bColor, i)}
          </div>
        );
      })}

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
          height: 130,
          backgroundColor: "#141418",
          display: "flex",
        }}
      />

      {/* Tagline + branding */}
      <div
        style={{
          position: "absolute",
          bottom: 28,
          left: 0,
          width: 1200,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0 40px",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 20,
            color: muted,
            textTransform: "uppercase",
            gap: 14,
          }}
        >
          <span>Explore</span>
          <span>·</span>
          <span>Fly</span>
          <span>·</span>
          <span>Discover</span>
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 18,
            color: muted,
          }}
        >
          by @samuelrizzondev
        </div>
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
