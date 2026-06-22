import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { OG, loadDevForCard, heroCardLayout } from "@/lib/og/devHero";

export const alt = "Developer Profile - Git City";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;

  const fontData = await readFile(
    join(process.cwd(), "public/fonts/Silkscreen-Regular.ttf")
  );
  const fonts = [
    { name: "Silkscreen", data: fontData, style: "normal" as const, weight: 400 as const },
  ];

  const loaded = await loadDevForCard(username);

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
          Developer not found
        </div>
      ),
      { ...size, fonts }
    );
  }

  return new ImageResponse(
    heroCardLayout({
      dev: loaded.dev,
      width: size.width,
      height: size.height,
      statLabels: { contribs: "CONTRIBS", repos: "REPOS", stars: "STARS", kudos: "KUDOS" },
      footerRight: `thegitcity.com/dev/${loaded.dev.github_login}`,
    }),
    { ...size, fonts }
  );
}
