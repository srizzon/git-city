import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  SKY_AD_PLANS, isValidPlanId, isValidPeriod, getPriceCents,
  ONE_OFF_PERIODS, type AdCurrency, type AdPeriod, type SkyAdPlanId,
} from "@/lib/skyAdPlans";
import { MAX_TEXT_LENGTH } from "@/lib/skyAds";
import { rateLimit } from "@/lib/rate-limit";
import { containsBlockedContent, isSuspiciousLink } from "@/lib/ad-moderation";
import { getAdvertiserFromCookies } from "@/lib/advertiser-auth";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

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

  const { ok } = rateLimit(`checkout:${ip}`, 1, 10_000);
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
    currency?: string;
    link?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { plan_id, text, color, bgColor } = body;
  const period: AdPeriod = body.period && isValidPeriod(body.period) ? body.period as AdPeriod : "1m";

  // Detect currency
  const geoCountry =
    request.headers.get("x-vercel-ip-country") ??
    request.headers.get("cf-ipcountry") ??
    "";
  const isBrazil = geoCountry.toUpperCase() === "BR";
  const currency: AdCurrency = isBrazil ? "brl" : body.currency === "brl" ? "brl" : "usd";

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
  const priceCents = getPriceCents(plan_id, currency, period);
  const sb = getSupabaseAdmin();

  // Check if user is logged in as advertiser
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
    currency,
  });

  if (insertError) {
    console.error("Failed to create sky_ad:", insertError);
    return NextResponse.json({ error: "Failed to create ad" }, { status: 500 });
  }

  const baseUrl = getBaseUrl();
  const isOneOff = (ONE_OFF_PERIODS as readonly string[]).includes(period);
  const successUrl = advertiser
    ? `${baseUrl}/ads/dashboard/${adId}`
    : `${baseUrl}/advertise/setup/${trackingToken}`;
  const cancelUrl = advertiser ? `${baseUrl}/ads/dashboard/new` : `${baseUrl}/advertise`;

  try {
    const stripe = getStripe();
    const metadata = {
      sky_ad_id: adId,
      type: "sky_ad",
      period,
    };

    let session;

    if (isOneOff) {
      // One-time payment
      session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [
          {
            price_data: {
              currency,
              product_data: {
                name: `Git City Ad: ${plan.label} (${period})`,
                description: `${plan.label} ad on Git City for ${period}`,
              },
              unit_amount: priceCents,
            },
            quantity: 1,
          },
        ],
        allow_promotion_codes: true,
        metadata,
        success_url: successUrl,
        cancel_url: cancelUrl,
      });
    } else {
      // Monthly subscription
      session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [
          {
            price_data: {
              currency,
              product_data: {
                name: `Git City Ad: ${plan.label}`,
                description: `${plan.label} ad subscription on Git City`,
              },
              unit_amount: priceCents,
              recurring: { interval: "month", interval_count: 1 },
            },
            quantity: 1,
          },
        ],
        allow_promotion_codes: true,
        metadata,
        subscription_data: { metadata },
        success_url: successUrl,
        cancel_url: cancelUrl,
      });
    }

    await sb
      .from("sky_ads")
      .update({ stripe_session_id: session.id })
      .eq("id", adId);

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Sky ad checkout creation failed:", err);
    await sb.from("sky_ads").delete().eq("id", adId);
    return NextResponse.json({ error: "Payment setup failed" }, { status: 500 });
  }
}
