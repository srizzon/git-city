import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { rateLimit } from "@/lib/rate-limit";
import { verifyGitcPaymentTx } from "@/lib/gitc-server";

const TX_HASH_RE = /^0x[a-fA-F0-9]{64}$/;

interface PaymentRow {
  id: string;
  pixel_purchase_id: string;
  developer_id: number;
  package_id: string;
  wallet_address: string;
  gitc_amount_wei: string;
  quote_block_number: number;
  status: string;
  expires_at: string;
  tx_hash: string | null;
}

interface PackageRow {
  pixels: number;
  bonus_pixels: number;
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  const { ok } = rateLimit(`pixels-gitc-confirm:${user.id}:${ip}`, 5, 10_000);
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
    .from("pixel_gitc_payments")
    .select("id, pixel_purchase_id, developer_id, package_id, wallet_address, gitc_amount_wei, quote_block_number, status, expires_at, tx_hash")
    .eq("quote_id", quoteId)
    .maybeSingle<PaymentRow>();

  if (payErr || !payment) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }

  if (payment.status === "confirmed" && payment.tx_hash === txHash.toLowerCase()) {
    return NextResponse.json({ ok: true, alreadyConfirmed: true });
  }

  if (payment.status === "expired" || payment.status === "failed") {
    return NextResponse.json({ error: `Quote ${payment.status}` }, { status: 410 });
  }

  if (new Date(payment.expires_at).getTime() < Date.now() && payment.status === "pending") {
    await sb.from("pixel_gitc_payments").update({ status: "expired" }).eq("id", payment.id);
    await sb
      .from("pixel_purchases")
      .update({ status: "expired" })
      .eq("id", payment.pixel_purchase_id)
      .eq("status", "pending");
    return NextResponse.json({ error: "Quote expired" }, { status: 410 });
  }

  const verification = await verifyGitcPaymentTx({
    txHash: txHash.toLowerCase() as `0x${string}`,
    expectedWallet: payment.wallet_address,
    minAmountWei: BigInt(payment.gitc_amount_wei),
    minBlockNumber: BigInt(payment.quote_block_number),
  });

  if (!verification.ok) {
    return NextResponse.json({ error: verification.reason ?? "Payment verification failed" }, { status: 400 });
  }

  const { error: updateErr } = await sb
    .from("pixel_gitc_payments")
    .update({
      status: "confirmed",
      tx_hash: txHash.toLowerCase(),
      block_number: verification.blockNumber ? Number(verification.blockNumber) : null,
      paid_amount_wei: verification.paidAmountWei?.toString() ?? null,
      confirmed_at: new Date().toISOString(),
    })
    .eq("id", payment.id)
    .eq("status", "pending");

  if (updateErr) {
    console.error("Failed to confirm pixel GITC payment:", updateErr);
    return NextResponse.json({ error: "Could not confirm payment (tx may already be used)" }, { status: 409 });
  }

  // Credit the pixels using the canonical RPC.
  const { data: pkg } = await sb
    .from("pixel_packages")
    .select("pixels, bonus_pixels")
    .eq("id", payment.package_id)
    .single<PackageRow>();

  if (!pkg) {
    return NextResponse.json({ error: "Package vanished" }, { status: 500 });
  }

  const totalPx = pkg.pixels + pkg.bonus_pixels;

  const { error: rpcErr } = await sb.rpc("credit_pixels", {
    p_developer_id: payment.developer_id,
    p_amount: totalPx,
    p_source: "purchase",
    p_reference_id: payment.id,
    p_reference_type: "gitc_payment",
    p_description: `Purchased ${totalPx} PX with GITC (${payment.package_id})`,
    p_idempotency_key: `gitc:${txHash.toLowerCase()}`,
  });

  if (rpcErr) {
    console.error("credit_pixels failed for GITC payment:", rpcErr);
    // Don't fail the whole request; the payment is on-chain, manual reconciliation possible.
  }

  await sb
    .from("pixel_purchases")
    .update({
      status: "completed",
      pixels_credited: totalPx,
    })
    .eq("id", payment.pixel_purchase_id);

  return NextResponse.json({
    ok: true,
    pixelsCredited: totalPx,
    paidAmountWei: verification.paidAmountWei?.toString() ?? null,
  });
}
