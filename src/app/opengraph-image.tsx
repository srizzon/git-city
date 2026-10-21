import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getSupabaseAdmin } from "@/lib/supabase";

export const alt = "Git City - Your GitHub as a 3D City";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 3600;

// The pixel city rising from a contribution graph (dot style), with the live
// headcount over the empty top left.
const INK = "#ecebe4";
const GREEN = "#5ce483";
const DARK = "#0c0d0b";
const SHADOW = "#2c2e29";

export default async function Image() {
  const [font, city, stats] = await Promise.all([
    readFile(join(process.cwd(), "public/fonts/Silkscreen-Bold.ttf")),
    readFile(join(process.cwd(), "public/og/home-city.jpg")),
    getSupabaseAdmin().from("city_stats").select("total_developers").eq("id", 1).maybeSingle(),
  ]);
  const total = stats.data?.total_developers ?? 0;
  const bg = `data:image/jpeg;base64,${city.toString("base64")}`;

  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", backgroundColor: "#141512", fontFamily: "Silkscreen" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={bg} width={size.width} height={size.height} style={{ position: "absolute", left: 0, top: 0 }} alt="" />
      <div style={{ position: "absolute", left: 56, top: 52, display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
        {total > 0 && (
          <div style={{ display: "flex", fontSize: 40, lineHeight: "48px", color: INK, textShadow: `5px 5px 0 ${SHADOW}` }}>
            {total.toLocaleString("en-US")} DEVS
          </div>
        )}
        <div style={{ display: "flex", marginTop: total > 0 ? 14 : 0, padding: "4px 14px 6px", backgroundColor: GREEN, boxShadow: `5px 5px 0 ${SHADOW}` }}>
          <div style={{ display: "flex", fontSize: 40, lineHeight: "48px", color: DARK }}>ONE CITY</div>
        </div>
      </div>
    </div>,
    { ...size, fonts: [{ name: "Silkscreen", data: font, weight: 700, style: "normal" }] },
  );
}
