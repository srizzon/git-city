import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendEmail } from "@/lib/resend";
import { createMagicLinkSession } from "@/lib/advertiser-auth";
import { renderAdvertiserSignInEmail } from "@/lib/ad-emails";
import { rateLimit } from "@/lib/rate-limit";

function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  const { ok } = rateLimit(`magic-link:${ip}`, 3, 60_000);
  if (!ok) {
    return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429 });
  }

  let body: { email?: string; redirect?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const sb = getSupabaseAdmin();

  // Find or create advertiser account (open signup with corporate email)
  let { data: advertiser } = await sb
    .from("advertiser_accounts")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (!advertiser) {
    const { data: newAccount } = await sb
      .from("advertiser_accounts")
      .insert({ email })
      .select("id")
      .single();

    if (!newAccount) {
      return NextResponse.json({ error: "Failed to create account" }, { status: 500 });
    }
    advertiser = newAccount;

    // Link any existing ads from before account system
    await sb
      .from("sky_ads")
      .update({ advertiser_id: newAccount.id })
      .eq("purchaser_email", email)
      .is("advertiser_id", null);
  }

  const token = await createMagicLinkSession(advertiser.id);

  // Build verify URL with redirect passthrough
  const verifyUrl = new URL(`${getBaseUrl()}/api/ads/auth/verify`);
  verifyUrl.searchParams.set("token", token);
  if (body.redirect && body.redirect.startsWith("/") && !body.redirect.startsWith("//")) {
    verifyUrl.searchParams.set("redirect", body.redirect);
  }

  const { subject, html, text } = renderAdvertiserSignInEmail(verifyUrl.toString());
  const { error: sendError } = await sendEmail({
    from: "Git City <noreply@thegitcity.com>",
    to: email,
    subject,
    html,
    text,
  });

  if (sendError) {
    console.error("[ads-magic-link] Resend error:", sendError);
    return NextResponse.json({ error: "Failed to send the sign-in email. Try again." }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
