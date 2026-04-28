import { NextRequest, NextResponse } from "next/server";
import { getAddress } from "viem";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { rateLimit } from "@/lib/rate-limit";
import { quoteGitcWeiForUsdCents, getCurrentBaseBlock } from "@/lib/gitc-server";
import { GITC_QUOTE_TTL_SECONDS, GITC_TREASURY_ADDRESS, isGitcEnabled } from "@/lib/gitc";

const WALLET_RE = /^0x[a-fA-F0-9]{40}$/;

function generateToken(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  for (const b of bytes) token += chars[b % chars.length];
  return token;
}

interface PackageRow {
  id: string;
  price_usd_cents: number;
  pixels: number;
  bonus_pixels: number;
}

interface DevRow {
  id: number;
  claimed: boolean;
  claimed_by: string | null;
  suspended: boolean;
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  const { ok } = rateLimit(`pixels-gitc-quote:${user.id}:${ip}`, 3, 10_000);
  if (!ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: { package_id?: string; wallet?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { package_id, wallet } = body;
  if (!package_id || typeof package_id !== "string") {
    return NextResponse.json({ error: "package_id required" }, { status: 400 });
  }
  if (!wallet || !WALLET_RE.test(wallet)) {
    return NextResponse.json({ error: "Connect a wallet first" }, { status: 400 });
  }

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
    .select("id, claimed, claimed_by, suspended")
    .eq("github_login", githubLogin)
    .single<DevRow>();

  if (!dev || !dev.claimed || dev.claimed_by !== user.id) {
    return NextResponse.json({ error: "You must claim your building first" }, { status: 403 });
  }
  if (dev.suspended) {
    return NextResponse.json({ error: "Account suspended" }, { status: 403 });
  }

  const { data: pkg } = await sb
    .from("pixel_packages")
    .select("id, price_usd_cents, pixels, bonus_pixels")
    .eq("id", package_id)
    .eq("is_active", true)
    .single<PackageRow>();

  if (!pkg) {
    return NextResponse.json({ error: "Package not found" }, { status: 404 });
  }

  if (!isGitcEnabled()) {
    return NextResponse.json({ error: "GITC payments are not configured" }, { status: 503 });
  }

  let quote;
  let quoteBlock: bigint;
  try {
    [quote, quoteBlock] = await Promise.all([
      quoteGitcWeiForUsdCents(pkg.price_usd_cents),
      getCurrentBaseBlock(),
    ]);
  } catch (err) {
    console.error("Failed to quote GITC:", err);
    return NextResponse.json({ error: "Could not fetch GITC price right now" }, { status: 503 });
  }

  const checksumWallet = getAddress(wallet).toLowerCase();
  const treasury = getAddress(GITC_TREASURY_ADDRESS).toLowerCase();
  const expiresAt = new Date(Date.now() + GITC_QUOTE_TTL_SECONDS * 1000);
  const quoteId = "pix-gitc-" + generateToken().slice(0, 24);

  // Create the pending pixel_purchase row first.
  const { data: purchase, error: purchaseErr } = await sb
    .from("pixel_purchases")
    .insert({
      developer_id: dev.id,
      package_id: pkg.id,
      provider: "gitc",
      provider_tx_id: quoteId,
      amount_cents: pkg.price_usd_cents,
      currency: "gitc",
      pixels_credited: 0,
      status: "pending",
    })
    .select("id")
    .single<{ id: string }>();

  if (purchaseErr || !purchase) {
    console.error("Failed to create pixel_purchase for GITC:", purchaseErr);
    return NextResponse.json({ error: "Failed to create purchase" }, { status: 500 });
  }

  const { error: insertQuoteError } = await sb.from("pixel_gitc_payments").insert({
    pixel_purchase_id: purchase.id,
    developer_id: dev.id,
    package_id: pkg.id,
    quote_id: quoteId,
    quote_block_number: Number(quoteBlock),
    wallet_address: checksumWallet,
    treasury_address: treasury,
    gitc_amount_wei: quote.gitcAmountWei.toString(),
    usd_quote_cents: pkg.price_usd_cents,
    gitc_price_usd_at_quote: quote.gitcPriceUsd,
    discount_bps: quote.discountBps,
    status: "pending",
    expires_at: expiresAt.toISOString(),
  });

  if (insertQuoteError) {
    console.error("Failed to create GITC quote:", insertQuoteError);
    await sb.from("pixel_purchases").delete().eq("id", purchase.id);
    return NextResponse.json({ error: "Failed to create quote" }, { status: 500 });
  }

  return NextResponse.json({
    quoteId,
    purchaseId: purchase.id,
    treasuryAddress: treasury,
    gitcAmountWei: quote.gitcAmountWei.toString(),
    gitcPriceUsd: quote.gitcPriceUsd,
    usdQuoteCents: pkg.price_usd_cents,
    discountBps: quote.discountBps,
    expiresAt: expiresAt.toISOString(),
    pixelsTotal: pkg.pixels + pkg.bonus_pixels,
  });
}
