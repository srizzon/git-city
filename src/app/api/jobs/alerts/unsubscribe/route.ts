import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

/** GET renders confirmation page — does NOT mutate state (safe from email prefetchers). */
export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  // Return a simple HTML confirmation page with a form button
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Unsubscribe – Git City Jobs</title>
<style>body{font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#0a0a0a;color:#f0f0f0}
.card{text-align:center;padding:2rem;border:1px solid #333;border-radius:12px;max-width:400px}
button{background:#e11d48;color:#fff;border:none;padding:12px 32px;border-radius:8px;font-size:16px;cursor:pointer;margin-top:16px}
button:hover{background:#be123c}</style></head>
<body><div class="card">
<h2>Unsubscribe from Job Alerts</h2>
<p>Click the button below to confirm you want to stop receiving job alerts.</p>
<form method="POST" action="/api/jobs/alerts/unsubscribe">
<input type="hidden" name="token" value="${token.replace(/"/g, "&quot;")}">
<button type="submit">Confirm Unsubscribe</button>
</form></div></body></html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

/** POST performs the actual unsubscribe (requires user action). */
export async function POST(req: NextRequest) {
  let token: string | null = null;

  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const formData = await req.formData();
    token = formData.get("token") as string | null;
  } else {
    const body = await req.json().catch(() => null);
    token = body?.token ?? null;
  }

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from("job_alert_subscriptions")
    .delete()
    .eq("unsubscribe_token", token);

  if (error) {
    return NextResponse.json({ error: "Failed to unsubscribe" }, { status: 500 });
  }

  return NextResponse.redirect(new URL("/jobs?unsubscribed=true", req.url));
}
