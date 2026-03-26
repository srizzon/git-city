import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase";

const COOKIE_NAME = "gc_advertiser_session";
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface Advertiser {
  id: string;
  email: string;
  name: string | null;
}

export async function getAdvertiserFromCookies(): Promise<Advertiser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return getAdvertiserBySessionToken(token);
}

export async function getAdvertiserBySessionToken(token: string): Promise<Advertiser | null> {
  const sb = getSupabaseAdmin();

  const { data: session } = await sb
    .from("advertiser_sessions")
    .select("advertiser_id, expires_at, used_at")
    .eq("token", token)
    .maybeSingle();

  if (!session) return null;

  // Session must be used (verified) and not expired
  if (!session.used_at) return null;
  if (new Date(session.expires_at) < new Date()) return null;

  const { data: advertiser } = await sb
    .from("advertiser_accounts")
    .select("id, email, name")
    .eq("id", session.advertiser_id)
    .single();

  return advertiser ?? null;
}

export async function createMagicLinkSession(advertiserId: string): Promise<string> {
  const sb = getSupabaseAdmin();
  const token = crypto.randomUUID();

  await sb.from("advertiser_sessions").insert({
    advertiser_id: advertiserId,
    token,
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 min
  });

  return token;
}

export async function verifyAndCreateLongSession(magicToken: string): Promise<string | null> {
  const sb = getSupabaseAdmin();

  // Find unused magic link session
  const { data: session } = await sb
    .from("advertiser_sessions")
    .select("id, advertiser_id, expires_at, used_at")
    .eq("token", magicToken)
    .maybeSingle();

  if (!session) return null;
  if (session.used_at) return null; // already used
  if (new Date(session.expires_at) < new Date()) return null; // expired

  // Mark as used
  await sb
    .from("advertiser_sessions")
    .update({ used_at: new Date().toISOString() })
    .eq("id", session.id);

  // Update last login
  await sb
    .from("advertiser_accounts")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", session.advertiser_id);

  // Create long-lived session
  const longToken = crypto.randomUUID();
  await sb.from("advertiser_sessions").insert({
    advertiser_id: session.advertiser_id,
    token: longToken,
    expires_at: new Date(Date.now() + SESSION_DURATION_MS).toISOString(),
    used_at: new Date().toISOString(), // mark as used immediately
  });

  return longToken;
}

export function getSessionCookieOptions() {
  return {
    name: COOKIE_NAME,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_DURATION_MS / 1000,
  };
}

export { COOKIE_NAME };
