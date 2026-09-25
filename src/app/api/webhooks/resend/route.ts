import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { Webhook } from "svix";

export const dynamic = "force-dynamic";

/**
 * Resend webhook handler for email delivery events.
 * Verifies Svix signature, then handles bounces, complaints, delivery, opens, clicks,
 * failures, suppressions and delays. Returns 500 when a DB write fails so Resend retries.
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
  const email = (body.data.to as string[] | undefined)?.[0];
  const emailId = body.data.email_id as string | undefined;

  // Supabase returns errors instead of throwing; throw so the catch answers 500.
  const run = async (query: PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await query;
    if (error) throw new Error(error.message);
  };
  const suppress = (reason: "bounce" | "complaint") =>
    email
      ? run(
          sb
            .from("notification_suppressions")
            .upsert(
              { identifier: email, channel: "email", reason, created_at: now },
              { onConflict: "identifier,channel" },
            ),
        )
      : Promise.resolve();
  const updateLog = (fields: Record<string, unknown>) =>
    emailId ? run(sb.from("notification_log").update(fields).eq("provider_id", emailId)) : Promise.resolve();

  try {
    switch (body.type) {
      case "email.bounced": {
        const bounce = body.data.bounce as { type?: string; subType?: string; message?: string } | undefined;
        const reason = [bounce?.type, bounce?.subType].filter(Boolean).join(":") || "bounced";

        // Only a hard (permanent) bounce suppresses the address; soft/transient
        // bounces (mailbox full, greylisting) just get logged.
        if (bounce?.type === "Permanent") {
          await suppress("bounce");
          await updateLog({ status: "bounced", failed_at: now, failure_reason: reason });
        } else {
          console.warn(`[webhook:resend] Soft bounce for ${emailId}: ${reason}`);
          await updateLog({ status: "soft_bounced", failure_reason: reason });
        }
        break;
      }

      case "email.complained": {
        await suppress("complaint");
        await updateLog({ status: "complained", failed_at: now, failure_reason: "spam_complaint" });
        break;
      }

      case "email.failed": {
        const failed = body.data.failed as { reason?: string } | undefined;
        await updateLog({ status: "failed", failed_at: now, failure_reason: failed?.reason ?? "failed" });
        break;
      }

      case "email.suppressed": {
        // Resend refused to send: the address is on its suppression list
        // (earlier hard bounce or complaint). Mirror it so we stop trying.
        const suppressed = body.data.suppressed as { type?: string; message?: string } | undefined;
        await suppress(suppressed?.type === "complaint" ? "complaint" : "bounce");
        await updateLog({
          status: "suppressed",
          failed_at: now,
          failure_reason: suppressed?.message ?? suppressed?.type ?? "suppressed",
        });
        break;
      }

      case "email.delivery_delayed": {
        if (emailId) {
          await run(
            sb
              .from("notification_log")
              .update({ status: "delivery_delayed" })
              .eq("provider_id", emailId)
              .eq("status", "sent"),
          );
        }
        break;
      }

      case "email.delivered": {
        await updateLog({ status: "delivered", delivered_at: now });
        break;
      }

      case "email.opened": {
        if (emailId) {
          await run(
            sb
              .from("notification_log")
              .update({ opened_at: now })
              .eq("provider_id", emailId)
              .is("opened_at", null),
          );
        }
        break;
      }

      case "email.clicked": {
        if (emailId) {
          await run(
            sb
              .from("notification_log")
              .update({ clicked_at: now })
              .eq("provider_id", emailId)
              .is("clicked_at", null),
          );
        }
        break;
      }
    }
  } catch (err) {
    console.error("[webhook:resend] Error processing event:", err);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
