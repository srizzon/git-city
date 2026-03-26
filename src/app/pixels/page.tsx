import type { Metadata } from "next";
import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getBalance } from "@/lib/pixels";
import PixelsStoreClient from "./PixelsStoreClient";

export const metadata: Metadata = {
  title: "Buy Pixels - Git City",
  description:
    "Get Pixels (PX) to unlock cosmetics, upgrades, and more for your building in Git City.",
};

export default async function PixelsPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const authLogin = (
    user?.user_metadata?.user_name ??
    user?.user_metadata?.preferred_username ??
    ""
  ).toLowerCase();

  const sb = getSupabaseAdmin();

  // Get developer + wallet
  let devId: number | null = null;
  let balance = 0;
  let githubLogin = "";

  if (user && authLogin) {
    const { data: dev } = await sb
      .from("developers")
      .select("id, github_login")
      .eq("github_login", authLogin)
      .single();

    if (dev) {
      devId = dev.id;
      githubLogin = dev.github_login;
      const wallet = await getBalance(dev.id);
      balance = wallet.balance;
    }
  }

  // Get packages
  const { data: packages } = await sb
    .from("pixel_packages")
    .select("*")
    .eq("is_active", true)
    .order("sort_order");

  // Get a few featured items to show "what you can buy"
  const { data: featuredItems } = await sb
    .from("items")
    .select("id, name, price_pixels, category")
    .eq("is_active", true)
    .not("price_pixels", "is", null)
    .order("price_pixels", { ascending: true })
    .limit(6);

  return (
    <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        {/* Back nav */}
        <Link
          href="/"
          className="mb-8 inline-block text-sm text-muted transition-colors hover:text-cream"
        >
          &larr; Back to City
        </Link>

        {/* Hero section */}
        <div className="mb-10 text-center">
          <h1 className="text-3xl sm:text-4xl text-cream mb-3">
            Pixels
          </h1>
          <p className="text-base sm:text-lg text-muted normal-case max-w-lg mx-auto leading-relaxed">
            The currency of Git City. Buy Pixels to unlock cosmetics,
            upgrades, and raid gear for your building.
          </p>
        </div>

        {/* Current balance */}
        {devId && (
          <div className="mb-10 border-[3px] border-lime/30 bg-lime/5 p-5 text-center">
            <p className="text-sm text-muted mb-1">Your Balance</p>
            <p className="text-3xl sm:text-4xl text-lime font-bold">
              {balance.toLocaleString()} <span className="text-xl text-lime/70">PX</span>
            </p>
          </div>
        )}

        {/* Package cards */}
        <PixelsStoreClient
          packages={packages ?? []}
          balance={balance}
          isAuthenticated={!!devId}
          githubLogin={githubLogin}
        />

        {/* What you can buy */}
        {featuredItems && featuredItems.length > 0 && (
          <div className="mt-12">
            <h2 className="text-xl text-cream mb-2 text-center">
              What Can You Buy?
            </h2>
            <p className="text-sm text-muted normal-case text-center mb-6">
              Spend Pixels in the Shop on cosmetics and upgrades
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {featuredItems.map((item) => (
                <div
                  key={item.id}
                  className="border-2 border-border bg-bg-raised p-4 text-center"
                >
                  <p className="text-sm text-cream mb-1">{item.name}</p>
                  <p className="text-base text-lime font-bold">
                    {item.price_pixels} PX
                  </p>
                  <p className="text-xs text-dim mt-1 normal-case">
                    {item.category}
                  </p>
                </div>
              ))}
            </div>

            {githubLogin && (
              <div className="text-center mt-5">
                <Link
                  href={`/shop/${githubLogin}`}
                  className="btn-press inline-block px-8 py-3 text-sm text-bg"
                  style={{
                    backgroundColor: "#c8e64a",
                    boxShadow: "2px 2px 0 0 #5a7a00",
                  }}
                >
                  Visit Shop
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Earn section */}
        <div className="mt-12 border-[3px] border-border bg-bg-raised p-6">
          <h2 className="text-xl text-cream mb-2 text-center">
            Earn Pixels for Free
          </h2>
          <p className="text-sm text-muted normal-case text-center mb-6">
            Play Git City daily to earn Pixels without spending a dime
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-4 border-2 border-border bg-bg/50">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm text-cream">Daily Missions</p>
                <p className="text-sm text-lime font-bold">+5 PX</p>
              </div>
              <p className="text-xs text-muted normal-case">
                Complete 3 daily missions
              </p>
            </div>

            <div className="p-4 border-2 border-border bg-bg/50">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm text-cream">Raids</p>
                <p className="text-sm text-lime font-bold">+2 PX</p>
              </div>
              <p className="text-xs text-muted normal-case">
                Attack other buildings
              </p>
            </div>

            <div className="p-4 border-2 border-border bg-bg/50">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm text-cream">Streak Milestones</p>
                <p className="text-sm text-lime font-bold">+3~35 PX</p>
              </div>
              <p className="text-xs text-muted normal-case">
                Bonus at 3, 7, 14, and 30 day streaks
              </p>
            </div>

            <div className="p-4 border-2 border-border bg-bg/50">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm text-cream">Visit Profiles</p>
                <p className="text-sm text-lime font-bold">+1 PX</p>
              </div>
              <p className="text-xs text-muted normal-case">
                Explore other developers&apos; buildings
              </p>
            </div>
          </div>

          <p className="text-xs text-dim normal-case text-center mt-5">
            Earn up to ~15 PX per day through gameplay. Daily cap: 50 PX.
          </p>
        </div>

        {/* Payment methods */}
        <div className="mt-10 text-center">
          <p className="text-xs text-dim normal-case">
            Secure payments via Stripe (credit card) and PIX (Brazil).
            All purchases are final.
          </p>
        </div>
      </div>
    </main>
  );
}
