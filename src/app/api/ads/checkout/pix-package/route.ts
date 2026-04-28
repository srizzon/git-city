import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createPixQrCodeRaw } from "@/lib/abacatepay";
import { AD_PACKAGES, isValidPackageId, getPackagePriceCents, type AdPackageId } from "@/lib/adPackages";
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

  const { ok } = rateLimit(`pix-pkg-checkout:${ip}`, 1, 10_000);
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

  const pkg = AD_PACKAGES[package_id];

  if (pkg.landmark) {
    return NextResponse.json({ error: "Landmark requires manual contact" }, { status: 400 });
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

  const sb = getSupabaseAdmin();
  const advertiser = await getAdvertiserFromCookies();
  const priceCents = getPackagePriceCents(package_id as AdPackageId, "brl");
  const perAdCents = Math.floor(priceCents / pkg.vehicles.length);

  const adIds: string[] = [];
  const trackingToken = generateToken();

  // Create one inactive ad per vehicle in the package, all sharing the same
  // pix_id (set after the QR is created).
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
      amount_paid_cents: perAdCents,
      currency: "brl",
    });

    if (insertError) {
      console.error("Failed to create sky_ad for PIX package:", insertError);
      for (const createdId of adIds) {
        await sb.from("sky_ads").delete().eq("id", createdId);
      }
      return NextResponse.json({ error: "Failed to create ads" }, { status: 500 });
    }
  }

  const primaryAdId = adIds[0];

  try {
    const { brCode, brCodeBase64, pixId } = await createPixQrCodeRaw({
      amountCents: priceCents,
      description: `Git City Ads: ${pkg.label} Package`,
      externalId: primaryAdId,
      extraMetadata: { package_id, period: "1m" },
    });

    // Stamp pix_id on every ad in the package so the webhook can find them all.
    await sb.from("sky_ads").update({ pix_id: pixId }).in("id", adIds);

    return NextResponse.json({
      brCode,
      brCodeBase64,
      adId: primaryAdId,
      adIds,
      trackingToken,
      isLoggedIn: !!advertiser,
    });
  } catch (err) {
    console.error("PIX package QR code creation failed:", err);
    for (const adId of adIds) {
      await sb.from("sky_ads").delete().eq("id", adId);
    }
    return NextResponse.json({ error: "Failed to generate PIX code" }, { status: 500 });
  }
}
