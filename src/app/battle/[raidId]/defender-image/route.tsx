import { renderBattleImage } from "@/lib/og/battleImage";

// The battle card from the defender's side, used as the raid alert email hero.
export async function GET(_req: Request, { params }: { params: Promise<{ raidId: string }> }) {
  const { raidId } = await params;
  const image = await renderBattleImage(raidId, "defender");
  image.headers.set("Cache-Control", "public, max-age=31536000, immutable");
  return image;
}
