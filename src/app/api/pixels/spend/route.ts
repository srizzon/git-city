import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { autoEquipIfSolo } from "@/lib/items";
import { sendPurchaseNotification, sendGiftSentNotification } from "@/lib/notification-senders/purchase";
import { sendGiftReceivedNotification } from "@/lib/notification-senders/gift";

const lastSpend = new Map<string, number>();

// Items that allow multiple purchases (consumables / multi-slot)
const MULTI_BUY_ITEMS = new Set(["streak_freeze", "billboard"]);

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Rate limit: 1 spend per 3 seconds per user
  const now = Date.now();
  const last = lastSpend.get(user.id);
  if (last && now - last < 3_000) {
    return NextResponse.json({ error: "Too fast. Wait a few seconds." }, { status: 429 });
  }
  lastSpend.set(user.id, now);

  const githubLogin = (
    user.user_metadata?.user_name ??
    user.user_metadata?.preferred_username ??
    ""
  ).toLowerCase();

  if (!githubLogin) {
    return NextResponse.json({ error: "No GitHub login found" }, { status: 400 });
  }

  const sb = getSupabaseAdmin();

  const { data: dev } = await sb
    .from("developers")
    .select("id, claimed, claimed_by, suspended, streak_freezes_available")
    .eq("github_login", githubLogin)
    .single();

  if (!dev || !dev.claimed || dev.claimed_by !== user.id) {
    return NextResponse.json({ error: "You must claim your building first" }, { status: 403 });
  }

  if (dev.suspended) {
    return NextResponse.json({ error: "Account suspended" }, { status: 403 });
  }

  let body: { item_id: string; gifted_to_login?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { item_id, gifted_to_login } = body;
  if (!item_id) {
    return NextResponse.json({ error: "Missing item_id" }, { status: 400 });
  }

  // Validate item exists and has PX price
  const { data: item } = await sb
    .from("items")
    .select("id, name, price_pixels, is_active, available_until, max_quantity")
    .eq("id", item_id)
    .eq("is_active", true)
    .single();

  if (!item || item.price_pixels == null) {
    return NextResponse.json({ error: "Item not found or not available for PX" }, { status: 404 });
  }

  // Scarcity checks
  if (item.available_until && new Date(item.available_until).getTime() <= Date.now()) {
    return NextResponse.json({ error: "This item is no longer available" }, { status: 410 });
  }
  if (item.max_quantity != null) {
    const { count: soldCount } = await sb
      .from("purchases")
      .select("id", { count: "exact", head: true })
      .eq("item_id", item_id)
      .eq("status", "completed");
    if ((soldCount ?? 0) >= item.max_quantity) {
      return NextResponse.json({ error: "This item is sold out" }, { status: 410 });
    }
  }

  // --- Streak freeze: max 2 stored ---
  if (item_id === "streak_freeze") {
    if ((dev.streak_freezes_available ?? 0) >= 2) {
      return NextResponse.json(
        { error: "Maximum 2 streak freezes stored" },
        { status: 409 },
      );
    }
  }

  // --- Billboard: max slots based on building dimensions ---
  if (item_id === "billboard") {
    const { count: billboardCount } = await sb
      .from("purchases")
      .select("id", { count: "exact", head: true })
      .eq("developer_id", dev.id)
      .eq("item_id", "billboard")
      .eq("status", "completed");

    const { data: devFull } = await sb
      .from("developers")
      .select("github_login, contributions, public_repos, total_stars, rank, contributions_total, contribution_years, total_prs, total_reviews, repos_contributed_to, followers, following, organizations_count, account_created_at, current_streak, longest_streak, active_days_last_year, language_diversity, top_repos")
      .eq("id", dev.id)
      .single();

    if (devFull) {
      const { calcBuildingDims } = await import("@/lib/github");
      const dims = calcBuildingDims(
        devFull.github_login,
        devFull.contributions,
        devFull.public_repos,
        devFull.total_stars,
        20_000,
        200_000,
        (devFull.contributions_total ?? 0) > 0 ? devFull : undefined,
      );
      const w = dims.width;
      const d = dims.depth;
      const h = dims.height;

      const minBillArea = 10 * 8;
      const totalFaceArea = 2 * (w + d) * h;
      const maxSlots = Math.max(1, Math.floor(totalFaceArea / (minBillArea * 6)));

      if ((billboardCount ?? 0) >= maxSlots) {
        return NextResponse.json(
          { error: `Max billboard slots reached (${maxSlots})` },
          { status: 409 },
        );
      }
    }
  }

  // Gift validation
  let recipientId: number | null = null;
  if (gifted_to_login) {
    if (gifted_to_login.toLowerCase() === githubLogin) {
      return NextResponse.json({ error: "Cannot gift to yourself" }, { status: 400 });
    }
    const { data: receiver } = await sb
      .from("developers")
      .select("id")
      .eq("github_login", gifted_to_login.toLowerCase())
      .single();
    if (!receiver) {
      return NextResponse.json({ error: "User not found in Git City" }, { status: 400 });
    }

    // Check receiver doesn't already own this item
    if (!MULTI_BUY_ITEMS.has(item_id)) {
      const { data: receiverOwnsBought } = await sb
        .from("purchases")
        .select("id")
        .eq("developer_id", receiver.id)
        .is("gifted_to", null)
        .eq("item_id", item_id)
        .eq("status", "completed")
        .maybeSingle();
      const { data: receiverOwnsGifted } = await sb
        .from("purchases")
        .select("id")
        .eq("gifted_to", receiver.id)
        .eq("item_id", item_id)
        .eq("status", "completed")
        .maybeSingle();

      if (receiverOwnsBought || receiverOwnsGifted) {
        return NextResponse.json({ error: "Receiver already owns this item" }, { status: 409 });
      }
    }

    recipientId = receiver.id;
  }

  // Call spend_pixels RPC via admin client (service_role)
  const allowMultiple = MULTI_BUY_ITEMS.has(item_id);
  const idempotencyKey = allowMultiple
    ? `buy:${item_id}:${dev.id}:${recipientId ?? "self"}:${Date.now()}`
    : `buy:${item_id}:${dev.id}:${recipientId ?? "self"}`;

  const { data, error } = await sb.rpc("spend_pixels", {
    p_developer_id: dev.id,
    p_item_id: item_id,
    p_idempotency_key: idempotencyKey,
    p_recipient_id: recipientId,
    p_allow_multiple: allowMultiple,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const result = data as { success?: boolean; error?: string; new_balance?: number; price?: number };
  if (result.error) {
    const statusMap: Record<string, number> = {
      item_not_found: 404,
      already_owned: 409,
      insufficient_balance: 402,
      wallet_not_found: 404,
      duplicate_transaction: 409,
    };
    return NextResponse.json(
      { error: result.error },
      { status: statusMap[result.error] ?? 400 },
    );
  }

  // --- Post-purchase side effects ---
  const ownerId = recipientId ?? dev.id;

  // Streak freeze: grant via RPC
  if (item_id === "streak_freeze") {
    await sb.rpc("grant_streak_freeze", { p_developer_id: ownerId });
    await sb.from("streak_freeze_log").insert({
      developer_id: ownerId,
      action: "purchased",
    });
  }

  // Auto-equip if only item in zone
  await autoEquipIfSolo(ownerId, item_id);

  // Activity feed + notifications
  if (recipientId) {
    const { data: receiver } = await sb
      .from("developers")
      .select("github_login")
      .eq("id", recipientId)
      .single();

    await sb.from("activity_feed").insert({
      event_type: "gift_sent",
      actor_id: dev.id,
      target_id: recipientId,
      metadata: {
        giver_login: githubLogin,
        receiver_login: receiver?.github_login ?? "unknown",
        item_id,
      },
    });

    sendGiftSentNotification(dev.id, githubLogin, receiver?.github_login ?? "unknown", idempotencyKey, item_id);
    sendGiftReceivedNotification(recipientId, githubLogin, receiver?.github_login ?? "unknown", idempotencyKey, item_id);
  } else {
    await sb.from("activity_feed").insert({
      event_type: "item_purchased",
      actor_id: dev.id,
      metadata: { login: githubLogin, item_id },
    });

    sendPurchaseNotification(dev.id, githubLogin, idempotencyKey, item_id);
  }

  return NextResponse.json({
    success: true,
    new_balance: result.new_balance,
    price: result.price,
  });
}
