import crypto from "node:crypto";
import { getSupabaseAdmin } from "./supabase";

const NOWPAYMENTS_API = process.env.NOWPAYMENTS_SANDBOX === "true"
  ? "https://api-sandbox.nowpayments.io/v1"
  : "https://api.nowpayments.io/v1";

interface InvoiceResponse {
  id: string;
  order_id: string;
  order_description: string;
  price_amount: number;
  price_currency: string;
  invoice_url: string;
  created_at: string;
}

/**
 * Create a NOWPayments invoice (hosted checkout page where the user picks
 * their crypto currency). This is simpler and safer than creating a direct
 * payment because NOWPayments handles the coin selection UI.
 */
export async function createCryptoInvoice(
  itemId: string,
  developerId: number,
  githubLogin: string,
): Promise<{ invoiceUrl: string; invoiceId: string }> {
  const sb = getSupabaseAdmin();

  const { data: item, error } = await sb
    .from("items")
    .select("*")
    .eq("id", itemId)
    .eq("is_active", true)
    .single();

  if (error || !item) {
    throw new Error("Item not found or inactive");
  }

  const apiKey = process.env.NOWPAYMENTS_API_KEY;
  if (!apiKey) {
    throw new Error("NOWPAYMENTS_API_KEY is not set");
  }

  const priceUsd = item.price_usd_cents / 100;

  const successUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://thegitcity.com"}/shop/${githubLogin}?purchased=${itemId}`;
  const cancelUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://thegitcity.com"}/shop/${githubLogin}`;

  const res = await fetch(`${NOWPAYMENTS_API}/invoice`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      price_amount: priceUsd,
      price_currency: "usd",
      order_id: `${developerId}:${itemId}`,
      order_description: `${item.name} - ${githubLogin}`,
      ipn_callback_url: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://thegitcity.com"}/api/webhooks/nowpayments`,
      success_url: successUrl,
      cancel_url: cancelUrl,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`NOWPayments error: ${res.status} ${text}`);
  }

  const data: InvoiceResponse = await res.json();

  if (!data?.invoice_url || !data?.id) {
    throw new Error(`NOWPayments: unexpected response: ${JSON.stringify(data)}`);
  }

  return {
    invoiceUrl: data.invoice_url,
    invoiceId: String(data.id),
  };
}

/**
 * Verify NOWPayments IPN callback signature.
 * They use HMAC-SHA512 with sorted JSON body.
 */
export function verifyIpnSignature(
  rawBody: Record<string, unknown>,
  signature: string,
): boolean {
  const ipnSecret = process.env.NOWPAYMENTS_IPN_SECRET;
  if (!ipnSecret) return false;

  const sorted = sortObject(rawBody);
  const hmac = crypto
    .createHmac("sha512", ipnSecret)
    .update(JSON.stringify(sorted))
    .digest("hex");

  return hmac === signature;
}

/** Recursively sort object keys alphabetically (required by NOWPayments). */
function sortObject(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.keys(obj)
    .sort()
    .reduce<Record<string, unknown>>((result, key) => {
      const val = obj[key];
      result[key] =
        val && typeof val === "object" && !Array.isArray(val)
          ? sortObject(val as Record<string, unknown>)
          : val;
      return result;
    }, {});
}
