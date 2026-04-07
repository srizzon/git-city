import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";

// GET /api/arcade/shop — catalog + player inventory + balance
export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();

  const { data: dev } = await admin
    .from("developers")
    .select("id")
    .eq("claimed_by", user.id)
    .single();

  if (!dev) {
    return NextResponse.json({ error: "Developer not found" }, { status: 404 });
  }

  const [catalogRes, inventoryRes, walletRes] = await Promise.all([
    admin
      .from("arcade_shop_items")
      .select("id, category, name, file, rarity, price_px, default_color, no_tint, tags, slot")
      .eq("active", true)
      .order("category")
      .order("price_px"),
    admin
      .from("arcade_inventory")
      .select("item_id")
      .eq("developer_id", dev.id),
    admin
      .from("wallets")
      .select("balance")
      .eq("developer_id", dev.id)
      .maybeSingle(),
  ]);

  const owned = new Set((inventoryRes.data ?? []).map((r) => r.item_id));
  const items = (catalogRes.data ?? []).map((item) => ({
    ...item,
    owned: owned.has(item.id),
  }));

  return NextResponse.json({
    items,
    balance: walletRes.data?.balance ?? 0,
  }, {
    headers: { "Cache-Control": "private, max-age=10" },
  });
}

// POST /api/arcade/shop — buy an item (atomic: debit PX + grant item)
export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { item_id: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const itemId = String(body.item_id ?? "").trim();
  if (!itemId || itemId.length > 50) {
    return NextResponse.json({ error: "Invalid item_id" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  const { data: dev } = await admin
    .from("developers")
    .select("id")
    .eq("claimed_by", user.id)
    .single();

  if (!dev) {
    return NextResponse.json({ error: "Developer not found" }, { status: 404 });
  }

  // Atomic purchase: debit wallet + grant item + ledger entry in one SQL transaction.
  // Uses advisory lock on developer_id to prevent race conditions.
  const { data: result, error } = await admin.rpc("arcade_buy_item", {
    p_developer_id: dev.id,
    p_item_id: itemId,
  });

  if (error) {
    console.error("arcade_buy_item RPC error:", error);
    return NextResponse.json({ error: "Purchase failed" }, { status: 500 });
  }

  // The RPC returns a jsonb with either { error: "..." } or { success: true, ... }
  if (result?.error) {
    const errMap: Record<string, { status: number; msg: string }> = {
      item_not_found: { status: 404, msg: "Item not found" },
      already_owned: { status: 409, msg: "Already owned" },
      insufficient_balance: { status: 402, msg: "Insufficient PX" },
      wallet_not_found: { status: 404, msg: "Wallet not found" },
    };
    const mapped = errMap[result.error] ?? { status: 400, msg: result.error };
    return NextResponse.json({ error: mapped.msg }, { status: mapped.status });
  }

  return NextResponse.json({
    purchased: itemId,
    balance: result?.new_balance ?? 0,
    price: result?.price ?? 0,
  });
}
