import Stripe from "stripe";
import { getSupabaseAdmin } from "./supabase";

let stripeInstance: Stripe | null = null;

function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export function getStripe(): Stripe {
  if (stripeInstance) return stripeInstance;
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2026-01-28.clover",
  });
  return stripeInstance;
}

export async function createCheckoutSession(
  itemId: string,
  developerId: number,
  githubLogin: string,
  currency: "usd" | "brl" = "usd",
  customerEmail?: string,
  giftedToDevId?: number | null,
  giftedToLogin?: string | null
): Promise<{ url: string }> {
  const sb = getSupabaseAdmin();

  // Price ALWAYS from DB, never from frontend
  const { data: item, error } = await sb
    .from("items")
    .select("*")
    .eq("id", itemId)
    .eq("is_active", true)
    .single();

  if (error || !item) {
    throw new Error("Item not found or inactive");
  }

  const stripe = getStripe();
  const unitAmount = currency === "brl" ? item.price_brl_cents : item.price_usd_cents;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: customerEmail || undefined,
    billing_address_collection: "required",
    tax_id_collection: { enabled: true },
    line_items: [
      {
        price_data: {
          currency,
          product_data: {
            name: item.name,
            description: item.description || undefined,
          },
          unit_amount: unitAmount,
        },
        quantity: 1,
      },
    ],
    metadata: {
      developer_id: String(developerId),
      item_id: itemId,
      github_login: githubLogin,
      ...(giftedToDevId ? { gifted_to: String(giftedToDevId) } : {}),
    },
    success_url: giftedToLogin
      ? `${getBaseUrl()}/?user=${giftedToLogin}&gifted=${itemId}`
      : `${getBaseUrl()}/shop/${githubLogin}?purchased=${itemId}`,
    cancel_url: `${getBaseUrl()}/shop/${githubLogin}`,
  });

  return { url: session.url! };
}
