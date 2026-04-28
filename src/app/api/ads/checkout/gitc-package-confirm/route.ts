import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { rateLimit } from "@/lib/rate-limit";
import { verifyGitcPaymentTx } from "@/lib/gitc-server";

const TX_HASH_RE = /^0x[a-fA-F0-9]{64}$/;

interface PaymentRow {
  id: string;
  ad_id: string;
  package_id: string | null;
  package_ad_ids: string[];
  wallet_address: string;
  gitc_amount_wei: string;
  quote_block_number: number;
  status: string;
  expires_at: string;
  tx_hash: string | null;
}

interface AdRow {
  id: string;
  active: boolean;
  tracking_token: string | null;
}

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  const { ok } = rateLimit(`gitc-pkg-confirm:${ip}`, 5, 10_000);
  if (!ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: { quoteId?: string; txHash?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { quoteId, txHash } = body;
  if (!quoteId || typeof quoteId !== "string") {
    return NextResponse.json({ error: "quoteId required" }, { status: 400 });
  }
  if (!txHash || !TX_HASH_RE.test(txHash)) {
    return NextResponse.json({ error: "Invalid txHash" }, { status: 400 });
  }

  const sb = getSupabaseAdmin();

  const { data: payment, error: payErr } = await sb
    .from("ad_gitc_payments")
    .select(
      "id, ad_id, package_id, package_ad_ids, wallet_address, gitc_amount_wei, quote_block_number, status, expires_at, tx_hash",
    )
    .eq("quote_id", quoteId)
    .maybeSingle<PaymentRow>();

  if (payErr || !payment) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }

  if (!payment.package_id || payment.package_ad_ids.length === 0) {
    return NextResponse.json({ error: "Quote is not a package" }, { status: 400 });
  }

  const txHashLower = txHash.toLowerCase();

  if (payment.status === "confirmed" && payment.tx_hash === txHashLower) {
    const { data: ad } = await sb
      .from("sky_ads")
      .select("id, active, tracking_token")
      .eq("id", payment.ad_id)
      .maybeSingle<AdRow>();
    return NextResponse.json({
      primaryAdId: payment.ad_id,
      adIds: payment.package_ad_ids,
      trackingToken: ad?.tracking_token ?? null,
      alreadyConfirmed: true,
    });
  }

  if (payment.status === "expired" || payment.status === "failed") {
    return NextResponse.json({ error: `Quote ${payment.status}` }, { status: 410 });
  }

  if (new Date(payment.expires_at).getTime() < Date.now() && payment.status === "pending") {
    await sb.from("ad_gitc_payments").update({ status: "expired" }).eq("id", payment.id);
    return NextResponse.json({ error: "Quote expired" }, { status: 410 });
  }

  const verification = await verifyGitcPaymentTx({
    txHash: txHashLower as `0x${string}`,
    expectedWallet: payment.wallet_address,
    minAmountWei: BigInt(payment.gitc_amount_wei),
    minBlockNumber: BigInt(payment.quote_block_number),
  });

  if (!verification.ok) {
    return NextResponse.json({ error: verification.reason ?? "Payment verification failed" }, { status: 400 });
  }

  // Atomic-ish flip from pending → confirmed; UNIQUE(tx_hash) prevents double-spend across quotes.
  const { error: updateErr } = await sb
    .from("ad_gitc_payments")
    .update({
      status: "confirmed",
      tx_hash: txHashLower,
      block_number: verification.blockNumber ? Number(verification.blockNumber) : null,
      paid_amount_wei: verification.paidAmountWei?.toString() ?? null,
      confirmed_at: new Date().toISOString(),
    })
    .eq("id", payment.id)
    .eq("status", "pending");

  if (updateErr) {
    console.error("Failed to confirm GITC package payment:", updateErr);
    return NextResponse.json({ error: "Could not confirm payment (tx may already be used)" }, { status: 409 });
  }

  // Activate every ad in the package. Idempotent: only flips inactive rows.
  const now = new Date();
  const endsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const perAdAmountCents = (() => {
    // Best-effort split for accounting; not used for billing.
    return Math.floor((Number(payment.gitc_amount_wei) > 0 ? 1 : 0)); // placeholder, see below
  })();
  void perAdAmountCents;

  await sb
    .from("sky_ads")
    .update({
      active: true,
      starts_at: now.toISOString(),
      ends_at: endsAt.toISOString(),
    })
    .in("id", payment.package_ad_ids)
    .eq("active", false);

  // If a plane was activated, hide the placeholder ad.
  await sb
    .from("sky_ads")
    .update({ active: false })
    .eq("id", "advertise")
    .eq("active", true);

  const { data: primaryAd } = await sb
    .from("sky_ads")
    .select("id, active, tracking_token")
    .eq("id", payment.ad_id)
    .maybeSingle<AdRow>();

  return NextResponse.json({
    primaryAdId: payment.ad_id,
    adIds: payment.package_ad_ids,
    trackingToken: primaryAd?.tracking_token ?? null,
    paidAmountWei: verification.paidAmountWei?.toString() ?? null,
  });
}
