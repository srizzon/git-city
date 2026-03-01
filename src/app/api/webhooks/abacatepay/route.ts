import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import { autoEquipIfSolo } from "@/lib/items";
import { sendPurchaseNotification, sendGiftSentNotification } from "@/lib/notification-senders/purchase";
import { sendGiftReceivedNotification } from "@/lib/notification-senders/gift";

export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractPixId(data: any): string | undefined {
  // billing.paid payload: data.pixQrCode.id
  // pixQrCode.paid payload: data.id or data.pixQrCode.id
  return data?.pixQrCode?.id ?? data?.id;
}

function verifySignature(rawBody: string, signature: string): boolean {
  const publicKey = process.env.ABACATEPAY_PUBLIC_KEY;
  if (!publicKey) return false;

  const expected = crypto
    .createHmac("sha256", publicKey)
    .update(Buffer.from(rawBody, "utf8"))
    .digest("base64");

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
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

  // Layer 2: Verify HMAC-SHA256 signature
  const rawBody = await request.text();
  const signature = request.headers.get("x-webhook-signature");
  if (signature && !verifySignature(rawBody, signature)) {
    console.error("AbacatePay webhook signature mismatch");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

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

        // Find purchase by pix ID
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

          // Insert feed event
          const { data: fullPurchase } = await sb
            .from("purchases")
            .select("developer_id, item_id, gifted_to")
            .eq("id", purchase.id)
            .single();

          if (fullPurchase) {
            // Auto-equip if solo item in zone
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
        // If already completed, ignore (duplicate webhook)
        break;
      }

      case "pix.expired":
      case "pixQrCode.expired": {
        if (!pixId) break;

        await sb
          .from("purchases")
          .update({ status: "expired" })
          .eq("provider_tx_id", pixId)
          .eq("status", "pending")
          .eq("provider", "abacatepay");
        break;
      }
    }
  } catch (err) {
    console.error("AbacatePay webhook handler error:", err);
  }

  // Always return 200
  return NextResponse.json({ received: true });
}
