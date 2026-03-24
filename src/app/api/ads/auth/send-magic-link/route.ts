import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getResend } from "@/lib/resend";
import { createMagicLinkSession } from "@/lib/advertiser-auth";
import { wrapInBaseTemplate, buildButton } from "@/lib/email-template";
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

  let body: { email?: string };
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

  // Find or create advertiser account
  let { data: advertiser } = await sb
    .from("advertiser_accounts")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (!advertiser) {
    // Only create account if they have existing ads
    const { count } = await sb
      .from("sky_ads")
      .select("id", { count: "exact", head: true })
      .eq("purchaser_email", email);

    if ((count ?? 0) === 0) {
      // Still return success to avoid email enumeration
      return NextResponse.json({ ok: true });
    }

    const { data: newAccount } = await sb
      .from("advertiser_accounts")
      .insert({ email })
      .select("id")
      .single();

    if (!newAccount) {
      return NextResponse.json({ error: "Failed to create account" }, { status: 500 });
    }
    advertiser = newAccount;

    // Link any existing ads
    await sb
      .from("sky_ads")
      .update({ advertiser_id: newAccount.id })
      .eq("purchaser_email", email)
      .is("advertiser_id", null);
  }

  const token = await createMagicLinkSession(advertiser.id);
  const verifyUrl = `${getBaseUrl()}/api/ads/auth/verify?token=${token}`;

  const resend = getResend();
  await resend.emails.send({
    from: "Git City <noreply@thegitcity.com>",
    to: email,
    subject: "Sign in to Git City Ads",
    html: wrapInBaseTemplate(`
      <h2 style="margin-top: 0; font-family: 'Silkscreen', monospace; color: #111111;">Sign in to your ad dashboard</h2>
      <p style="color: #555555; font-family: Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6;">
        Click the button below to sign in. This link expires in 15 minutes.
      </p>
      ${buildButton("Sign In", verifyUrl)}
      <p style="margin-top: 24px; color: #999999; font-family: Helvetica, Arial, sans-serif; font-size: 12px;">
        If you didn't request this, you can safely ignore this email.
      </p>
    `),
  });

  return NextResponse.json({ ok: true });
}
