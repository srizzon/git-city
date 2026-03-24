import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyApiKey } from "@/lib/advertiser-api-auth";
import { verifySignature } from "@/lib/hmac";
import { rateLimit } from "@/lib/rate-limit";

const CLICK_ID_PATTERN = /^gc_[a-z0-9]{10,30}$/;
const CLICK_ID_MAX_AGE_DAYS = 30;

async function hashIP(ip: string): Promise<string> {
  const data = new TextEncoder().encode(ip + (process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""));
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  // Determine source: S2S if Authorization header present, otherwise pixel
  const authHeader = request.headers.get("authorization");
  const isS2S = !!authHeader?.startsWith("Bearer gc_ak_");

  // Rate limits: pixel 10 req/min/IP, S2S 60 req/min/IP
  const rateLimitKey = `conv:${isS2S ? "s2s" : "px"}:${ip}`;
  const rateLimitMax = isS2S ? 60 : 10;
  const { ok: rateLimitOk } = rateLimit(rateLimitKey, rateLimitMax, 60_000);
  if (!rateLimitOk) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  let body: {
    click_id?: string;
    event_name?: string;
    order_id?: string;
    revenue?: number;
    currency?: string;
    signature?: string;
    timestamp?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Validate click_id
  const { click_id, event_name, order_id, revenue, currency, signature, timestamp } = body;
  if (!click_id || typeof click_id !== "string" || !CLICK_ID_PATTERN.test(click_id)) {
    return NextResponse.json({ error: "Invalid click_id" }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  let advertiserId: string | null = null;

  // S2S: verify API key + HMAC signature
  if (isS2S) {
    advertiserId = await verifyApiKey(authHeader!.slice(7));
    if (!advertiserId) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }

    if (!signature || !timestamp) {
      return NextResponse.json({ error: "S2S requires signature and timestamp" }, { status: 400 });
    }

    // Get webhook secret
    const { data: account } = await sb
      .from("advertiser_accounts")
      .select("webhook_secret")
      .eq("id", advertiserId)
      .maybeSingle();

    if (!account?.webhook_secret) {
      return NextResponse.json({ error: "Webhook secret not configured" }, { status: 403 });
    }

    const result = await verifySignature(account.webhook_secret, click_id, timestamp, signature);
    if (!result.valid) {
      return NextResponse.json({ error: result.reason }, { status: 403 });
    }
  }

  // Lookup click_id in sky_ad_events
  const maxAge = new Date(Date.now() - CLICK_ID_MAX_AGE_DAYS * 86400000).toISOString();
  const { data: clickEvent } = await sb
    .from("sky_ad_events")
    .select("ad_id")
    .eq("click_id", click_id)
    .eq("event_type", "cta_click")
    .gte("created_at", maxAge)
    .maybeSingle();

  if (!clickEvent) {
    return NextResponse.json({ error: "Click not found or expired" }, { status: 404 });
  }

  const adId = clickEvent.ad_id;

  // S2S: verify advertiser owns the ad
  if (isS2S && advertiserId) {
    const { data: ad } = await sb
      .from("sky_ads")
      .select("id")
      .eq("id", adId)
      .eq("advertiser_id", advertiserId)
      .maybeSingle();

    if (!ad) {
      return NextResponse.json({ error: "Ad not owned by this advertiser" }, { status: 403 });
    }
  }

  const ipHash = await hashIP(ip);
  const revenueCents = typeof revenue === "number" && revenue > 0 ? Math.round(revenue * 100) : null;

  // Insert conversion (order_id dedup via UNIQUE constraint)
  const { data: conversion, error } = await sb
    .from("sky_ad_conversions")
    .insert({
      ad_id: adId,
      click_id,
      event_name: typeof event_name === "string" ? event_name.slice(0, 50) : "conversion",
      order_id: typeof order_id === "string" ? order_id.slice(0, 200) : null,
      revenue_cents: revenueCents,
      currency: typeof currency === "string" ? currency.slice(0, 3).toUpperCase() : "USD",
      ip_hash: ipHash,
      source: isS2S ? "s2s" : "pixel",
    })
    .select("id")
    .single();

  if (error) {
    // Unique constraint violation = duplicate order_id
    if (error.code === "23505") {
      return NextResponse.json({ error: "Duplicate order_id", ok: false }, { status: 409 });
    }
    console.error("Conversion insert error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, conversion_id: conversion.id }, { status: 201 });
}
