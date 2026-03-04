import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendNotificationAsync } from "@/lib/notifications";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://thegitcity.com";

/**
 * POST /api/admin/send-update-email
 * Send a product update email to all developers with marketing opt-in.
 * Protected by CRON_SECRET.
 *
 * Body: { subject: string, html: string, slug: string }
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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
  const results = { sent: 0, skipped: 0 };

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

    // Check marketing opt-in for this batch
    const devIds = devs.map((d) => d.id);
    const { data: prefs } = await sb
      .from("notification_preferences")
      .select("developer_id, marketing")
      .in("developer_id", devIds);

    const marketingMap = new Map(
      (prefs ?? []).map((p) => [p.developer_id, p.marketing]),
    );

    for (const dev of devs) {
      // Marketing defaults to false — must be explicitly opted in
      if (!marketingMap.get(dev.id)) {
        results.skipped++;
        continue;
      }

      sendNotificationAsync({
        type: "product_update",
        category: "marketing",
        developerId: dev.id,
        dedupKey: `update:${slug}:${dev.id}`,
        title: subject,
        body: subject,
        html,
        actionUrl: `${BASE_URL}/?user=${dev.github_login}`,
        priority: "normal",
        channels: ["email"],
      });
      results.sent++;
    }

    if (devs.length < batchSize) break;
    offset += batchSize;
  }

  return NextResponse.json({ ok: true, ...results });
}
