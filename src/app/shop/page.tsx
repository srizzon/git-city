import type { Metadata } from "next";
import { headers } from "next/headers";
import { queryCatalog, listSets, getCosmeticsByIds, encodeCursor } from "@/lib/cosmetics/catalog";
import { getViewerCosmeticContext } from "@/lib/cosmetics/viewer";
import ShopExperience from "@/components/cosmetics/ShopExperience";

export const metadata: Metadata = {
  title: "Shop - Git City",
  description: "Customize your building. Crowns, auras, rooftops and more, previewed live in 3D.",
};

// The Shop: public discovery + buy. Separated from Customize (manage/equip)
// per the Riot/Valorant lesson — two screens, two jobs. The catalog streams in
// paginated; this server pass seeds the first page + the viewer context, then a
// client shell (ShopExperience) drives the live wallet, category tabs, etc.
export default async function ShopPage() {
  const hdrs = await headers();
  const serverCountry = hdrs.get("x-vercel-ip-country");

  const [viewer, firstPage, sets] = await Promise.all([
    getViewerCosmeticContext(),
    queryCatalog({ section: "building", availableOnly: true, limit: 24 }),
    listSets(),
  ]);

  // Resolve the viewer's currently equipped cosmetics so previews show new
  // items over their actual look (Rocket League pattern), not a bare tower.
  const ownedForLook = viewer
    ? await getCosmeticsByIds(
        [viewer.loadout.crown, viewer.loadout.roof, viewer.loadout.aura, "led_banner", "billboard", "custom_color"]
          .filter((x): x is string => !!x && viewer.ownedItems.includes(x))
      )
    : [];

  return (
    <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
      <div className="mx-auto max-w-7xl px-3 py-6 sm:px-4 sm:py-8">
        <ShopExperience
          viewer={viewer}
          initialItems={firstPage.items}
          initialCursor={encodeCursor(firstPage.nextCursor)}
          sets={sets}
          ownedLookCosmetics={ownedForLook}
          serverCountry={serverCountry}
        />
      </div>
    </main>
  );
}
