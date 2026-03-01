import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase";
import { SKY_AD_PLANS, isValidPlanId, getPriceCents, type AdCurrency } from "@/lib/skyAdPlans";
import { MAX_TEXT_LENGTH } from "@/lib/skyAds";
import { rateLimit } from "@/lib/rate-limit";
import { containsBlockedContent } from "@/lib/ad-moderation";

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
    return NextResponse.json(
      { error: "Too many requests. Try again in a few seconds." },
      { status: 429 }
    );
  }

  let body: {
    plan_id?: string;
    text?: string;
    color?: string;
    bgColor?: string;
    currency?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { plan_id, text, color, bgColor } = body;

  // Brazilian Stripe CNPJ can't charge USD to Brazilian cards.
  // Detect country via Vercel/CF geolocation headers and force BRL for BR users.
  const country =
    request.headers.get("x-vercel-ip-country") ??
    request.headers.get("cf-ipcountry") ??
    "";
  const isBrazil = country.toUpperCase() === "BR";
  const currency: AdCurrency = isBrazil ? "brl" : body.currency === "brl" ? "brl" : "usd";

  // Validate plan
  if (!plan_id || !isValidPlanId(plan_id)) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  // Validate text
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return NextResponse.json({ error: "Text is required" }, { status: 400 });
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return NextResponse.json(
      { error: `Text must be ${MAX_TEXT_LENGTH} characters or less` },
      { status: 400 }
    );
  }

  // Moderate text content
  const modResult = containsBlockedContent(text);
  if (modResult.blocked) {
    return NextResponse.json(
      { error: modResult.reason ?? "Ad text not allowed" },
      { status: 400 }
    );
  }

  // Validate colors
  if (!color || !HEX_COLOR.test(color)) {
    return NextResponse.json({ error: "Invalid text color (use #RRGGBB)" }, { status: 400 });
  }
  if (!bgColor || !HEX_COLOR.test(bgColor)) {
    return NextResponse.json({ error: "Invalid background color (use #RRGGBB)" }, { status: 400 });
  }

  const plan = SKY_AD_PLANS[plan_id];
  const sb = getSupabaseAdmin();

  // Generate IDs
  const adId = "ad-" + generateToken().slice(0, 16);
  const trackingToken = generateToken();

  // Create inactive sky_ad row (brand/description/link set post-checkout)
  const { error: insertError } = await sb.from("sky_ads").insert({
    id: adId,
    text: text.trim(),
    brand: null,
    description: null,
    color,
    bg_color: bgColor,
    link: null,
    vehicle: plan.vehicle,
    priority: 50,
    active: false,
    plan_id,
    tracking_token: trackingToken,
  });

  if (insertError) {
    console.error("Failed to create sky_ad:", insertError);
    return NextResponse.json({ error: "Failed to create ad" }, { status: 500 });
  }

  // Create Stripe checkout session
  const stripe = getStripe();
  const baseUrl = getBaseUrl();

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60, // 30 min
      line_items: [
        {
          price_data: {
            currency,
            product_data: {
              name: `Git City Ad: ${plan.label}`,
              description: `${plan.label} ad for ${plan.duration_days} days on Git City`,
            },
            unit_amount: getPriceCents(plan_id, currency),
          },
          quantity: 1,
        },
      ],
      metadata: {
        sky_ad_id: adId,
        type: "sky_ad",
      },
      success_url: `${baseUrl}/advertise/setup/${trackingToken}`,
      cancel_url: `${baseUrl}/advertise`,
    });

    // Store stripe session ID on the ad row
    await sb
      .from("sky_ads")
      .update({ stripe_session_id: session.id })
      .eq("id", adId);

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Stripe checkout creation failed:", err);
    // Clean up the orphaned row
    await sb.from("sky_ads").delete().eq("id", adId);
    return NextResponse.json({ error: "Payment setup failed" }, { status: 500 });
  }
}
