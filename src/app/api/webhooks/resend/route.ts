import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { Webhook } from "svix";

export const dynamic = "force-dynamic";

/**
 * Resend webhook handler for email delivery events.
 * Verifies Svix signature, then handles bounces, complaints, delivery, opens, clicks.
 */
export async function POST(request: Request) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[webhook:resend] RESEND_WEBHOOK_SECRET not set, rejecting all webhooks");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  // Verify Svix signature
  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "Missing signature headers" }, { status: 401 });
  }

  const rawBody = await request.text();

  let body: { type: string; data: Record<string, unknown> };
  try {
    const wh = new Webhook(webhookSecret);
    body = wh.verify(rawBody, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as typeof body;
  } catch (err) {
    console.error("[webhook:resend] Signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const sb = getSupabaseAdmin();
  const now = new Date().toISOString();

  try {
    switch (body.type) {
      case "email.bounced": {
        const email = (body.data.to as string[])?.[0];
        const emailId = body.data.email_id as string;

        if (email) {
          await sb
            .from("notification_suppressions")
            .upsert(
              { identifier: email, channel: "email", reason: "bounce", created_at: now },
              { onConflict: "identifier,channel" },
            );
        }

        if (emailId) {
          await sb
            .from("notification_log")
            .update({ status: "bounced", failed_at: now, failure_reason: "bounced" })
            .eq("provider_id", emailId);
        }
        break;
      }

      case "email.complained": {
        const email = (body.data.to as string[])?.[0];
        const emailId = body.data.email_id as string;

        if (email) {
          await sb
            .from("notification_suppressions")
            .upsert(
              { identifier: email, channel: "email", reason: "complaint", created_at: now },
              { onConflict: "identifier,channel" },
            );
        }

        if (emailId) {
          await sb
            .from("notification_log")
            .update({ status: "complained", failed_at: now, failure_reason: "spam_complaint" })
            .eq("provider_id", emailId);
        }
        break;
      }

      case "email.delivered": {
        const emailId = body.data.email_id as string;
        if (emailId) {
          await sb
            .from("notification_log")
            .update({ status: "delivered", delivered_at: now })
            .eq("provider_id", emailId);
        }
        break;
      }

      case "email.opened": {
        const emailId = body.data.email_id as string;
        if (emailId) {
          await sb
            .from("notification_log")
            .update({ opened_at: now })
            .eq("provider_id", emailId)
            .is("opened_at", null);
        }
        break;
      }

      case "email.clicked": {
        const emailId = body.data.email_id as string;
        if (emailId) {
          await sb
            .from("notification_log")
            .update({ clicked_at: now })
            .eq("provider_id", emailId)
            .is("clicked_at", null);
        }
        break;
      }
    }
  } catch (err) {
    console.error("[webhook:resend] Error processing event:", err);
  }

  return NextResponse.json({ received: true });
}
