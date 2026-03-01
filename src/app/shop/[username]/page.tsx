import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getOwnedItems } from "@/lib/items";
import type { ShopItem } from "@/lib/items";
import { calcBuildingDims } from "@/lib/github";
import ShopClient from "@/components/ShopClient";

interface Props {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ purchased?: string; gifted?: string; to?: string }>;
}

async function getDeveloper(username: string) {
  const sb = getSupabaseAdmin();
  const { data } = await sb
    .from("developers")
    .select("*")
    .eq("github_login", username.toLowerCase())
    .single();
  return data;
}

async function getActiveItems(): Promise<ShopItem[]> {
  const sb = getSupabaseAdmin();
  const { data } = await sb
    .from("items")
    .select("*")
    .eq("is_active", true)
    .order("category")
    .order("price_usd_cents");
  return (data ?? []) as ShopItem[];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const dev = await getDeveloper(username);

  if (!dev) {
    return { title: "Developer Not Found | 开发者不存在 - Git City" };
  }

  return {
    title: `Shop - @${dev.github_login} | 商店 - @${dev.github_login} - Git City`,
    description: `Customize @${dev.github_login}'s building in Git City | 自定义 @${dev.github_login} 的建筑 - Git City`,
  };
}

const ACCENT = "#c8e64a";

export default async function ShopPage({ params, searchParams }: Props) {
  const { username } = await params;
  const { purchased: purchasedItem, gifted: giftedItem, to: giftedTo } = await searchParams;
  const dev = await getDeveloper(username);

  if (!dev) notFound();

  // Check if the logged-in user owns this building
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const authLogin = (
    user?.user_metadata?.user_name ??
    user?.user_metadata?.preferred_username ??
    ""
  ).toLowerCase();
  const isOwner = !!user && authLogin === dev.github_login.toLowerCase();

  // Not the owner or not claimed — show message
  if (!dev.claimed || !isOwner) {
    return (
      <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
        <div className="mx-auto max-w-2xl px-3 py-6 sm:px-4 sm:py-10">
          <Link
            href={`/dev/${dev.github_login}`}
            className="mb-6 inline-block text-sm text-muted transition-colors hover:text-cream sm:mb-8"
          >
            &larr; Back to Profile
          </Link>

          <div className="border-[3px] border-border bg-bg-raised p-6 text-center sm:p-10">
            <h1 className="text-lg text-cream">Shop Locked</h1>
            <p className="mt-3 text-[10px] text-muted normal-case">
              {!dev.claimed
                ? `@${dev.github_login} needs to claim their building before the shop is available.`
                : "Only the building owner can customize it. Sign in with the matching GitHub account."}
            </p>
            <Link
              href={`/dev/${dev.github_login}`}
              className="btn-press mt-5 inline-block px-6 py-3 text-xs text-bg"
              style={{
                backgroundColor: ACCENT,
                boxShadow: "3px 3px 0 0 #5a7a00",
              }}
            >
              View Profile | 查看个人资料
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const sb = getSupabaseAdmin();

  const [items, ownedItems, customizationsResult, billboardPurchasesResult, topDevResult, topStarsResult, achievementsResult, loadoutResult, raidLoadoutResult, allPurchasesResult] = await Promise.all([
    getActiveItems(),
    getOwnedItems(dev.id),
    sb
      .from("developer_customizations")
      .select("item_id, config")
      .eq("developer_id", dev.id)
      .in("item_id", ["custom_color", "billboard"]),
    sb
      .from("purchases")
      .select("id", { count: "exact", head: true })
      .eq("developer_id", dev.id)
      .eq("item_id", "billboard")
      .eq("status", "completed"),
    sb
      .from("developers")
      .select("contributions")
      .order("rank", { ascending: true })
      .limit(1)
      .single(),
    sb
      .from("developers")
      .select("total_stars")
      .order("total_stars", { ascending: false })
      .limit(1)
      .single(),
    sb
      .from("developer_achievements")
      .select("achievement_id")
      .eq("developer_id", dev.id),
    sb
      .from("developer_customizations")
      .select("config")
      .eq("developer_id", dev.id)
      .eq("item_id", "loadout")
      .maybeSingle(),
    sb
      .from("developer_customizations")
      .select("config")
      .eq("developer_id", dev.id)
      .eq("item_id", "raid_loadout")
      .maybeSingle(),
    // A10+A13: Count purchases per item for popularity badges + social proof
    // 购买记录：获取所有已完成购买的物品ID和购买时间
    sb
      .from("purchases")
      .select("item_id, created_at")
      .eq("status", "completed"),
  ]);

  const achievements = (achievementsResult.data ?? []).map((a: { achievement_id: string }) => a.achievement_id);

  // A10: Compute top 3 most purchased items (min 5 purchases)
  // 购买记录：统计每个物品的购买次数
  const purchaseCounts: Record<string, number> = {};
  const weeklyPurchaseCounts: Record<string, number> = {};
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (const p of allPurchasesResult.data ?? []) {
    purchaseCounts[p.item_id] = (purchaseCounts[p.item_id] ?? 0) + 1;
    if (new Date(p.created_at).getTime() > weekAgo) {
      weeklyPurchaseCounts[p.item_id] = (weeklyPurchaseCounts[p.item_id] ?? 0) + 1;
    }
  }
  const popularItems = Object.entries(purchaseCounts)
    .filter(([, count]) => count >= 5)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id]) => id);
  const initialLoadout = (loadoutResult.data?.config as { crown: string | null; roof: string | null; aura: string | null } | null) ?? null;

  const billboardSlots = billboardPurchasesResult.count ?? 0;
  const maxContrib = topDevResult.data?.contributions ?? dev.contributions;
  const maxStars = topStarsResult.data?.total_stars ?? dev.total_stars;
  const buildingDims = calcBuildingDims(
    dev.github_login,
    dev.contributions,
    dev.public_repos,
    dev.total_stars,
    maxContrib,
    maxStars,
  );

  // Extract customization values
  // 自定义颜色：提取初始自定义颜色
  let initialCustomColor: string | null = null;
  let initialBillboardImages: string[] = [];
  for (const row of customizationsResult.data ?? []) {
    const config = row.config as Record<string, unknown>;
    if (row.item_id === "custom_color" && typeof config?.color === "string") {
      initialCustomColor = config.color;
    }
    if (row.item_id === "billboard") {
      // Support both new array format and legacy single image
      // 看板娘：提取初始看板娘图片URL
      if (Array.isArray(config?.images)) {
        initialBillboardImages = config.images as string[];
      } else if (typeof config?.image_url === "string") {
        initialBillboardImages = [config.image_url];
      }
    }
  }

  return (
    <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
      <div className="mx-auto max-w-2xl px-3 py-6 sm:px-4 sm:py-10 lg:max-w-[960px]">
        {/* Header */}
        <Link
          href={`/dev/${dev.github_login}`}
          className="mb-6 inline-block text-sm text-muted transition-colors hover:text-cream sm:mb-8"
        >
          &larr; Back to Profile
        </Link>

        {/* Profile mini-card */}
        <div className="mb-5 border-[3px] border-border bg-bg-raised p-4 sm:p-6">
          <div className="flex items-center gap-4">
            {dev.avatar_url && (
              <Image
                src={dev.avatar_url}
                alt={dev.github_login}
                width={56}
                height={56}
                className="border-[2px] border-border flex-shrink-0"
                style={{ imageRendering: "pixelated" }}
              />
            )}
            <div>
              <h1 className="text-lg text-cream">Shop</h1>
              <p className="mt-0.5 text-[10px] text-muted normal-case">
                Customize @{dev.github_login}&apos;s building in Git City
              </p>
            </div>
          </div>
        </div>

        {/* Shop items (client component) */}
        <ShopClient
          githubLogin={dev.github_login}
          developerId={dev.id}
          items={items}
          ownedItems={ownedItems}
          initialCustomColor={initialCustomColor}
          initialBillboardImages={initialBillboardImages}
          billboardSlots={billboardSlots}
          buildingDims={buildingDims}
          achievements={achievements}
          initialLoadout={initialLoadout}
          initialRaidLoadout={(raidLoadoutResult?.data?.config as { vehicle: string; tag: string }) ?? null}
          purchasedItem={purchasedItem ?? null}
          giftedItem={giftedItem ?? null}
          giftedTo={giftedTo ?? null}
          streakFreezesAvailable={dev.streak_freezes_available ?? 0}
          popularItems={popularItems}
          purchaseCounts={weeklyPurchaseCounts}
          totalPurchaseCounts={purchaseCounts}
        />

        {/* Back links */}
        <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-5">
          <Link
            href={`/dev/${dev.github_login}`}
            className="text-xs text-muted transition-colors hover:text-cream normal-case"
          >
            View profile | 查看个人资料 &rarr;
          </Link>
          <Link
            href={`/?user=${dev.github_login}`}
            className="text-xs text-muted transition-colors hover:text-cream normal-case"
          >
            View in city | 在Git City中查看 &rarr;
          </Link>
        </div>

        {/* Creator credit */}
        <div className="mt-10 border-t border-border/50 pt-4 text-center">
          <p className="text-[9px] text-muted normal-case">
            built by{" "}
            <a
              href="https://x.com/samuelrizzondev"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-cream"
              style={{ color: ACCENT }}
            >
              @samuelrizzondev
            </a>
            Sinicization Contribution by{" "}
            <a href="https://github.com/EndlessPixel"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-cream"
              style={{ color: ACCENT }}>@EndlessPixel
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}
