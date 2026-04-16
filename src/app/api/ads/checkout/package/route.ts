import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase";
import { AD_PACKAGES, isValidPackageId, getPackagePriceCents, type AdPackageId } from "@/lib/adPackages";
import type { AdCurrency } from "@/lib/skyAdPlans";
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

  const { ok } = rateLimit(`pkg-checkout:${ip}`, 1, 10_000);
  if (!ok) {
    return NextResponse.json({ error: "Too many requests. Try again in a few seconds." }, { status: 429 });
  }

  let body: {
    package_id?: string;
    brand?: string;
    text?: string;
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

  const { package_id, text, color, bgColor } = body;

  if (!package_id || !isValidPackageId(package_id)) {
    return NextResponse.json({ error: "Invalid package" }, { status: 400 });
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

  // Detect currency
  const geoCountry =
    request.headers.get("x-vercel-ip-country") ??
    request.headers.get("cf-ipcountry") ??
    "";
  const isBrazil = geoCountry.toUpperCase() === "BR";
  const currency: AdCurrency = isBrazil ? "brl" : body.currency === "brl" ? "brl" : "usd";

  const pkg = AD_PACKAGES[package_id];
  const priceCents = getPackagePriceCents(package_id as AdPackageId, currency);
  const sb = getSupabaseAdmin();
  const advertiser = await getAdvertiserFromCookies();

  // Create one inactive ad per vehicle in the package
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
      amount_paid_cents: 0, // actual amount set by webhook
      currency,
    });

    if (insertError) {
      console.error("Failed to create sky_ad for package:", insertError);
      // Clean up any already-created ads
      for (const createdId of adIds) {
        await sb.from("sky_ads").delete().eq("id", createdId);
      }
      return NextResponse.json({ error: "Failed to create ads" }, { status: 500 });
    }
  }

  const baseUrl = getBaseUrl();
  const firstAdId = adIds[0];
  const successUrl = advertiser
    ? `${baseUrl}/ads/dashboard/${firstAdId}`
    : `${baseUrl}/advertise/setup/${trackingToken}`;
  const cancelUrl = advertiser ? `${baseUrl}/ads/dashboard/new` : `${baseUrl}/advertise`;

  try {
    const stripe = getStripe();
    const metadata = {
      type: "sky_ad_package",
      package_id,
      sky_ad_ids: adIds.join(","),
    };

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          price_data: {
            currency,
            product_data: {
              name: `Git City Ads: ${pkg.label} Package`,
              description: `${pkg.label} ad package on Git City (${pkg.vehicles.length} vehicles)`,
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

    // Store session ID on all ads
    for (const adId of adIds) {
      await sb
        .from("sky_ads")
        .update({ stripe_session_id: session.id })
        .eq("id", adId);
    }

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Package checkout creation failed:", err);
    for (const adId of adIds) {
      await sb.from("sky_ads").delete().eq("id", adId);
    }
    return NextResponse.json({ error: "Payment setup failed" }, { status: 500 });
  }
}
