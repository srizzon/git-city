import { getStripe } from "@/lib/stripe";
import { JOB_TIERS } from "./constants";
import type { JobTier } from "./types";

function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export async function createJobCheckoutSession(
  listingId: string,
  tier: JobTier,
  advertiserId: string,
  email: string,
): Promise<{ url: string }> {
  const stripe = getStripe();
  const tierConfig = JOB_TIERS[tier];
  const base = getBaseUrl();

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: email,
    billing_address_collection: "required",
    tax_id_collection: { enabled: true },
    invoice_creation: { enabled: true },
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: tierConfig.price_usd_cents,
          product_data: {
            name: `Git City Jobs — ${tierConfig.label} Listing`,
            description: "30-day job listing on Git City Jobs",
          },
        },
        quantity: 1,
      },
    ],
    metadata: {
      type: "job_listing",
      listing_id: listingId,
      tier,
      advertiser_id: advertiserId,
    },
    success_url: `${base}/jobs/dashboard?posted=${listingId}`,
    cancel_url: `${base}/jobs/dashboard/new`,
  });

  return { url: session.url! };
}
