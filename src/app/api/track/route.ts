import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { rateLimit } from "@/lib/rate-limit";
import { logEvent } from "@/lib/analytics";

// Client → server event logging for a small allowlist of client-side events
// (raid_viewed, raid_joined, reward_claimed, sponsor_clicked). Session-authed
// where possible; anonymous allowed for funnel-top events. Rate-limited.

const ALLOWED_EVENTS = new Set([
  "raid_viewed",
  "raid_joined",
  "reward_claimed",
  "sponsor_impression",
  "sponsor_clicked",
]);

export async function POST(request: Request) {
  let body: { event_name?: unknown; props?: unknown; anonymous_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const eventName = typeof body.event_name === "string" ? body.event_name : "";
  if (!ALLOWED_EVENTS.has(eventName)) {
    return NextResponse.json({ ok: false, reason: "event_not_allowed" }, { status: 400 });
  }

  const props = (body.props && typeof body.props === "object" ? body.props : {}) as Record<string, unknown>;
  const anonymousId = typeof body.anonymous_id === "string" ? body.anonymous_id : null;

  // Resolve developer_id from session if logged in
  let developerId: number | null = null;
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    const login = (
      user?.user_metadata?.user_name ??
      user?.user_metadata?.preferred_username ??
      ""
    ).toLowerCase();
    if (login) {
      const rl = rateLimit(`track:${login}`, 10, 1000);
      if (!rl.ok) return NextResponse.json({ ok: false, reason: "rate" }, { status: 429 });
      const admin = getSupabaseAdmin();
      const { data: dev } = await admin.from("developers").select("id").eq("github_login", login).maybeSingle();
      developerId = dev?.id ?? null;
    } else if (anonymousId) {
      const rl = rateLimit(`track:anon:${anonymousId}`, 10, 1000);
      if (!rl.ok) return NextResponse.json({ ok: false, reason: "rate" }, { status: 429 });
    }
  } catch { /* ignore — fall through to log with whatever we have */ }

  await logEvent(eventName, { developerId, anonymousId, props });
  return NextResponse.json({ ok: true });
}
