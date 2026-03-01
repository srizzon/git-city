import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase";
import { autoEquipIfSolo } from "@/lib/items";
import { SKY_AD_PLANS, isValidPlanId } from "@/lib/skyAdPlans";
import { sendPurchaseNotification, sendGiftSentNotification } from "@/lib/notification-senders/purchase";
import { sendGiftReceivedNotification } from "@/lib/notification-senders/gift";
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

        // --- Sky Ad purchase ---
        if (session.metadata?.type === "sky_ad") {
          const skyAdId = session.metadata.sky_ad_id;
          if (!skyAdId) {
            console.error("Missing sky_ad_id in session metadata:", session.id);
            break;
          }

          // Find the sky_ad by stripe_session_id, fallback to ad ID
          let { data: ad } = await sb
            .from("sky_ads")
            .select("id, plan_id, active")
            .eq("stripe_session_id", session.id)
            .maybeSingle();

          if (!ad) {
            const { data: adById } = await sb
              .from("sky_ads")
              .select("id, plan_id, active")
              .eq("id", skyAdId)
              .maybeSingle();
            ad = adById;
          }

          if (!ad) {
            console.error("Sky ad not found for session:", session.id);
            break;
          }

          // Skip if already activated (duplicate webhook)
          if (ad.active) break;

          const planId = ad.plan_id;
          if (!planId || !isValidPlanId(planId)) {
            console.error("Invalid plan_id on sky_ad:", ad.id);
            break;
          }

          const plan = SKY_AD_PLANS[planId];
          const now = new Date();
          const endsAt = new Date(now.getTime() + plan.duration_days * 24 * 60 * 60 * 1000);

          await sb
            .from("sky_ads")
            .update({
              active: true,
              starts_at: now.toISOString(),
              ends_at: endsAt.toISOString(),
              purchaser_email: session.customer_details?.email ?? null,
            })
            .eq("id", ad.id);

          // Auto-deactivate the "advertise" placeholder if same vehicle type
          if (plan.vehicle === "plane") {
            await sb
              .from("sky_ads")
              .update({ active: false })
              .eq("id", "advertise")
              .eq("active", true);
          }

          break;
        }

        // --- Shop item purchase ---
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

          // Streak freeze: grant via RPC instead of normal item flow
          if (itemId === "streak_freeze") {
            await sb.rpc("grant_streak_freeze", { p_developer_id: Number(developerId) });
            await sb.from("streak_freeze_log").insert({
              developer_id: Number(developerId),
              action: "purchased",
            });
            await sb.from("activity_feed").insert({
              event_type: "item_purchased",
              actor_id: Number(developerId),
              metadata: { login: session.metadata?.github_login, item_id: "streak_freeze" },
            });
            break;
          }

          // Auto-equip if solo item in zone
          const giftedTo = session.metadata?.gifted_to;
          const ownerId = giftedTo ? Number(giftedTo) : Number(developerId);
          await autoEquipIfSolo(ownerId, itemId);

          // Insert feed event + send notifications
          const githubLogin = session.metadata?.github_login;
          if (giftedTo) {
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

            // Gift notifications: receipt to buyer, alert to receiver
            sendGiftSentNotification(Number(developerId), githubLogin ?? "", receiver?.github_login ?? "unknown", pending.id, itemId);
            sendGiftReceivedNotification(Number(giftedTo), githubLogin ?? "someone", receiver?.github_login ?? "unknown", pending.id, itemId);
          } else {
            await sb.from("activity_feed").insert({
              event_type: "item_purchased",
              actor_id: Number(developerId),
              metadata: { login: githubLogin, item_id: itemId },
            });

            // Purchase receipt notification
            sendPurchaseNotification(Number(developerId), githubLogin ?? "", pending.id, itemId);
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

      case "checkout.session.expired": {
        const expiredSession = event.data.object as Stripe.Checkout.Session;
        if (expiredSession.metadata?.type === "sky_ad") {
          // Clean up orphaned inactive ad row from abandoned checkout
          await sb
            .from("sky_ads")
            .delete()
            .eq("stripe_session_id", expiredSession.id)
            .eq("active", false);
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
          // Refund shop purchases
          await sb
            .from("purchases")
            .update({ status: "refunded" })
            .eq("provider_tx_id", paymentIntentId)
            .eq("status", "completed");

          // Refund sky ads: find checkout session for this payment intent
          const stripe = getStripe();
          const sessions = await stripe.checkout.sessions.list({
            payment_intent: paymentIntentId,
            limit: 1,
          });
          const refundedSession = sessions.data[0];
          if (refundedSession?.metadata?.type === "sky_ad") {
            await sb
              .from("sky_ads")
              .update({ active: false })
              .eq("stripe_session_id", refundedSession.id);
          }
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
