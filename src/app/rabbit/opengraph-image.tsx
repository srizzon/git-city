import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getSupabaseAdmin } from "@/lib/supabase";

export const alt = "The Other Side - Git City";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const [fontData, completerCount] = await Promise.all([
    readFile(join(process.cwd(), "public/fonts/Silkscreen-Regular.ttf")),
    process.env.NEXT_PUBLIC_SUPABASE_URL
      ? getSupabaseAdmin()
          .from("developers")
          .select("id", { count: "exact", head: true })
          .eq("rabbit_completed", true)
          .then(({ count }: { count: number | null }) => count ?? 0)
      : Promise.resolve(0),
  ]);

  const green = "#00ff41";
  const red = "#ff0000";
  const white = "#e8e8e8";

  const PX = 14;
  const rabbitPixels: [number, number, string][] = [
    // Ears
    [-2, -8, white], [-1, -8, white],  [1, -8, white], [2, -8, white],
    [-2, -7, white], [-1, -7, white],  [1, -7, white], [2, -7, white],
    [-2, -6, white], [-1, -6, white],  [1, -6, white], [2, -6, white],
    [-2, -5, white], [-1, -5, white],  [1, -5, white], [2, -5, white],
    // Head
    [-3, -4, white], [-2, -4, white], [-1, -4, white], [0, -4, white], [1, -4, white], [2, -4, white], [3, -4, white],
    [-3, -3, white], [-2, -3, red],   [-1, -3, white], [0, -3, white], [1, -3, white], [2, -3, red],   [3, -3, white],
    [-3, -2, white], [-2, -2, white], [-1, -2, white], [0, -2, white], [1, -2, white], [2, -2, white], [3, -2, white],
    // Body
    [-4, -1, white], [-3, -1, white], [-2, -1, white], [-1, -1, white], [0, -1, white], [1, -1, white], [2, -1, white], [3, -1, white], [4, -1, white],
    [-4,  0, white], [-3,  0, white], [-2,  0, white], [-1,  0, white], [0,  0, white], [1,  0, white], [2,  0, white], [3,  0, white], [4,  0, white],
    [-4,  1, white], [-3,  1, white], [-2,  1, white], [-1,  1, white], [0,  1, white], [1,  1, white], [2,  1, white], [3,  1, white], [4,  1, white],
    [-4,  2, white], [-3,  2, white], [-2,  2, white], [-1,  2, white], [0,  2, white], [1,  2, white], [2,  2, white], [3,  2, white], [4,  2, white],
    // Tail
    [-5, 0, white], [-6, 0, white], [-5, 1, white], [-6, 1, white],
    // Legs
    [-3, 3, white], [-2, 3, white],  [0, 3, white], [1, 3, white],  [2, 3, white], [3, 3, white],
  ];

  // Rabbit on the left side
  const RX = 240;
  const RY = 315;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          backgroundColor: "#000000",
          fontFamily: "Silkscreen",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Vignette */}
        <div style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.9) 100%)",
          display: "flex",
        }} />

        {/* Eye glow halos */}
        <div style={{
          position: "absolute",
          left: RX + (-2) * PX - 25,
          top: RY + (-3) * PX - 25,
          width: 60,
          height: 60,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255,0,0,0.3) 0%, transparent 70%)",
          display: "flex",
        }} />
        <div style={{
          position: "absolute",
          left: RX + (2) * PX - 25,
          top: RY + (-3) * PX - 25,
          width: 60,
          height: 60,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255,0,0,0.3) 0%, transparent 70%)",
          display: "flex",
        }} />

        {/* Body glow */}
        <div style={{
          position: "absolute",
          left: RX - 90,
          top: RY - 70,
          width: 180,
          height: 180,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255,255,255,0.07) 0%, transparent 70%)",
          display: "flex",
        }} />

        {/* Pixel rabbit */}
        {rabbitPixels.map(([px, py, color], i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: RX + px * PX - PX / 2,
              top: RY + py * PX - PX / 2,
              width: PX,
              height: PX,
              backgroundColor: color,
              display: "flex",
            }}
          />
        ))}

        {/* Right side: text */}
        <div style={{
          position: "absolute",
          right: 80,
          top: 0,
          bottom: 0,
          width: 700,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-end",
          gap: 30,
        }}>
          <span style={{ fontSize: 72, color: green, letterSpacing: "0.08em", textAlign: "right" }}>
            I FOUND IT.
          </span>
          <span style={{ fontSize: 28, color: "#444444", textAlign: "right" }}>
            Only {completerCount} {completerCount === 1 ? "has" : "have"}.
          </span>
        </div>

        {/* Bottom branding */}
        <div style={{
          position: "absolute",
          bottom: 30,
          right: 80,
          display: "flex",
        }}>
          <span style={{ fontSize: 16, color: "#222222" }}>
            thegitcity.com
          </span>
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
