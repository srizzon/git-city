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
  stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY);
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

export async function createPixelCheckoutSession(
  packageId: string,
  developerId: number,
  githubLogin: string,
  currency: "usd" | "brl" = "usd",
  customerEmail?: string,
): Promise<{ url: string; sessionId: string }> {
  const sb = getSupabaseAdmin();
  const { data: pkg } = await sb
    .from("pixel_packages")
    .select("*")
    .eq("id", packageId)
    .eq("is_active", true)
    .single();
  if (!pkg) throw new Error("Package not found");

  const stripe = getStripe();
  const unitAmount = currency === "brl" ? pkg.price_brl_cents : pkg.price_usd_cents;
  const totalPx = pkg.pixels + pkg.bonus_pixels;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: customerEmail || undefined,
    line_items: [
      {
        price_data: {
          currency,
          product_data: {
            name: `${totalPx} Pixels`,
            description:
              pkg.bonus_pixels > 0
                ? `${pkg.pixels} PX + ${pkg.bonus_pixels} bonus`
                : `${pkg.pixels} PX`,
          },
          unit_amount: unitAmount,
        },
        quantity: 1,
      },
    ],
    metadata: {
      type: "pixel_package",
      package_id: packageId,
      developer_id: String(developerId),
    },
    success_url: `${getBaseUrl()}/pixels?pixels_purchased=${packageId}`,
    cancel_url: `${getBaseUrl()}/pixels`,
  });

  return { url: session.url!, sessionId: session.id };
}
