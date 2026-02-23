import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase";
import { autoEquipIfSolo } from "@/lib/items";
import type Stripe from "stripe";

// Disable body parsing — Stripe needs raw body for signature verification
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.text();
  const sig = request.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const stripe = getStripe();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const sb = getSupabaseAdmin();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const developerId = session.metadata?.developer_id;
        const itemId = session.metadata?.item_id;
        const paymentIntentId =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id;

        if (!developerId || !itemId) {
          console.error("Missing metadata in Stripe session:", session.id);
          break;
        }

        // Find the pending purchase
        const { data: pending } = await sb
          .from("purchases")
          .select("id, status")
          .eq("developer_id", Number(developerId))
          .eq("item_id", itemId)
          .eq("status", "pending")
          .eq("provider", "stripe")
          .maybeSingle();

        if (pending) {
          await sb
            .from("purchases")
            .update({
              status: "completed",
              provider_tx_id: paymentIntentId ?? session.id,
            })
            .eq("id", pending.id);

          // Auto-equip if solo item in zone
          const giftedTo = session.metadata?.gifted_to;
          const ownerId = giftedTo ? Number(giftedTo) : Number(developerId);
          await autoEquipIfSolo(ownerId, itemId);

          // Insert feed event
          const githubLogin = session.metadata?.github_login;
          if (giftedTo) {
            // Fetch receiver login for feed event
            const { data: receiver } = await sb
              .from("developers")
              .select("github_login")
              .eq("id", Number(giftedTo))
              .single();
            await sb.from("activity_feed").insert({
              event_type: "gift_sent",
              actor_id: Number(developerId),
              target_id: Number(giftedTo),
              metadata: {
                giver_login: githubLogin,
                receiver_login: receiver?.github_login ?? "unknown",
                item_id: itemId,
              },
            });
          } else {
            await sb.from("activity_feed").insert({
              event_type: "item_purchased",
              actor_id: Number(developerId),
              metadata: { login: githubLogin, item_id: itemId },
            });
          }
        } else {
          // Check if already completed (webhook duplicate)
          const { data: existing } = await sb
            .from("purchases")
            .select("id")
            .eq("developer_id", Number(developerId))
            .eq("item_id", itemId)
            .eq("status", "completed")
            .maybeSingle();

          if (!existing) {
            // Create completed purchase directly (edge case: pending was cleaned up)
            await sb.from("purchases").insert({
              developer_id: Number(developerId),
              item_id: itemId,
              provider: "stripe",
              provider_tx_id: paymentIntentId ?? session.id,
              amount_cents: session.amount_total ?? 0,
              currency: session.currency ?? "usd",
              status: "completed",
            });
            await autoEquipIfSolo(Number(developerId), itemId);
          }
        }
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const paymentIntentId =
          typeof charge.payment_intent === "string"
            ? charge.payment_intent
            : charge.payment_intent?.id;

        if (paymentIntentId) {
          await sb
            .from("purchases")
            .update({ status: "refunded" })
            .eq("provider_tx_id", paymentIntentId)
            .eq("status", "completed");
        }
        break;
      }
    }
  } catch (err) {
    // Log but return 200 — we don't want Stripe to retry on business logic errors
    console.error("Stripe webhook handler error:", err);
  }

  // Always return 200 to prevent Stripe retries
  return NextResponse.json({ received: true });
}
