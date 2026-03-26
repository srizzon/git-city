import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { autoEquipIfSolo } from "@/lib/items";
import { sendPurchaseNotification, sendGiftSentNotification } from "@/lib/notification-senders/purchase";
import { sendGiftReceivedNotification } from "@/lib/notification-senders/gift";
import { SKY_AD_PLANS, isValidPlanId } from "@/lib/skyAdPlans";

export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractPixId(data: any): string | undefined {
  // billing.paid payload: data.pixQrCode.id
  // pixQrCode.paid payload: data.id or data.pixQrCode.id
  return data?.pixQrCode?.id ?? data?.id;
}


export async function POST(request: Request) {
  // Layer 1: Validate webhook secret via query string
  const expectedSecret = process.env.ABACATEPAY_WEBHOOK_SECRET;
  if (!expectedSecret) {
    console.error("ABACATEPAY_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  const { searchParams } = new URL(request.url);
  const receivedSecret = searchParams.get("webhookSecret");
  if (receivedSecret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawBody = await request.text();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  const pixId = extractPixId(body.data);

  try {
    switch (body.event) {
      case "billing.paid":
      case "pixQrCode.paid": {
        if (!pixId) break;

        // --- Sky Ad purchase ---
        const { data: ad } = await sb
          .from("sky_ads")
          .select("id, plan_id, active")
          .eq("pix_id", pixId)
          .maybeSingle();

        if (ad && !ad.active) {
          const now = new Date();
          // Use period from metadata if available, default to 30 days
          const periodMeta = body.data?.metadata?.period;
          const PERIOD_DAYS: Record<string, number> = { "1w": 7, "7d": 7, "14d": 14, "1m": 30 };
          const days = (periodMeta && PERIOD_DAYS[periodMeta]) || 30;
          const endsAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

          await sb
            .from("sky_ads")
            .update({
              active: true,
              starts_at: now.toISOString(),
              ends_at: endsAt.toISOString(),
            })
            .eq("id", ad.id);

          const planId = ad.plan_id;
          if (planId && isValidPlanId(planId)) {
            const plan = SKY_AD_PLANS[planId];
            if (plan.vehicle === "plane") {
              await sb
                .from("sky_ads")
                .update({ active: false })
                .eq("id", "advertise")
                .eq("active", true);
            }
          }
          break;
        }

        // --- Pixel package purchase ---
        const { data: pixelPurchase } = await sb
          .from("pixel_purchases")
          .select("id, developer_id, package_id, status")
          .eq("provider_tx_id", pixId)
          .eq("status", "pending")
          .maybeSingle();

        if (pixelPurchase) {
          const { data: pkg } = await sb
            .from("pixel_packages")
            .select("pixels, bonus_pixels")
            .eq("id", pixelPurchase.package_id)
            .single();

          if (pkg) {
            const totalPx = pkg.pixels + pkg.bonus_pixels;
            await sb.rpc("credit_pixels", {
              p_developer_id: pixelPurchase.developer_id,
              p_amount: totalPx,
              p_source: "purchase",
              p_reference_id: pixelPurchase.id,
              p_reference_type: "pixel_purchase",
              p_description: `Purchased ${totalPx} PX (${pixelPurchase.package_id})`,
              p_idempotency_key: `abacatepay:${pixId}`,
            });

            await sb
              .from("pixel_purchases")
              .update({ status: "completed", pixels_credited: totalPx })
              .eq("id", pixelPurchase.id);
          }
          break;
        }

        // --- Shop item purchase ---
        const { data: purchase } = await sb
          .from("purchases")
          .select("id, status")
          .eq("provider_tx_id", pixId)
          .eq("provider", "abacatepay")
          .maybeSingle();

        if (purchase && purchase.status === "pending") {
          await sb
            .from("purchases")
            .update({ status: "completed" })
            .eq("id", purchase.id);

          const { data: fullPurchase } = await sb
            .from("purchases")
            .select("developer_id, item_id, gifted_to")
            .eq("id", purchase.id)
            .single();

          if (fullPurchase) {
            const itemOwner = fullPurchase.gifted_to ?? fullPurchase.developer_id;
            await autoEquipIfSolo(itemOwner, fullPurchase.item_id);

            const { data: dev } = await sb
              .from("developers")
              .select("github_login")
              .eq("id", fullPurchase.developer_id)
              .single();

            if (fullPurchase.gifted_to) {
              const { data: receiver } = await sb
                .from("developers")
                .select("github_login")
                .eq("id", fullPurchase.gifted_to)
                .single();
              await sb.from("activity_feed").insert({
                event_type: "gift_sent",
                actor_id: fullPurchase.developer_id,
                target_id: fullPurchase.gifted_to,
                metadata: { giver_login: dev?.github_login, receiver_login: receiver?.github_login, item_id: fullPurchase.item_id },
              });
              sendGiftSentNotification(fullPurchase.developer_id, dev?.github_login ?? "", receiver?.github_login ?? "unknown", purchase.id, fullPurchase.item_id);
              sendGiftReceivedNotification(fullPurchase.gifted_to, dev?.github_login ?? "someone", receiver?.github_login ?? "unknown", purchase.id, fullPurchase.item_id);
            } else {
              await sb.from("activity_feed").insert({
                event_type: "item_purchased",
                actor_id: fullPurchase.developer_id,
                metadata: { login: dev?.github_login, item_id: fullPurchase.item_id },
              });
              sendPurchaseNotification(fullPurchase.developer_id, dev?.github_login ?? "", purchase.id, fullPurchase.item_id);
            }
          }
        }
        break;
      }

      case "pix.expired":
      case "pixQrCode.expired": {
        if (!pixId) break;

        // Expire shop purchases
        await sb
          .from("purchases")
          .update({ status: "expired" })
          .eq("provider_tx_id", pixId)
          .eq("status", "pending")
          .eq("provider", "abacatepay");

        // Expire pixel purchases
        await sb
          .from("pixel_purchases")
          .update({ status: "expired" })
          .eq("provider_tx_id", pixId)
          .eq("status", "pending");

        // Clean up expired sky ad rows
        await sb
          .from("sky_ads")
          .delete()
          .eq("pix_id", pixId)
          .eq("active", false);
        break;
      }
    }
  } catch (err) {
    console.error("AbacatePay webhook handler error:", err);
  }

  // Always return 200
  return NextResponse.json({ received: true });
}
