import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createPixQrCodeRaw } from "@/lib/abacatepay";
import {
  SKY_AD_PLANS, isValidPlanId, isValidPeriod, getPriceCents,
  type AdPeriod, type SkyAdPlanId,
} from "@/lib/skyAdPlans";
import { MAX_TEXT_LENGTH } from "@/lib/skyAds";
import { rateLimit } from "@/lib/rate-limit";
import { containsBlockedContent, isSuspiciousLink } from "@/lib/ad-moderation";
import { getAdvertiserFromCookies } from "@/lib/advertiser-auth";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

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

  const { ok } = rateLimit(`pix-checkout:${ip}`, 1, 10_000);
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
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { plan_id, text, color, bgColor } = body;
  const period: AdPeriod = body.period && isValidPeriod(body.period) ? body.period as AdPeriod : "1w";

  if (!plan_id || !isValidPlanId(plan_id)) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
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

  const plan = SKY_AD_PLANS[plan_id];
  const priceCents = getPriceCents(plan_id, "brl", period);
  const sb = getSupabaseAdmin();

  const advertiser = await getAdvertiserFromCookies();

  const adId = "ad-" + generateToken().slice(0, 16);
  const trackingToken = generateToken();

  const { error: insertError } = await sb.from("sky_ads").insert({
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
    amount_paid_cents: priceCents,
    currency: "brl",
  });

  if (insertError) {
    console.error("Failed to create sky_ad for PIX:", insertError);
    return NextResponse.json({ error: "Failed to create ad" }, { status: 500 });
  }

  try {
    const { brCode, brCodeBase64, pixId } = await createPixQrCodeRaw({
      amountCents: priceCents,
      description: `Git City Ad: ${plan.label} (${period})`,
      externalId: adId,
      extraMetadata: { period },
    });

    await sb.from("sky_ads").update({ pix_id: pixId }).eq("id", adId);

    return NextResponse.json({
      brCode,
      brCodeBase64,
      adId,
      trackingToken,
      isLoggedIn: !!advertiser,
    });
  } catch (err) {
    console.error("PIX QR code creation failed:", err);
    await sb.from("sky_ads").delete().eq("id", adId);
    return NextResponse.json({ error: "Failed to generate PIX code" }, { status: 500 });
  }
}
