import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendEmail } from "@/lib/resend";
import { getDeveloperEmail } from "@/lib/notification-helpers";
import { buildUnsubscribeUrl } from "@/lib/notifications";
import { withUnsubscribeFooter } from "@/lib/admin-emails";
import { FROM_MAIL } from "@/lib/email/senders";

const FROM = FROM_MAIL;

/**
 * POST /api/admin/send-update-email
 * Send a product update email to all claimed developers with email.
 * Sends the provided HTML as-is (no wrapInBaseTemplate) so custom
 * email designs are preserved exactly as authored; only the unsubscribe
 * footer is added.
 * Protected by CRON_SECRET.
 *
 * Body: { subject: string, html: string, slug: string }
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { subject?: string; html?: string; slug?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { subject, html, slug } = body;
  if (!subject || !html || !slug) {
    return NextResponse.json(
      { error: "Missing required fields: subject, html, slug" },
      { status: 400 },
    );
  }

  const sb = getSupabaseAdmin();
  const results = { sent: 0, skipped: 0, failed: 0 };

  let offset = 0;
  const batchSize = 50;

  while (true) {
    const { data: devs } = await sb
      .from("developers")
      .select("id, github_login")
      .eq("claimed", true)
      .not("email", "is", null)
      .range(offset, offset + batchSize - 1);

    if (!devs || devs.length === 0) break;

    // Check email_enabled preference (skip if explicitly disabled)
    const devIds = devs.map((d) => d.id);
    const { data: prefs } = await sb
      .from("notification_preferences")
      .select("developer_id, email_enabled")
      .in("developer_id", devIds);

    const emailDisabled = new Set(
      (prefs ?? []).filter((p) => p.email_enabled === false).map((p) => p.developer_id),
    );

    for (const dev of devs) {
      if (emailDisabled.has(dev.id)) {
        results.skipped++;
        continue;
      }

      const email = await getDeveloperEmail(dev.id);
      if (!email) {
        results.skipped++;
        continue;
      }

      const unsubUrl = buildUnsubscribeUrl(dev.id, "marketing");

      const finalHtml = withUnsubscribeFooter(html, unsubUrl);

      const { error } = await sendEmail({
        from: FROM,
        to: email,
        subject,
        html: finalHtml,
        headers: {
          "List-Unsubscribe": `<${unsubUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      });

      if (error) {
        results.failed++;
      } else {
        results.sent++;
      }
    }

    if (devs.length < batchSize) break;
    offset += batchSize;
  }

  return NextResponse.json({ ok: true, ...results });
}
