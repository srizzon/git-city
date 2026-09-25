import { BATTLE_IMAGE_SIZE, renderBattleImage } from "@/lib/og/battleImage";

export const alt = "Battle Result - Git City";
export const size = BATTLE_IMAGE_SIZE;
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ raidId: string }>;
}) {
  const { raidId } = await params;
  return renderBattleImage(raidId, "attacker");
}
