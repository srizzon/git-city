import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";

const MIN_AMOUNT = 1;

function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

// Simple IP-based rate limit (1 request per 5 seconds)
const lastRequest = new Map<string, number>();

export async function POST(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  const now = Date.now();
  const last = lastRequest.get(ip);
  if (last && now - last < 5_000) {
    return NextResponse.json({ error: "Too fast. Wait a few seconds." }, { status: 429 });
  }
  lastRequest.set(ip, now);

  let body: { amount: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { amount } = body;

  if (!Number.isFinite(amount) || amount < MIN_AMOUNT || Math.floor(amount) !== amount) {
    return NextResponse.json(
      { error: `Amount must be a whole number of at least $${MIN_AMOUNT}` },
      { status: 400 },
    );
  }

  try {
    const stripe = getStripe();
    const baseUrl = getBaseUrl();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Git City Support - $${amount}`,
            },
            unit_amount: amount * 100,
          },
          quantity: 1,
        },
      ],
      metadata: {
        type: "support",
        amount: String(amount),
      },
      success_url: `${baseUrl}/support?thanks=true`,
      cancel_url: `${baseUrl}/support`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Support checkout error:", err);
    return NextResponse.json({ error: "Failed to create checkout" }, { status: 500 });
  }
}
