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
}

async function getDeveloper(username: string) {
  const supabase = await createServerSupabase();
  const { data } = await supabase
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
    return { title: "Developer Not Found - Git City" };
  }

  return {
    title: `Shop - @${dev.github_login} - Git City`,
    description: `Customize @${dev.github_login}'s building in Git City`,
  };
}

const ACCENT = "#c8e64a";

export default async function ShopPage({ params }: Props) {
  const { username } = await params;
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
              View Profile
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const sb = getSupabaseAdmin();

  const [items, ownedItems, customizationsResult, billboardPurchasesResult, topDevResult] = await Promise.all([
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
  ]);

  const billboardSlots = billboardPurchasesResult.count ?? 0;
  const maxContrib = topDevResult.data?.contributions ?? dev.contributions;
  const buildingDims = calcBuildingDims(
    dev.github_login,
    dev.contributions,
    dev.public_repos,
    maxContrib
  );

  // Extract customization values
  let initialCustomColor: string | null = null;
  let initialBillboardImages: string[] = [];
  for (const row of customizationsResult.data ?? []) {
    const config = row.config as Record<string, unknown>;
    if (row.item_id === "custom_color" && typeof config?.color === "string") {
      initialCustomColor = config.color;
    }
    if (row.item_id === "billboard") {
      // Support both new array format and legacy single image
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
                unoptimized
                className="border-[2px] border-border flex-shrink-0"
                style={{ imageRendering: "pixelated" }}
              />
            )}
            <div>
              <h1 className="text-lg text-cream">Shop</h1>
              <p className="mt-0.5 text-[10px] text-muted normal-case">
                Customize @{dev.github_login}&apos;s building
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
        />

        {/* Back links */}
        <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-5">
          <Link
            href={`/dev/${dev.github_login}`}
            className="text-xs text-muted transition-colors hover:text-cream normal-case"
          >
            View profile &rarr;
          </Link>
          <Link
            href={`/?user=${dev.github_login}`}
            className="text-xs text-muted transition-colors hover:text-cream normal-case"
          >
            View in city &rarr;
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
          </p>
        </div>
      </div>
    </main>
  );
}
