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
          // PIX ads are one-time, default to 30 days
          const endsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

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
