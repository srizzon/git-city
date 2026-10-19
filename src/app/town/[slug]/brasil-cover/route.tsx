import { ImageResponse } from "next/og";
import { OG } from "@/lib/og/devHero";
import { BrasilPixels } from "@/lib/og/brasilPixels";
import { getLeagueBySlug } from "@/lib/leagues/service";
import { BRASIL_SLUG, getBrasilLayout } from "@/lib/towns/brasil-server";
import { COVER_H, COVER_W } from "@/lib/towns/cover-rules";

// The Brasil map's Discover card: every city lit, no words (the card holds the
// name). Drawn from the live map, so it never goes stale like a photo would.

export async function GET() {
  const league = await getLeagueBySlug(BRASIL_SLUG);
  const { layout } = league ? await getBrasilLayout(league.id) : { layout: null };
  const cities = layout ? [...layout.cities, layout.island] : [];
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: OG.bg }}>
      <BrasilPixels width={COVER_W} height={COVER_H - 40} scale={layout?.scale ?? 1} cities={cities} />
    </div>,
    { width: COVER_W, height: COVER_H, headers: { "Cache-Control": "public, max-age=600, s-maxage=600" } },
  );
}
