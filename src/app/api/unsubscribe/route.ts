import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyHmacToken } from "@/lib/notifications";
import { escapeHtml } from "@/lib/email-template";

const VALID_CATEGORIES = [
  "transactional", "social", "digest", "marketing", "streak_reminders",
  "jobs_applications", "jobs_performance", "jobs_digest", "jobs_updates", "leagues",
  "all",
];

const CATEGORY_LABELS: Record<string, string> = {
  all: "all emails",
  social: "social notifications",
  digest: "digest emails",
  marketing: "marketing emails",
  streak_reminders: "streak reminders",
  transactional: "transactional emails",
  jobs_applications: "job application notifications",
  jobs_performance: "job performance reports",
  jobs_digest: "the weekly job digest",
  jobs_updates: "job status updates",
  leagues: "town emails",
};

function parseParams(request: Request) {
  const { searchParams } = new URL(request.url);
  const devId = Number(searchParams.get("dev"));
  const category = searchParams.get("cat") ?? "";
  const token = searchParams.get("token") ?? "";

  if (!devId || !VALID_CATEGORIES.includes(category) || !token) return { error: "invalid" as const };
  if (!verifyHmacToken(devId, category, token)) return { error: "invalid_token" as const };
  return { devId, category };
}

/**
 * POST /api/unsubscribe?dev={id}&cat={category}&token={hmac}
 * Performs the unsubscribe. Called by email clients for RFC 8058 one-click
 * (body "List-Unsubscribe=One-Click", expects a 200) and by the confirmation
 * form below (redirected to the /unsubscribe page).
 * No login needed - HMAC token proves the link is legitimate.
 */
export async function POST(request: Request) {
  const { origin } = new URL(request.url);
  const form = await request.formData().catch(() => null);
  const fromPage = form?.get("source") === "page";

  const params = parseParams(request);
  if ("error" in params) {
    if (fromPage) return NextResponse.redirect(`${origin}/unsubscribe?error=${params.error}`, 303);
    return NextResponse.json(
      { error: params.error === "invalid" ? "Invalid parameters" : "Invalid token" },
      { status: params.error === "invalid" ? 400 : 403 },
    );
  }

  const { devId, category } = params;
  const update = category === "all" ? { email_enabled: false } : { [category]: false };
  const { error } = await getSupabaseAdmin()
    .from("notification_preferences")
    .upsert(
      { developer_id: devId, ...update, updated_at: new Date().toISOString() },
      { onConflict: "developer_id" },
    );

  if (error) {
    console.error(`[unsubscribe] Failed for dev ${devId} (${category}):`, error);
    if (fromPage) return NextResponse.redirect(`${origin}/unsubscribe?error=failed`, 303);
    return NextResponse.json({ error: "Unsubscribe failed" }, { status: 500 });
  }

  if (fromPage) return NextResponse.redirect(`${origin}/unsubscribe?success=true&cat=${category}`, 303);
  return NextResponse.json({ ok: true, category });
}

/**
 * GET /api/unsubscribe?dev={id}&cat={category}&token={hmac}
 * The link in the email body. Never changes state (link scanners and
 * prefetchers open it); it renders a confirmation form that POSTs.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = parseParams(request);
  if ("error" in params) {
    return NextResponse.redirect(`${url.origin}/unsubscribe?error=${params.error}`);
  }

  const label = CATEGORY_LABELS[params.category] ?? "these emails";
  const action = `${url.pathname}${url.search}`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Unsubscribe · Git City</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Silkscreen&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 16px; background: #0d0d0f; color: #e8dcc8; font-family: 'Silkscreen', monospace; }
  main { width: 100%; max-width: 420px; padding: 40px 28px; border: 1px solid #1c1c20; text-align: center; }
  h1 { margin: 0 0 24px; font-size: 26px; letter-spacing: 4px; color: #c8e64a; }
  p { margin: 0 0 28px; font-size: 13px; line-height: 1.8; text-wrap: balance; }
  button { font: inherit; font-size: 14px; letter-spacing: 1px; padding: 14px 28px; border: 0; background: #c8e64a; color: #0d0d0f; cursor: pointer; }
  button:hover { background: #d8f25e; }
  button:focus-visible { outline: 2px solid #e8dcc8; outline-offset: 3px; }
  a { display: inline-block; margin-top: 20px; font-size: 12px; color: #8a8272; }
</style>
</head>
<body>
<main>
  <h1>GIT CITY</h1>
  <p>Stop receiving ${escapeHtml(label)} from Git City?</p>
  <form method="post" action="${escapeHtml(action)}">
    <input type="hidden" name="source" value="page">
    <button type="submit">Unsubscribe</button>
  </form>
  <a href="${escapeHtml(url.origin)}">Back to the city</a>
</main>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
