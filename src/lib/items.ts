import { getSupabaseAdmin } from "./supabase";

// ─── Types ───────────────────────────────────────────────────

export interface ShopItem {
  id: string;
  category: "effect" | "structure" | "identity";
  name: string;
  description: string | null;
  price_usd_cents: number;
  price_brl_cents: number;
  is_active: boolean;
  zone: "crown" | "roof" | "aura" | "faces" | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface PurchaseRecord {
  id: string;
  developer_id: number;
  item_id: string;
  provider: "stripe" | "abacatepay" | "free" | "achievement";
  provider_tx_id: string | null;
  amount_cents: number;
  currency: "usd" | "brl";
  status: "pending" | "completed" | "expired" | "refunded";
  created_at: string;
}

export type OwnedItems = string[];

// ─── Helpers ─────────────────────────────────────────────────

export async function getOwnedItems(developerId: number): Promise<string[]> {
  const sb = getSupabaseAdmin();

  const { data } = await sb
    .from("purchases")
    .select("item_id")
    .eq("developer_id", developerId)
    .eq("status", "completed");

  return (data ?? []).map((row) => row.item_id);
}

/** Item granted for free when a developer first claims their building. */
export const FREE_CLAIM_ITEM = "flag";

/**
 * Grant the free claim item to a developer.
 * No-ops if they already own it (idempotent).
 * Returns true if the item was granted, false if already owned.
 */
export async function grantFreeClaimItem(
  developerId: number
): Promise<boolean> {
  const sb = getSupabaseAdmin();

  // Check if already owned
  const { data: existing } = await sb
    .from("purchases")
    .select("id")
    .eq("developer_id", developerId)
    .eq("item_id", FREE_CLAIM_ITEM)
    .eq("status", "completed")
    .maybeSingle();

  if (existing) return false;

  await sb.from("purchases").insert({
    developer_id: developerId,
    item_id: FREE_CLAIM_ITEM,
    provider: "free",
    provider_tx_id: `free_claim_${developerId}`,
    amount_cents: 0,
    currency: "usd",
    status: "completed",
  });

  return true;
}

/**
 * Auto-equip an item if the developer has only one item in its zone.
 * Called after a purchase is completed (buy or gift).
 */
export async function autoEquipIfSolo(
  developerId: number,
  itemId: string
): Promise<void> {
  const { ZONE_ITEMS } = await import("./zones");

  // Find which zone this item belongs to
  let zone: string | null = null;
  for (const [z, ids] of Object.entries(ZONE_ITEMS)) {
    if (ids.includes(itemId)) { zone = z; break; }
  }
  if (!zone) return; // faces or unknown zone, skip

  const sb = getSupabaseAdmin();

  // Get all owned items in this zone
  const { data: purchases } = await sb
    .from("purchases")
    .select("item_id")
    .eq("developer_id", developerId)
    .eq("status", "completed");

  const zoneItems = ZONE_ITEMS[zone];
  const ownedInZone = (purchases ?? [])
    .map((p) => p.item_id)
    .filter((id) => zoneItems.includes(id));

  if (ownedInZone.length !== 1) return; // 0 or 2+ items, don't auto-equip

  // Get current loadout
  const { data: existing } = await sb
    .from("developer_customizations")
    .select("config")
    .eq("developer_id", developerId)
    .eq("item_id", "loadout")
    .maybeSingle();

  const config = (existing?.config ?? { crown: null, roof: null, aura: null }) as Record<string, string | null>;
  config[zone] = itemId;

  await sb.from("developer_customizations").upsert(
    {
      developer_id: developerId,
      item_id: "loadout",
      config,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "developer_id,item_id" }
  );
}

export async function getOwnedItemsForDevelopers(
  developerIds: number[]
): Promise<Record<number, string[]>> {
  if (developerIds.length === 0) return {};

  const sb = getSupabaseAdmin();

  const { data } = await sb
    .from("purchases")
    .select("developer_id, item_id")
    .in("developer_id", developerIds)
    .eq("status", "completed");

  const result: Record<number, string[]> = {};
  for (const row of data ?? []) {
    if (!result[row.developer_id]) {
      result[row.developer_id] = [];
    }
    result[row.developer_id].push(row.item_id);
  }
  return result;
}
