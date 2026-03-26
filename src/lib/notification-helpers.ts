import { getSupabaseAdmin } from "./supabase";

// Simple in-memory cache for developer emails (per-process, resets on cold start)
const emailCache = new Map<number, { email: string | null; ts: number }>();
const CACHE_TTL = 60_000; // 1 minute

/**
 * Get a developer's email, with fallback to auth.users via admin API.
 * Returns null if no email found (e.g. private GitHub email).
 */
export async function getDeveloperEmail(devId: number): Promise<string | null> {
  const cached = emailCache.get(devId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.email;

  const sb = getSupabaseAdmin();

  const { data: dev } = await sb
    .from("developers")
    .select("email, claimed_by")
    .eq("id", devId)
    .single();

  if (dev?.email) {
    emailCache.set(devId, { email: dev.email, ts: Date.now() });
    return dev.email;
  }

  // Fallback: fetch from auth.users via admin API
  if (dev?.claimed_by) {
    const { data: authUser } = await sb.auth.admin.getUserById(dev.claimed_by);
    const authEmail = authUser?.user?.email ?? null;

    if (authEmail) {
      await sb
        .from("developers")
        .update({ email: authEmail, email_updated_at: new Date().toISOString() })
        .eq("id", devId);
    }

    emailCache.set(devId, { email: authEmail, ts: Date.now() });
    return authEmail;
  }

  emailCache.set(devId, { email: null, ts: Date.now() });
  return null;
}

/**
 * Check if a developer was active in the last N minutes.
 * Used to skip notifications for users currently online.
 */
export async function isRecentlyActive(devId: number, minutesAgo = 5): Promise<boolean> {
  const sb = getSupabaseAdmin();
  const cutoff = new Date(Date.now() - minutesAgo * 60_000).toISOString();

  const { data } = await sb
    .from("developers")
    .select("last_active_at")
    .eq("id", devId)
    .single();

  if (!data?.last_active_at) return false;
  return data.last_active_at > cutoff;
}

/**
 * Get multiple developers' push tokens for batch sends.
 */
export async function getPushTokens(devId: number): Promise<{ token: string; platform: string }[]> {
  const sb = getSupabaseAdmin();
  const { data } = await sb
    .from("push_subscriptions")
    .select("token, platform")
    .eq("developer_id", devId)
    .eq("active", true);

  return data ?? [];
}

/**
 * Update last_active_at for a developer. Fire-and-forget.
 */
export function touchLastActive(devId: number): void {
  const sb = getSupabaseAdmin();
  sb.from("developers")
    .update({ last_active_at: new Date().toISOString() })
    .eq("id", devId)
    .then();
}

/**
 * Cache email on developers table from auth callback.
 */
export async function cacheEmailFromAuth(devId: number, authUserId: string): Promise<void> {
  const sb = getSupabaseAdmin();
  const { data: authUser } = await sb.auth.admin.getUserById(authUserId);
  const email = authUser?.user?.email;
  if (email) {
    await sb
      .from("developers")
      .update({ email, email_updated_at: new Date().toISOString() })
      .eq("id", devId);
    // Warm cache
    emailCache.set(devId, { email, ts: Date.now() });
  }
}

/**
 * Ensure notification_preferences row exists for a developer.
 */
export async function ensurePreferences(devId: number): Promise<void> {
  const sb = getSupabaseAdmin();
  await sb
    .from("notification_preferences")
    .upsert({ developer_id: devId }, { onConflict: "developer_id", ignoreDuplicates: true });
}
