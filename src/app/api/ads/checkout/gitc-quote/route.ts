import { NextRequest, NextResponse } from "next/server";
import { getAddress } from "viem";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  SKY_AD_PLANS, isValidPlanId, isValidPeriod, getPriceCents,
  type AdPeriod,
} from "@/lib/skyAdPlans";
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

  const { ok } = rateLimit(`gitc-quote:${ip}`, 3, 10_000);
  if (!ok) {
    return NextResponse.json({ error: "Too many requests. Try again in a few seconds." }, { status: 429 });
  }

  let body: {
    plan_id?: string;
    period?: string;
    brand?: string;
    text?: string;
    description?: string;
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

  const { plan_id, text, color, bgColor, wallet } = body;
  const period: AdPeriod = body.period && isValidPeriod(body.period) ? body.period as AdPeriod : "1m";

  if (!plan_id || !isValidPlanId(plan_id)) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
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

  const plan = SKY_AD_PLANS[plan_id];
  const priceUsdCents = getPriceCents(plan_id, "usd", period);

  let quote;
  let quoteBlock: bigint;
  try {
    [quote, quoteBlock] = await Promise.all([
      quoteGitcWeiForUsdCents(priceUsdCents),
      getCurrentBaseBlock(),
    ]);
  } catch (err) {
    console.error("Failed to quote GITC:", err);
    return NextResponse.json({ error: "Could not fetch GITC price right now" }, { status: 503 });
  }

  const sb = getSupabaseAdmin();
  const advertiser = await getAdvertiserFromCookies();

  const adId = "ad-" + generateToken().slice(0, 16);
  const trackingToken = generateToken();
  const quoteId = "gitc-" + generateToken().slice(0, 24);

  const checksumWallet = getAddress(wallet).toLowerCase();
  const treasury = getAddress(GITC_TREASURY_ADDRESS).toLowerCase();
  const expiresAt = new Date(Date.now() + GITC_QUOTE_TTL_SECONDS * 1000);

  const { error: insertAdError } = await sb.from("sky_ads").insert({
    id: adId,
    text: text.trim(),
    brand: body.brand?.trim() || text.trim().slice(0, 40),
    description: body.description?.trim() || null,
    color,
    bg_color: bgColor,
    link: validatedLink,
    vehicle: plan.vehicle,
    priority: 50,
    active: false,
    plan_id,
    tracking_token: trackingToken,
    advertiser_id: advertiser?.id ?? null,
    amount_paid_cents: priceUsdCents,
    currency: "usd",
  });

  if (insertAdError) {
    console.error("Failed to create sky_ad for GITC payment:", insertAdError);
    return NextResponse.json({ error: "Failed to create ad" }, { status: 500 });
  }

  const { error: insertQuoteError } = await sb.from("ad_gitc_payments").insert({
    ad_id: adId,
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
    console.error("Failed to create GITC quote:", insertQuoteError);
    await sb.from("sky_ads").delete().eq("id", adId);
    return NextResponse.json({ error: "Failed to create quote" }, { status: 500 });
  }

  return NextResponse.json({
    quoteId,
    adId,
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
