import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase";
import { autoEquipIfSolo } from "@/lib/items";
import { SKY_AD_PLANS, isValidPlanId } from "@/lib/skyAdPlans";
import { AD_PACKAGES, isValidPackageId } from "@/lib/adPackages";
import { sendPurchaseNotification, sendGiftSentNotification } from "@/lib/notification-senders/purchase";
import { sendGiftReceivedNotification } from "@/lib/notification-senders/gift";
import type Stripe from "stripe";
import { sendJobPendingReviewEmail } from "@/lib/notification-senders/job-pending-review";
import { getResend } from "@/lib/resend";

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

        // --- Sky Ad purchase (subscription or one-off) ---
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

          // Get subscription details for period end
          const subscriptionId =
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription?.id;

          const now = new Date();
          let endsAt: Date;

          if (subscriptionId) {
            // Subscription mode (3m, 6m, 12m)
            const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
              expand: ["items.data"],
            });
            const firstItem = subscription.items?.data?.[0];
            const periodEnd = firstItem?.current_period_end;
            endsAt = periodEnd
              ? new Date(periodEnd * 1000)
              : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
          } else {
            // One-off payment mode (7d, 14d, 1m): use period from metadata
            const periodMeta = session.metadata?.period;
            const PERIOD_DAYS: Record<string, number> = { "1w": 7, "7d": 7, "14d": 14, "1m": 30 };
            const days = (periodMeta && PERIOD_DAYS[periodMeta]) || 30;
            endsAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
          }

          const purchaserEmail = session.customer_details?.email ?? null;

          await sb
            .from("sky_ads")
            .update({
              active: true,
              starts_at: now.toISOString(),
              ends_at: endsAt.toISOString(),
              purchaser_email: purchaserEmail,
              stripe_subscription_id: subscriptionId ?? null,
              stripe_customer_id:
                typeof session.customer === "string"
                  ? session.customer
                  : session.customer?.id ?? null,
              // Store actual amount paid (after coupons/discounts)
              amount_paid_cents: session.amount_total ?? undefined,
              currency: session.currency ?? undefined,
            })
            .eq("id", ad.id);

          // Link to advertiser account if exists
          if (purchaserEmail) {
            const { data: advertiser } = await sb
              .from("advertiser_accounts")
              .select("id")
              .eq("email", purchaserEmail)
              .maybeSingle();

            if (advertiser) {
              await sb
                .from("sky_ads")
                .update({ advertiser_id: advertiser.id })
                .eq("id", ad.id)
                .is("advertiser_id", null);
            }
          }

          // Auto-deactivate the "advertise" placeholder if same vehicle type
          const plan = SKY_AD_PLANS[planId];
          if (plan.vehicle === "plane") {
            await sb
              .from("sky_ads")
              .update({ active: false })
              .eq("id", "advertise")
              .eq("active", true);
          }

          break;
        }

        // --- Sky Ad Package purchase (Foundation, Skyline, Landmark) ---
        if (session.metadata?.type === "sky_ad_package") {
          const packageId = session.metadata.package_id;
          const adIdsCsv = session.metadata.sky_ad_ids;

          if (!packageId || !adIdsCsv) {
            console.error("Missing package metadata in session:", session.id);
            break;
          }

          const adIds = adIdsCsv.split(",").filter(Boolean);

          // Get subscription details for period end
          const subscriptionId =
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription?.id;

          const now = new Date();
          let endsAt: Date;

          if (subscriptionId) {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
              expand: ["items.data"],
            });
            const firstItem = subscription.items?.data?.[0];
            const periodEnd = firstItem?.current_period_end;
            endsAt = periodEnd
              ? new Date(periodEnd * 1000)
              : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
          } else {
            endsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
          }

          const purchaserEmail = session.customer_details?.email ?? null;
          const amountPerAd = session.amount_total
            ? Math.round(session.amount_total / adIds.length)
            : 0;

          // Activate all ads in the package
          for (const adId of adIds) {
            const { data: ad } = await sb
              .from("sky_ads")
              .select("id, active")
              .eq("id", adId)
              .maybeSingle();

            if (!ad || ad.active) continue;

            await sb
              .from("sky_ads")
              .update({
                active: true,
                starts_at: now.toISOString(),
                ends_at: endsAt.toISOString(),
                purchaser_email: purchaserEmail,
                stripe_subscription_id: subscriptionId ?? null,
                stripe_customer_id:
                  typeof session.customer === "string"
                    ? session.customer
                    : session.customer?.id ?? null,
                amount_paid_cents: amountPerAd,
                currency: session.currency ?? undefined,
              })
              .eq("id", adId);

            // Link to advertiser account if exists
            if (purchaserEmail) {
              const { data: advertiser } = await sb
                .from("advertiser_accounts")
                .select("id")
                .eq("email", purchaserEmail)
                .maybeSingle();

              if (advertiser) {
                await sb
                  .from("sky_ads")
                  .update({ advertiser_id: advertiser.id })
                  .eq("id", adId)
                  .is("advertiser_id", null);
              }
            }
          }

          // Auto-deactivate plane placeholder if package includes a plane
          const pkg = isValidPackageId(packageId) ? AD_PACKAGES[packageId] : null;
          if (pkg?.vehicles.includes("plane")) {
            await sb
              .from("sky_ads")
              .update({ active: false })
              .eq("id", "advertise")
              .eq("active", true);
          }

          // Send admin notification email
          const totalFormatted = session.currency === "brl"
            ? `R$${((session.amount_total ?? 0) / 100).toFixed(2)}`
            : `$${((session.amount_total ?? 0) / 100).toFixed(2)}`;

          const isLandmark = pkg?.landmark === true;

          try {
            const resend = getResend();
            await resend.emails.send({
              from: "Git City Ads <ads@thegitcity.com>",
              to: "samuelrizzondev@gmail.com",
              subject: isLandmark
                ? `[ACTION REQUIRED] New Landmark sale — ${totalFormatted}/mo`
                : `New ${pkg?.label ?? packageId} sale — ${totalFormatted}/mo`,
              html: `
                <h2>${isLandmark ? "🏗️ New Landmark Package — Custom building needed" : `New ${pkg?.label ?? packageId} Package Sale`}</h2>
                <table style="border-collapse:collapse;font-family:monospace;">
                  <tr><td style="padding:4px 12px 4px 0;color:#888;">Package</td><td><strong>${pkg?.label ?? packageId}</strong></td></tr>
                  <tr><td style="padding:4px 12px 4px 0;color:#888;">Amount</td><td><strong>${totalFormatted}/mo</strong></td></tr>
                  <tr><td style="padding:4px 12px 4px 0;color:#888;">Currency</td><td>${(session.currency ?? "usd").toUpperCase()}</td></tr>
                  <tr><td style="padding:4px 12px 4px 0;color:#888;">Customer</td><td>${purchaserEmail ?? "unknown"}</td></tr>
                  <tr><td style="padding:4px 12px 4px 0;color:#888;">Vehicles</td><td>${adIds.length} ads (${pkg?.vehicles.join(", ") ?? "?"})</td></tr>
                  <tr><td style="padding:4px 12px 4px 0;color:#888;">Ad IDs</td><td>${adIds.join(", ")}</td></tr>
                  <tr><td style="padding:4px 12px 4px 0;color:#888;">Subscription</td><td>${subscriptionId ?? "none"}</td></tr>
                  <tr><td style="padding:4px 12px 4px 0;color:#888;">Starts</td><td>${now.toISOString()}</td></tr>
                  <tr><td style="padding:4px 12px 4px 0;color:#888;">Ends</td><td>${endsAt.toISOString()}</td></tr>
                </table>
                ${isLandmark ? "<p style='margin-top:16px;color:#c8e64a;'><strong>⚠️ This is a Landmark package. You need to create a custom 3D building and post on Instagram/X.</strong></p>" : ""}
              `,
            });
          } catch (emailErr) {
            console.error("Failed to send admin ad sale email:", emailErr);
          }

          console.log(`Package ${packageId} activated: ${adIds.length} ads for ${purchaserEmail}`);
          break;
        }

        // --- Job listing purchase ---
        if (session.metadata?.type === "job_listing") {
          const listingId = session.metadata.listing_id;
          if (!listingId) {
            console.error("Missing listing_id in session metadata:", session.id);
            break;
          }

          const paymentIntentId =
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : session.payment_intent?.id;

          await sb
            .from("job_listings")
            .update({
              status: "pending_review",
              tier: session.metadata.tier ?? "standard",
              stripe_session_id: session.id,
              stripe_payment_intent: paymentIntentId ?? null,
            })
            .eq("id", listingId);

          // Notify admin about new listing for review
          const { data: paidListing } = await sb
            .from("job_listings")
            .select("title, company:job_company_profiles!inner(name)")
            .eq("id", listingId)
            .single();

          if (paidListing) {
            const compName = (paidListing.company as unknown as { name: string }).name;
            sendJobPendingReviewEmail(
              paidListing.title,
              compName,
              session.metadata.tier ?? "standard",
              listingId,
            ).catch((err) => console.error("[job-notify] Failed to send pending review email:", err));
          }

          console.log(`Job listing ${listingId} moved to pending_review after payment`);
          break;
        }

        // --- Pixel package purchase ---
        if (session.metadata?.type === "pixel_package") {
          const pxPackageId = session.metadata.package_id;
          const pxDevId = Number(session.metadata.developer_id);
          const pxPaymentIntentId =
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : session.payment_intent?.id;

          const { data: pkg } = await sb
            .from("pixel_packages")
            .select("pixels, bonus_pixels")
            .eq("id", pxPackageId)
            .single();

          if (!pkg) {
            console.error("Pixel package not found:", pxPackageId);
            break;
          }

          const totalPx = pkg.pixels + pkg.bonus_pixels;

          await sb.rpc("credit_pixels", {
            p_developer_id: pxDevId,
            p_amount: totalPx,
            p_source: "purchase",
            p_reference_id: session.id,
            p_reference_type: "stripe_session",
            p_description: `Purchased ${totalPx} PX (${pxPackageId})`,
            p_idempotency_key: `stripe:${session.id}`,
          });

          // Update status + swap provider_tx_id from session ID to payment intent ID
          // so charge.dispute.created and charge.refunded handlers can find this row
          await sb
            .from("pixel_purchases")
            .update({
              status: "completed",
              pixels_credited: totalPx,
              provider_tx_id: pxPaymentIntentId ?? session.id,
            })
            .eq("provider_tx_id", session.id)
            .eq("status", "pending")
            .eq("provider", "stripe");

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

        const taxId = session.customer_details?.tax_ids?.[0];
        const billingAddress = session.customer_details?.address;
        const fiscalData = {
          buyer_name: session.customer_details?.name ?? null,
          buyer_email: session.customer_details?.email ?? null,
          buyer_tax_id: taxId?.value ?? null,
          buyer_tax_id_type: taxId?.type ?? null,
          buyer_country: billingAddress?.country ?? null,
          buyer_address: billingAddress ?? null,
        };

        if (pending) {
          await sb
            .from("purchases")
            .update({
              status: "completed",
              provider_tx_id: paymentIntentId ?? session.id,
              ...fiscalData,
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
              ...fiscalData,
            });
            await autoEquipIfSolo(Number(developerId), itemId);
          }
        }
        break;
      }

      // --- Subscription renewal: extend ad period ---
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;

        // In Stripe SDK v20+, subscription lives inside invoice.parent.subscription_details
        const subDetails = invoice.parent?.subscription_details;
        const subscriptionId =
          typeof subDetails?.subscription === "string"
            ? subDetails.subscription
            : subDetails?.subscription?.id;

        if (!subscriptionId) break;

        // Handle sky ad subscriptions (single ads and packages)
        const { data: ads } = await sb
          .from("sky_ads")
          .select("id")
          .eq("stripe_subscription_id", subscriptionId);

        if (!ads || ads.length === 0) break;

        // Get updated period end from subscription items
        const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
          expand: ["items.data"],
        });
        const firstItem = subscription.items?.data?.[0];
        const periodEnd = firstItem?.current_period_end;
        const endsAt = periodEnd
          ? new Date(periodEnd * 1000)
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        // Update all ads with this subscription (supports packages)
        await sb
          .from("sky_ads")
          .update({
            active: true,
            ends_at: endsAt.toISOString(),
          })
          .eq("stripe_subscription_id", subscriptionId);

        break;
      }

      // --- Subscription canceled: deactivate ad ---
      case "customer.subscription.deleted": {
        const canceledSub = event.data.object as Stripe.Subscription;

        // Deactivate all ads with this subscription (supports packages)
        await sb
          .from("sky_ads")
          .update({ active: false })
          .eq("stripe_subscription_id", canceledSub.id);

        break;
      }

      case "checkout.session.expired": {
        const expiredSession = event.data.object as Stripe.Checkout.Session;
        if (expiredSession.metadata?.type === "sky_ad" || expiredSession.metadata?.type === "sky_ad_package") {
          // Clean up orphaned inactive ad rows from abandoned checkout
          await sb
            .from("sky_ads")
            .delete()
            .eq("stripe_session_id", expiredSession.id)
            .eq("active", false);
        }

        // Expire pending pixel purchases for this session
        await sb
          .from("pixel_purchases")
          .update({ status: "expired" })
          .eq("provider_tx_id", expiredSession.id)
          .eq("status", "pending");

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

          // Refund pixel purchases: debit PX + mark refunded
          const { data: refundedPixPurchase } = await sb
            .from("pixel_purchases")
            .select("developer_id, pixels_credited")
            .eq("provider_tx_id", paymentIntentId)
            .eq("status", "completed")
            .maybeSingle();

          if (refundedPixPurchase && refundedPixPurchase.pixels_credited > 0) {
            await sb.rpc("debit_pixels", {
              p_developer_id: refundedPixPurchase.developer_id,
              p_amount: refundedPixPurchase.pixels_credited,
              p_source: "refund",
              p_reference_id: paymentIntentId,
              p_description: "Refund on PX purchase",
              p_idempotency_key: `refund:${paymentIntentId}`,
            });

            await sb
              .from("pixel_purchases")
              .update({ status: "refunded" })
              .eq("provider_tx_id", paymentIntentId)
              .eq("status", "completed");
          }

          // Refund sky ads: find checkout session for this payment intent
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

      case "charge.dispute.created": {
        const dispute = event.data.object as Stripe.Dispute;
        const disputePiId =
          typeof dispute.payment_intent === "string"
            ? dispute.payment_intent
            : dispute.payment_intent?.id;

        if (disputePiId) {
          // Handle pixel purchase chargebacks
          const { data: pixPurchase } = await sb
            .from("pixel_purchases")
            .select("developer_id, pixels_credited")
            .eq("provider_tx_id", disputePiId)
            .eq("status", "completed")
            .maybeSingle();

          if (pixPurchase) {
            const disputeChargeId =
              typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;

            await sb.rpc("debit_pixels", {
              p_developer_id: pixPurchase.developer_id,
              p_amount: pixPurchase.pixels_credited,
              p_source: "chargeback",
              p_reference_id: disputeChargeId ?? disputePiId,
              p_description: "Chargeback on PX purchase",
              p_idempotency_key: `chargeback:${disputePiId}`,
            });

            await sb
              .from("developers")
              .update({ suspended: true })
              .eq("id", pixPurchase.developer_id);

            await sb
              .from("pixel_purchases")
              .update({ status: "refunded" })
              .eq("provider_tx_id", disputePiId);
          }

          // Also handle shop item chargebacks
          await sb
            .from("purchases")
            .update({ status: "refunded" })
            .eq("provider_tx_id", disputePiId)
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
