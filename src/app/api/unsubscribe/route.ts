import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyHmacToken, type NotificationCategory } from "@/lib/notifications";

const VALID_CATEGORIES = ["transactional", "social", "digest", "marketing", "streak_reminders", "all"];

/**
 * POST /api/unsubscribe?dev={id}&cat={category}&token={hmac}
 * RFC 8058 requires POST for one-click List-Unsubscribe.
 * No login needed - HMAC token proves the link is legitimate.
 */
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const devId = Number(searchParams.get("dev"));
  const category = searchParams.get("cat") ?? "";
  const token = searchParams.get("token") ?? "";

  if (!devId || !VALID_CATEGORIES.includes(category) || !token) {
    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
  }

  if (!verifyHmacToken(devId, category, token)) {
    return NextResponse.json({ error: "Invalid token" }, { status: 403 });
  }

  const sb = getSupabaseAdmin();

  if (category === "all") {
    await sb
      .from("notification_preferences")
      .upsert(
        { developer_id: devId, email_enabled: false, updated_at: new Date().toISOString() },
        { onConflict: "developer_id" },
      );
  } else {
    // Disable specific category
    const update: Record<string, unknown> = {
      [category]: false,
      updated_at: new Date().toISOString(),
    };
    await sb
      .from("notification_preferences")
      .upsert(
        { developer_id: devId, ...update },
        { onConflict: "developer_id" },
      );
  }

  // Return 200 for email clients doing one-click unsubscribe (they just POST, no redirect)
  return NextResponse.json({ ok: true, category });
}

/**
 * GET /api/unsubscribe?dev={id}&cat={category}&token={hmac}
 * For when users click the link in the email body.
 * Processes the unsubscribe and redirects to confirmation page.
 *
 * NOTE: We ALSO process on GET because users click links, not POST them.
 * The POST handler above is for email client one-click (RFC 8058).
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const devId = Number(searchParams.get("dev"));
  const category = searchParams.get("cat") ?? "";
  const token = searchParams.get("token") ?? "";

  if (!devId || !VALID_CATEGORIES.includes(category) || !token) {
    return NextResponse.redirect(`${origin}/unsubscribe?error=invalid`);
  }

  if (!verifyHmacToken(devId, category, token)) {
    return NextResponse.redirect(`${origin}/unsubscribe?error=invalid_token`);
  }

  const sb = getSupabaseAdmin();

  if (category === "all") {
    await sb
      .from("notification_preferences")
      .upsert(
        { developer_id: devId, email_enabled: false, updated_at: new Date().toISOString() },
        { onConflict: "developer_id" },
      );
  } else {
    const update: Record<string, unknown> = {
      [category]: false,
      updated_at: new Date().toISOString(),
    };
    await sb
      .from("notification_preferences")
      .upsert(
        { developer_id: devId, ...update },
        { onConflict: "developer_id" },
      );
  }

  return NextResponse.redirect(
    `${origin}/unsubscribe?success=true&cat=${category}`,
  );
}
