import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const maxDuration = 30;

export async function GET() {
  const sb = getSupabaseAdmin();

  // Single RPC call — 1 HTTP request, 1 SQL execution, all data returned
  const { data, error } = await sb.rpc("get_city_snapshot");

  if (error) {
    console.error("get_city_snapshot RPC failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch city data", details: error.message },
      { status: 500 }
    );
  }

  const { developers, purchases, gift_purchases, customizations, achievements, raid_tags, stats } = data as {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    developers: Record<string, any>[];
    purchases: { developer_id: number; item_id: string }[];
    gift_purchases: { gifted_to: number; item_id: string }[];
    customizations: { developer_id: number; item_id: string; config: Record<string, unknown> }[];
    achievements: { developer_id: number; achievement_id: string }[];
    raid_tags: { building_id: number; attacker_login: string; tag_style: string; expires_at: string }[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    stats: Record<string, any>;
  };

  if (!developers || developers.length === 0) {
    return NextResponse.json(
      { developers: [], stats: stats ?? { total_developers: 0, total_contributions: 0 } },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }
    );
  }

  // Build owned items map (direct purchases + received gifts)
  const ownedItemsMap: Record<number, string[]> = {};
  for (const r of purchases) {
    if (!ownedItemsMap[r.developer_id]) ownedItemsMap[r.developer_id] = [];
    ownedItemsMap[r.developer_id].push(r.item_id);
  }
  for (const r of gift_purchases) {
    if (!ownedItemsMap[r.gifted_to]) ownedItemsMap[r.gifted_to] = [];
    ownedItemsMap[r.gifted_to].push(r.item_id);
  }

  // Build customization maps
  const customColorMap: Record<number, string> = {};
  const billboardImagesMap: Record<number, string[]> = {};
  const loadoutMap: Record<number, { crown: string | null; roof: string | null; aura: string | null }> = {};
  for (const r of customizations) {
    if (r.item_id === "custom_color" && typeof r.config?.color === "string") {
      customColorMap[r.developer_id] = r.config.color;
    }
    if (r.item_id === "billboard") {
      if (Array.isArray(r.config?.images)) {
        billboardImagesMap[r.developer_id] = r.config.images as string[];
      } else if (typeof r.config?.image_url === "string") {
        billboardImagesMap[r.developer_id] = [r.config.image_url];
      }
    }
    if (r.item_id === "loadout") {
      loadoutMap[r.developer_id] = {
        crown: (r.config?.crown as string) ?? null,
        roof: (r.config?.roof as string) ?? null,
        aura: (r.config?.aura as string) ?? null,
      };
    }
  }

  // Build achievements map
  const achievementsMap: Record<number, string[]> = {};
  for (const r of achievements) {
    if (!achievementsMap[r.developer_id]) achievementsMap[r.developer_id] = [];
    achievementsMap[r.developer_id].push(r.achievement_id);
  }

  // Build raid tags map (1 active tag per building)
  const raidTagMap: Record<number, { attacker_login: string; tag_style: string; expires_at: string }> = {};
  for (const r of raid_tags) {
    raidTagMap[r.building_id] = {
      attacker_login: r.attacker_login,
      tag_style: r.tag_style,
      expires_at: r.expires_at,
    };
  }

  // Merge everything onto each developer
  const developersWithItems = developers.map((dev) => ({
    ...dev,
    owned_items: ownedItemsMap[dev.id] ?? [],
    custom_color: customColorMap[dev.id] ?? null,
    billboard_images: billboardImagesMap[dev.id] ?? [],
    achievements: achievementsMap[dev.id] ?? [],
    loadout: loadoutMap[dev.id] ?? null,
    active_raid_tag: raidTagMap[dev.id] ?? null,
  }));

  return NextResponse.json(
    {
      developers: developersWithItems,
      stats: stats ?? { total_developers: 0, total_contributions: 0 },
      _debug: {
        devs: developers.length,
        purchases: purchases.length,
        giftPurchases: gift_purchases.length,
        customizations: customizations.length,
        achievements: achievements.length,
        raidTags: raid_tags.length,
      },
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    }
  );
}
