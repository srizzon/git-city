import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createCheckoutSession } from "@/lib/stripe";
import { createPixQrCode } from "@/lib/abacatepay";

// Defense-in-depth: per-user rate limit IN ADDITION to the IP-based
// middleware rate limit.  This one is keyed by Supabase user ID so it
// catches authenticated abuse even when requests come from different IPs.
// Note: in-memory – resets on deploy / cold-start.  Acceptable because
// the middleware already provides the primary protection layer.
const lastCheckout = new Map<string, number>();

export async function POST(request: Request) {
  // Auth required
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Rate limit: 1 checkout per 10 seconds per user
  const now = Date.now();
  const last = lastCheckout.get(user.id);
  if (last && now - last < 10_000) {
    return NextResponse.json({ error: "Too fast. Wait a few seconds." }, { status: 429 });
  }
  lastCheckout.set(user.id, now);

  const githubLogin = (
    user.user_metadata?.user_name ??
    user.user_metadata?.preferred_username ??
    ""
  ).toLowerCase();

  if (!githubLogin) {
    return NextResponse.json({ error: "No GitHub login found" }, { status: 400 });
  }

  const sb = getSupabaseAdmin();

  // Validate user has claimed building
  const { data: dev } = await sb
    .from("developers")
    .select("id, claimed, claimed_by")
    .eq("github_login", githubLogin)
    .single();

  if (!dev || !dev.claimed) {
    return NextResponse.json(
      { error: "You must claim your building first" },
      { status: 403 }
    );
  }

  // Validate claimed_by matches user
  if (dev.claimed_by !== user.id) {
    return NextResponse.json(
      { error: "This building is not yours" },
      { status: 403 }
    );
  }

  // Parse body
  let body: { item_id: string; provider: "stripe" | "abacatepay"; gifted_to_login?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { item_id, provider, gifted_to_login } = body;

  if (!item_id || !provider || !["stripe", "abacatepay"].includes(provider)) {
    return NextResponse.json({ error: "Invalid item_id or provider" }, { status: 400 });
  }

  // Gift validation
  let giftedToDevId: number | null = null;
  if (gifted_to_login) {
    if (gifted_to_login.toLowerCase() === githubLogin) {
      return NextResponse.json({ error: "Cannot gift to yourself" }, { status: 400 });
    }

    const { data: receiver } = await sb
      .from("developers")
      .select("id, claimed")
      .eq("github_login", gifted_to_login.toLowerCase())
      .single();

    if (!receiver || !receiver.claimed) {
      return NextResponse.json({ error: "Receiver must have claimed building" }, { status: 400 });
    }

    // Check receiver doesn't already own this item
    const { data: receiverOwns } = await sb
      .from("purchases")
      .select("id")
      .eq("developer_id", receiver.id)
      .eq("item_id", item_id)
      .eq("status", "completed")
      .maybeSingle();

    if (receiverOwns) {
      return NextResponse.json({ error: "Receiver already owns this item" }, { status: 409 });
    }

    giftedToDevId = receiver.id;
  }

  // Validate item exists and is active
  const { data: item } = await sb
    .from("items")
    .select("*")
    .eq("id", item_id)
    .eq("is_active", true)
    .single();

  if (!item) {
    return NextResponse.json({ error: "Item not found or inactive" }, { status: 404 });
  }

  // Billboard allows multiple purchases (Times Square style)
  if (item_id === "billboard") {
    // Count existing completed billboard purchases
    const { count: billboardCount } = await sb
      .from("purchases")
      .select("id", { count: "exact", head: true })
      .eq("developer_id", dev.id)
      .eq("item_id", "billboard")
      .eq("status", "completed");

    // Fetch building dimensions to calculate max slots
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
        20_000, // maxContrib estimate
        200_000, // maxStars estimate
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
          { status: 409 }
        );
      }
    }
  } else {
    // Non-billboard items: check if already owned
    const { data: existingPurchase } = await sb
      .from("purchases")
      .select("id")
      .eq("developer_id", dev.id)
      .eq("item_id", item_id)
      .eq("status", "completed")
      .maybeSingle();

    if (existingPurchase) {
      return NextResponse.json({ error: "Already owned" }, { status: 409 });
    }
  }

  // Check for existing pending purchase (prevent double-click)
  const { data: pendingPurchase } = await sb
    .from("purchases")
    .select("id")
    .eq("developer_id", dev.id)
    .eq("item_id", item_id)
    .eq("status", "pending")
    .maybeSingle();

  if (pendingPurchase) {
    // Delete stale pending purchase to allow retry
    await sb.from("purchases").delete().eq("id", pendingPurchase.id);
  }

  try {
    if (provider === "stripe") {
      // Create pending purchase (always USD)
      const { data: purchase, error: purchaseError } = await sb
        .from("purchases")
        .insert({
          developer_id: dev.id,
          item_id,
          provider: "stripe",
          amount_cents: item.price_usd_cents,
          currency: "usd",
          status: "pending",
          ...(giftedToDevId ? { gifted_to: giftedToDevId } : {}),
        })
        .select("id")
        .single();

      if (purchaseError) {
        return NextResponse.json({ error: "Failed to create purchase" }, { status: 500 });
      }

      const { url } = await createCheckoutSession(item_id, dev.id, githubLogin, "usd", user.email, giftedToDevId);
      return NextResponse.json({ url, purchase_id: purchase.id });
    } else {
      // AbacatePay
      const { data: purchase, error: purchaseError } = await sb
        .from("purchases")
        .insert({
          developer_id: dev.id,
          item_id,
          provider: "abacatepay",
          amount_cents: item.price_brl_cents,
          currency: "brl",
          status: "pending",
          ...(giftedToDevId ? { gifted_to: giftedToDevId } : {}),
        })
        .select("id")
        .single();

      if (purchaseError) {
        return NextResponse.json({ error: "Failed to create purchase" }, { status: 500 });
      }

      const { brCode, brCodeBase64, pixId } = await createPixQrCode(item_id, dev.id, githubLogin);

      // Save PIX ID as provider_tx_id
      await sb
        .from("purchases")
        .update({ provider_tx_id: pixId })
        .eq("id", purchase.id);

      return NextResponse.json({ brCode, brCodeBase64, purchase_id: purchase.id });
    }
  } catch (err) {
    console.error("Checkout error:", err);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
