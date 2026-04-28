import { NextRequest, NextResponse } from "next/server";
import { getAddress } from "viem";
import { getSupabaseAdmin } from "@/lib/supabase";
import { AD_PACKAGES, isValidPackageId, getPackagePriceCents, type AdPackageId } from "@/lib/adPackages";
import { MAX_TEXT_LENGTH } from "@/lib/skyAds";
import { rateLimit } from "@/lib/rate-limit";
import { containsBlockedContent, isSuspiciousLink } from "@/lib/ad-moderation";
import { getAdvertiserFromCookies } from "@/lib/advertiser-auth";
import { quoteGitcWeiForUsdCents, getCurrentBaseBlock } from "@/lib/gitc-server";
import { GITC_QUOTE_TTL_SECONDS, GITC_TREASURY_ADDRESS, isGitcEnabled } from "@/lib/gitc";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const WALLET_RE = /^0x[a-fA-F0-9]{40}$/;

function generateToken(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  for (const b of bytes) token += chars[b % chars.length];
  return token;
}

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  const { ok } = rateLimit(`gitc-pkg-quote:${ip}`, 3, 10_000);
  if (!ok) {
    return NextResponse.json({ error: "Too many requests. Try again in a few seconds." }, { status: 429 });
  }

  let body: {
    package_id?: string;
    brand?: string;
    text?: string;
    color?: string;
    bgColor?: string;
    link?: string;
    wallet?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { package_id, text, color, bgColor, wallet } = body;

  if (!package_id || !isValidPackageId(package_id)) {
    return NextResponse.json({ error: "Invalid package" }, { status: 400 });
  }

  const pkg = AD_PACKAGES[package_id];

  // Landmark requires manual contact; not eligible for self-serve GITC checkout.
  if (pkg.landmark) {
    return NextResponse.json({ error: "Landmark package requires manual contact" }, { status: 400 });
  }

  if (!wallet || !WALLET_RE.test(wallet)) {
    return NextResponse.json({ error: "Connect a wallet first" }, { status: 400 });
  }
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return NextResponse.json({ error: "Text is required" }, { status: 400 });
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return NextResponse.json({ error: `Text must be ${MAX_TEXT_LENGTH} characters or less` }, { status: 400 });
  }

  const modResult = containsBlockedContent(text);
  if (modResult.blocked) {
    return NextResponse.json({ error: modResult.reason ?? "Ad text not allowed" }, { status: 400 });
  }

  if (!color || !HEX_COLOR.test(color)) {
    return NextResponse.json({ error: "Invalid text color (use #RRGGBB)" }, { status: 400 });
  }
  if (!bgColor || !HEX_COLOR.test(bgColor)) {
    return NextResponse.json({ error: "Invalid background color (use #RRGGBB)" }, { status: 400 });
  }

  let validatedLink: string | null = null;
  if (body.link && typeof body.link === "string" && body.link.trim().length > 0) {
    const trimmed = body.link.trim();
    if (!trimmed.startsWith("https://") && !trimmed.startsWith("mailto:")) {
      return NextResponse.json({ error: "Link must start with https:// or mailto:" }, { status: 400 });
    }
    if (isSuspiciousLink(trimmed)) {
      return NextResponse.json({ error: "Link looks suspicious and was blocked" }, { status: 400 });
    }
    validatedLink = trimmed;
  }

  if (!isGitcEnabled()) {
    return NextResponse.json({ error: "GITC payments are not configured" }, { status: 503 });
  }

  const priceUsdCents = getPackagePriceCents(package_id as AdPackageId, "usd");

  let quote;
  let quoteBlock: bigint;
  try {
    [quote, quoteBlock] = await Promise.all([
      quoteGitcWeiForUsdCents(priceUsdCents),
      getCurrentBaseBlock(),
    ]);
  } catch (err) {
    console.error("Failed to quote GITC for package:", err);
    return NextResponse.json({ error: "Could not fetch GITC price right now" }, { status: 503 });
  }

  const sb = getSupabaseAdmin();
  const advertiser = await getAdvertiserFromCookies();

  const checksumWallet = getAddress(wallet).toLowerCase();
  const treasury = getAddress(GITC_TREASURY_ADDRESS).toLowerCase();
  const expiresAt = new Date(Date.now() + GITC_QUOTE_TTL_SECONDS * 1000);
  const quoteId = "gitc-pkg-" + generateToken().slice(0, 24);

  // Create one inactive ad per vehicle in the package.
  const adIds: string[] = [];
  const trackingToken = generateToken();

  for (const vehicle of pkg.vehicles) {
    const adId = "ad-" + generateToken().slice(0, 16);
    adIds.push(adId);

    const { error: insertError } = await sb.from("sky_ads").insert({
      id: adId,
      text: text.trim(),
      brand: body.brand?.trim() || text.trim().slice(0, 40),
      color,
      bg_color: bgColor,
      link: validatedLink,
      vehicle,
      priority: 50,
      active: false,
      plan_id: `${vehicle}_monthly`,
      tracking_token: adId === adIds[0] ? trackingToken : generateToken(),
      advertiser_id: advertiser?.id ?? null,
      amount_paid_cents: 0,
      currency: "usd",
    });

    if (insertError) {
      console.error("Failed to create sky_ad for GITC package:", insertError);
      for (const createdId of adIds) {
        await sb.from("sky_ads").delete().eq("id", createdId);
      }
      return NextResponse.json({ error: "Failed to create ads" }, { status: 500 });
    }
  }

  const primaryAdId = adIds[0];

  const { error: insertQuoteError } = await sb.from("ad_gitc_payments").insert({
    ad_id: primaryAdId,
    package_id,
    package_ad_ids: adIds,
    quote_id: quoteId,
    quote_block_number: Number(quoteBlock),
    wallet_address: checksumWallet,
    treasury_address: treasury,
    gitc_amount_wei: quote.gitcAmountWei.toString(),
    usd_quote_cents: priceUsdCents,
    gitc_price_usd_at_quote: quote.gitcPriceUsd,
    discount_bps: quote.discountBps,
    status: "pending",
    expires_at: expiresAt.toISOString(),
  });

  if (insertQuoteError) {
    console.error("Failed to create GITC package quote:", insertQuoteError);
    for (const adId of adIds) {
      await sb.from("sky_ads").delete().eq("id", adId);
    }
    return NextResponse.json({ error: "Failed to create quote" }, { status: 500 });
  }

  return NextResponse.json({
    quoteId,
    primaryAdId,
    adIds,
    trackingToken,
    isLoggedIn: !!advertiser,
    treasuryAddress: treasury,
    gitcAmountWei: quote.gitcAmountWei.toString(),
    gitcPriceUsd: quote.gitcPriceUsd,
    usdQuoteCents: priceUsdCents,
    discountBps: quote.discountBps,
    expiresAt: expiresAt.toISOString(),
  });
}
