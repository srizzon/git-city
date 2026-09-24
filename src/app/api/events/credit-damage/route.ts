import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { rateLimit } from "@/lib/rate-limit";
import { verifyBossDamageToken } from "@/lib/bossEventToken";

// Credits a chunk of boss damage to the currently-live event.
// The PartyKit fly server signs a receipt token after tracking damage
// server-authoritatively; the client carries it here. We verify the HMAC,
// confirm the player matches the session, find the live event, and call
// the idempotent credit_event_damage RPC.

function deny(reason: string, status = 400) {
  return NextResponse.json({ ok: false, reason }, { status });
}

function getAllowedOrigins(): string[] {
  const set = new Set<string>();
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) set.add(explicit);
  const vercel = process.env.VERCEL_URL;
  if (vercel) set.add(`https://${vercel}`);
  return [...set];
}

const LOCALHOST_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/;

function isAllowedOrigin(origin: string | null, referer: string | null): boolean {
  const candidates = [origin, referer].filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
  if (candidates.length === 0) return false;
  if (process.env.NODE_ENV !== "production") {
    if (candidates.some((c) => LOCALHOST_RE.test(c))) return true;
  }
  const allowed = getAllowedOrigins();
  if (allowed.length === 0) return true;
  return candidates.some((c) => allowed.some((a) => c.startsWith(a)));
}

export async function POST(request: Request) {
  const headerList = await headers();
  if (!isAllowedOrigin(headerList.get("origin"), headerList.get("referer"))) {
    return deny("forbidden_origin", 403);
  }

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // Generous: receipts arrive at most every few seconds per player
  const { ok } = rateLimit(`event-credit:${user.id}`, 4, 1000);
  if (!ok) return NextResponse.json({ error: "Too fast" }, { status: 429 });

  let body: { damage_token?: unknown };
  try {
    body = await request.json();
  } catch {
    return deny("invalid_json");
  }
  const token = typeof body.damage_token === "string" ? body.damage_token : null;
  if (!token) return deny("missing_damage_token");

  const verify = verifyBossDamageToken(token);
  if (!verify.ok) return deny(`token_${verify.reason}`, 400);
  const payload = verify.payload;

  // Player must match the building the authenticated session has claimed.
  const { data: me } = await getSupabaseAdmin()
    .from("developers")
    .select("github_login")
    .eq("claimed_by", user.id)
    .maybeSingle();
  const login = ((me?.github_login as string | undefined) ?? "").toLowerCase();
  if (!login) return deny("no_github_login");
  if (payload.dln !== login) return deny("login_mismatch", 403);

  const admin = getSupabaseAdmin();

  // Find the currently-live event.
  const { data: event } = await admin
    .from("event_instances")
    .select("id")
    .eq("status", "live")
    .order("starts_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!event) return deny("no_live_event", 409);

  const { data: dev } = await admin
    .from("developers")
    .select("id")
    .eq("github_login", payload.dln)
    .single();
  if (!dev) return deny("developer_not_found", 404);

  // Ensure a participation row exists, then credit (idempotent via token).
  await admin.rpc("register_event_participation", {
    p_event_id: event.id,
    p_developer_id: dev.id,
  });

  const { data, error } = await admin.rpc("credit_event_damage", {
    p_event_id: event.id,
    p_developer_id: dev.id,
    p_amount: Math.floor(payload.amt),
    p_minions: Math.floor(payload.min),
    p_source: "boss_shot",
    p_token: token,
  });

  if (error) return NextResponse.json({ error: "Credit failed" }, { status: 500 });
  return NextResponse.json(data);
}
