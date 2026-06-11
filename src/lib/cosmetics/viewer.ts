import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getOwnedItems } from "@/lib/items";
import { getBalance } from "@/lib/pixels";
import { calcBuildingDims } from "@/lib/github";

// ─── Viewer cosmetic context ──────────────────────────────────────────────
// Everything the Store / Locker need about the person looking: their building
// (so cosmetics preview on THEIR tower, not a generic one), what they own,
// what they have equipped, and their PX balance. Null when logged out — the
// Store still renders the catalog, it just can't buy/equip.

export interface ViewerContext {
  developerId: number;
  githubLogin: string;
  claimed: boolean;
  dims: { width: number; height: number; depth: number };
  ownedItems: string[];
  loadout: { crown: string | null; roof: string | null; aura: string | null };
  customColor: string | null;
  billboardImages: string[];
  pxBalance: number;
  /** Stored streak freezes (a stackable consumable, 0-2). */
  streakFreezes: number;
}

export async function getViewerCosmeticContext(): Promise<ViewerContext | null> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const login = (
    user.user_metadata?.user_name ??
    user.user_metadata?.preferred_username ??
    ""
  ).toLowerCase();
  if (!login) return null;

  const sb = getSupabaseAdmin();
  const { data: dev } = await sb.from("developers").select("*").eq("github_login", login).single();
  if (!dev) return null;

  const [ownedItems, wallet, loadoutRow, customRows, topDev, topStars] = await Promise.all([
    getOwnedItems(dev.id),
    getBalance(dev.id),
    sb.from("developer_customizations").select("config").eq("developer_id", dev.id).eq("item_id", "loadout").maybeSingle(),
    sb.from("developer_customizations").select("item_id, config").eq("developer_id", dev.id).in("item_id", ["custom_color", "billboard"]),
    sb.from("developers").select("contributions").order("rank", { ascending: true }).limit(1).single(),
    sb.from("developers").select("total_stars").order("total_stars", { ascending: false }).limit(1).single(),
  ]);

  const dims = calcBuildingDims(
    dev.github_login, dev.contributions, dev.public_repos, dev.total_stars,
    topDev.data?.contributions ?? dev.contributions,
    topStars.data?.total_stars ?? dev.total_stars,
  );

  let customColor: string | null = null;
  let billboardImages: string[] = [];
  for (const row of customRows.data ?? []) {
    const cfg = row.config as Record<string, unknown>;
    if (row.item_id === "custom_color" && typeof cfg?.color === "string") customColor = cfg.color;
    if (row.item_id === "billboard") {
      if (Array.isArray(cfg?.images)) billboardImages = cfg.images as string[];
      else if (typeof cfg?.image_url === "string") billboardImages = [cfg.image_url];
    }
  }

  const lo = (loadoutRow.data?.config as { crown: string | null; roof: string | null; aura: string | null } | null) ?? null;

  return {
    developerId: dev.id,
    githubLogin: dev.github_login,
    claimed: !!dev.claimed,
    dims: { width: dims.width, height: dims.height, depth: dims.depth },
    ownedItems,
    loadout: lo ?? { crown: null, roof: null, aura: null },
    customColor,
    billboardImages,
    pxBalance: wallet.balance,
    streakFreezes: dev.streak_freezes_available ?? 0,
  };
}
