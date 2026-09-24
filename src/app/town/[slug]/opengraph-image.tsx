import { Fragment } from "react";
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { OG, building } from "@/lib/og/devHero";
import { getLeagueBySlug } from "@/lib/leagues/service";
import { getLeagueMembers } from "@/lib/leagues/queries";
import { townDisplayName } from "@/lib/towns/names";

export const alt = "Town skyline - Git City";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 3600;

const MAX_BUILDINGS = 12;
// Invited members who haven't joined: the accent at low opacity.
const INVITED = "rgba(200, 230, 74, 0.28)";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const fontData = await readFile(join(process.cwd(), "public/fonts/Silkscreen-Regular.ttf"));
  const fonts = [{ name: "Silkscreen", data: fontData, style: "normal" as const, weight: 400 as const }];

  const league = await getLeagueBySlug(slug);
  const members = league ? (await getLeagueMembers(league.id)).filter((m) => m.status !== "former") : [];
  const invitedCount = members.filter((m) => m.status === "invited").length;

  // Tallest buildings, laid out tallest-in-the-middle like a skyline.
  const top = [...members].sort((a, b) => b.contributions - a.contributions).slice(0, MAX_BUILDINGS);
  const skyline: typeof top = [];
  top.forEach((m, i) => (i % 2 === 0 ? skyline.push(m) : skyline.unshift(m)));
  const maxC = Math.max(1, ...top.map((m) => m.contributions));

  const groundY = 560;
  const areaLeft = 60;
  const areaWidth = 1080;
  const gap = 12;
  const n = Math.max(1, skyline.length);
  const bw = Math.min(150, Math.floor((areaWidth - gap * (n - 1)) / n));
  const totalW = bw * n + gap * (n - 1);
  const startX = areaLeft + Math.floor((areaWidth - totalW) / 2);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          backgroundColor: OG.bg,
          fontFamily: "Silkscreen",
          color: OG.cream,
          border: `6px solid ${OG.border}`,
        }}
      >
        <div style={{ position: "absolute", left: 60, top: 48, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", fontSize: 22, color: OG.accent, letterSpacing: 2 }}>
            {league?.kind === "company" ? "COMPANY TOWN" : "TOWN"}
          </div>
          <div style={{ display: "flex", fontSize: 64, lineHeight: 1 }}>{league ? townDisplayName(league.name) : "Town not found"}</div>
          {league && (
            <div style={{ display: "flex", fontSize: 26, color: OG.muted }}>
              {`${members.length} buildings, ${invitedCount} invited`}
            </div>
          )}
        </div>

        {skyline.map((m, i) => (
          <Fragment key={m.developer_id}>
            {building({
              left: startX + i * (bw + gap),
              groundY,
              height: Math.round(90 + (m.contributions / maxC) * 250),
              width: bw,
              color: m.status === "invited" ? INVITED : OG.accent,
            })}
          </Fragment>
        ))}

        <div style={{ position: "absolute", left: 0, right: 0, top: groundY, height: 4, backgroundColor: OG.border, display: "flex" }} />
        <div style={{ position: "absolute", right: 60, bottom: 26, display: "flex", fontSize: 20, color: OG.dim }}>
          {`thegitcity.com/league/${slug}`}
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
