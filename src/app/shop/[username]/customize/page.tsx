import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getViewerCosmeticContext } from "@/lib/cosmetics/viewer";
import { getCosmeticsByIds } from "@/lib/cosmetics/catalog";
import type { LoadoutPreset } from "@/app/api/loadout/presets/route";
import LockerClient from "@/components/cosmetics/LockerClient";

interface Props { params: Promise<{ username: string }> }

const ACCENT = "#c8e64a";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  return { title: `Customize - @${username} - Git City` };
}

// Customize: manage + equip what you own. Owner-gated, the counterpart to the
// public Shop. Equipping routes through /api/loadout; saved looks through
// /api/loadout/presets.
export default async function CustomizePage({ params }: Props) {
  const { username } = await params;

  const sb = getSupabaseAdmin();
  const { data: dev } = await sb.from("developers").select("github_login, claimed").eq("github_login", username.toLowerCase()).single();
  if (!dev) notFound();

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const authLogin = (user?.user_metadata?.user_name ?? user?.user_metadata?.preferred_username ?? "").toLowerCase();
  const isOwner = !!user && authLogin === dev.github_login.toLowerCase();

  if (!dev.claimed || !isOwner) {
    return (
      <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
        <div className="mx-auto max-w-2xl px-3 py-10">
          <div className="border-[3px] border-border bg-bg-raised p-8 text-center">
            <h1 className="text-lg text-cream">Customize Locked</h1>
            <p className="mt-3 text-[10px] text-muted normal-case">Only the building owner can customize it.</p>
            <Link href="/shop" className="btn-press mt-5 inline-block px-6 py-3 text-xs text-bg" style={{ backgroundColor: ACCENT, boxShadow: "3px 3px 0 0 #5a7a00" }}>Go to Shop</Link>
          </div>
        </div>
      </main>
    );
  }

  const viewer = await getViewerCosmeticContext();
  if (!viewer) notFound();

  const [ownedCosmetics, presetsRow, raidRow] = await Promise.all([
    getCosmeticsByIds(viewer.ownedItems),
    sb.from("developer_customizations").select("config").eq("developer_id", viewer.developerId).eq("item_id", "loadout_presets").maybeSingle(),
    sb.from("developer_customizations").select("config").eq("developer_id", viewer.developerId).eq("item_id", "raid_loadout").maybeSingle(),
  ]);
  const presets = (presetsRow.data?.config as { presets?: LoadoutPreset[] } | null)?.presets ?? [];
  const raidCfg = (raidRow.data?.config as { vehicle?: string; tag?: string } | null) ?? {};
  const initialRaidLoadout = { vehicle: raidCfg.vehicle ?? "airplane", tag: raidCfg.tag ?? "default" };

  return (
    <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
      <div className="mx-auto max-w-7xl px-3 py-6 sm:px-4 sm:py-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link href="/shop" className="mb-2 inline-block text-sm text-muted transition-colors hover:text-cream">&larr; Shop</Link>
            <h1 className="text-lg text-cream">Customize</h1>
            <p className="mt-0.5 text-[10px] text-muted normal-case">Equip what you own. Save your looks.</p>
          </div>
          <Link href={`/?user=${viewer.githubLogin}`} className="text-xs text-muted normal-case transition-colors hover:text-cream">View in city &rarr;</Link>
        </div>

        <LockerClient
          dims={viewer.dims}
          ownedCosmetics={ownedCosmetics}
          initialLoadout={viewer.loadout}
          customColor={viewer.customColor}
          billboardImages={viewer.billboardImages}
          initialPresets={presets}
          initialRaidLoadout={initialRaidLoadout}
          streakFreezes={viewer.streakFreezes}
        />
      </div>
    </main>
  );
}
