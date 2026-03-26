import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createPixelCheckoutSession } from "@/lib/stripe";
import { createPixQrCodeForPackage } from "@/lib/abacatepay";

const lastCheckout = new Map<string, number>();

export async function POST(request: Request) {
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

  const { data: dev } = await sb
    .from("developers")
    .select("id, claimed, claimed_by, suspended")
    .eq("github_login", githubLogin)
    .single();

  if (!dev || !dev.claimed || dev.claimed_by !== user.id) {
    return NextResponse.json({ error: "You must claim your building first" }, { status: 403 });
  }

  if (dev.suspended) {
    return NextResponse.json({ error: "Account suspended" }, { status: 403 });
  }

  let body: { package_id: string; provider: "stripe" | "abacatepay" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { package_id, provider } = body;
  if (!package_id || !provider || !["stripe", "abacatepay"].includes(provider)) {
    return NextResponse.json({ error: "Invalid package_id or provider" }, { status: 400 });
  }

  // Validate package exists
  const { data: pkg } = await sb
    .from("pixel_packages")
    .select("*")
    .eq("id", package_id)
    .eq("is_active", true)
    .single();

  if (!pkg) {
    return NextResponse.json({ error: "Package not found" }, { status: 404 });
  }

  // Detect country for currency
  const country =
    request.headers.get("x-vercel-ip-country") ??
    request.headers.get("cf-ipcountry") ??
    "";
  const isBrazil = country.toUpperCase() === "BR";

  try {
    // PIX flow: only when user explicitly chooses abacatepay
    if (provider === "abacatepay") {
      const { brCode, brCodeBase64, pixId } = await createPixQrCodeForPackage(
        package_id,
        dev.id,
        githubLogin,
      );

      await sb.from("pixel_purchases").insert({
        developer_id: dev.id,
        package_id,
        provider: "abacatepay",
        provider_tx_id: pixId,
        amount_cents: pkg.price_brl_cents,
        currency: "brl",
        pixels_credited: 0,
        status: "pending",
      });

      return NextResponse.json({ brCode, brCodeBase64, pixId });
    }

    // Stripe flow
    const currency: "usd" | "brl" = isBrazil ? "brl" : "usd";
    const { url, sessionId } = await createPixelCheckoutSession(
      package_id,
      dev.id,
      githubLogin,
      currency,
      user.email ?? undefined,
    );

    await sb.from("pixel_purchases").insert({
      developer_id: dev.id,
      package_id,
      provider: "stripe",
      provider_tx_id: sessionId,
      amount_cents: currency === "brl" ? pkg.price_brl_cents : pkg.price_usd_cents,
      currency,
      pixels_credited: 0,
      status: "pending",
    });

    return NextResponse.json({ url });
  } catch (err) {
    console.error("Pixel checkout error:", err);
    return NextResponse.json({ error: "Failed to create checkout" }, { status: 500 });
  }
}
