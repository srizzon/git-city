import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { OG } from "@/lib/og/devHero";
import { getSupabaseAdmin } from "@/lib/supabase";

export const alt = "Git City - Your GitHub as a 3D City";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 3600;

// The whole Bay from above (a frame of the intro) with the live headcount.
export default async function Image() {
  const [font, bay, stats] = await Promise.all([
    readFile(join(process.cwd(), "public/fonts/Silkscreen-Regular.ttf")),
    readFile(join(process.cwd(), "public/og/home-bay.jpg")),
    getSupabaseAdmin().from("city_stats").select("total_developers").eq("id", 1).maybeSingle(),
  ]);
  const total = stats.data?.total_developers ?? 0;
  const bg = `data:image/jpeg;base64,${bay.toString("base64")}`;

  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", backgroundColor: OG.bg, fontFamily: "Silkscreen" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={bg} width={size.width} height={size.height} style={{ position: "absolute", left: 0, top: 0 }} alt="" />
      <div style={{ position: "absolute", left: 60, top: 50, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", fontSize: 96, lineHeight: 1 }}>
          <span style={{ color: OG.cream }}>GIT&nbsp;</span>
          <span style={{ color: OG.accent }}>CITY</span>
        </div>
        {total > 0 && (
          <div style={{ display: "flex", flexDirection: "column", marginTop: 26, fontSize: 34, lineHeight: 1.3 }}>
            <span style={{ color: OG.cream }}>{total.toLocaleString("en-US")} DEVELOPERS.</span>
            <span style={{ color: OG.accent }}>ONE CITY.</span>
          </div>
        )}
      </div>
    </div>,
    { ...size, fonts: [{ name: "Silkscreen", data: font, style: "normal" }] },
  );
}
