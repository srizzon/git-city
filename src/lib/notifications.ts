import crypto from "node:crypto";
import { getSupabaseAdmin } from "./supabase";
import { getResend } from "./resend";
import { getDeveloperEmail, isRecentlyActive } from "./notification-helpers";
import { wrapInBaseTemplate } from "./email-template";

// ── Types ──

export type Channel = "email" | "push" | "in_app";

export type NotificationCategory =
  | "transactional"
  | "social"
  | "digest"
  | "marketing"
  | "streak_reminders";

export type Priority = "high" | "normal" | "low";

export interface NotificationPayload {
  type: string;                          // 'welcome', 'raid_alert', etc.
  category: NotificationCategory;
  developerId: number;
  dedupKey: string;

  // Content (adapts per channel)
  title: string;                         // email subject, push title
  body: string;                          // push body, email preview text
  html?: string;                         // rich email body (wrapped in base template)
  actionUrl?: string;                    // CTA link / deep link
  iconUrl?: string;                      // push notification icon
  data?: Record<string, unknown>;        // structured data for push/in_app deep links

  // Behavior
  forceSend?: boolean;                   // bypass preferences (purchase receipts)
  channels?: Channel[];                  // restrict to these channels (default: ["email"])
  skipIfActive?: boolean;                // skip if user was active < 5 min ago
  priority?: Priority;                   // high = never batch, low = batch eligible

  // Batching (for low/normal priority)
  batchKey?: string;                     // group key: "raids:42", "social:42"
  batchWindowMinutes?: number;           // how long to accumulate (default: 60)
  batchEventData?: Record<string, unknown>; // data for this individual event within a batch
}

export interface SendResult {
  channel: Channel;
  success: boolean;
  providerId?: string;
  skipped?: string;
  batched?: boolean;                     // true if added to batch instead of sent
}

// ── Config ──

const FROM = "Git City <noreply@thegitcity.com>";
const HMAC_SECRET = process.env.UNSUBSCRIBE_HMAC_SECRET || process.env.CRON_SECRET || "fallback-secret";
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://thegitcity.com";

const RATE_LIMITS: Record<Channel, { perHour: number; perDay: number }> = {
  email: { perHour: 5, perDay: 10 },
  push: { perHour: 10, perDay: 30 },
  in_app: { perHour: 100, perDay: 500 },
};

// ── Public API ──

/**
 * Send a notification through the full pipeline.
 * Handles preferences, suppressions, dedup, rate limiting, batching, and dispatch.
 */
export async function sendNotification(payload: NotificationPayload): Promise<SendResult[]> {
  const results: SendResult[] = [];
  const sb = getSupabaseAdmin();
  const targetChannels = payload.channels ?? ["email"] as Channel[];

  // Skip all channels if user is recently active
  if (payload.skipIfActive) {
    if (await isRecentlyActive(payload.developerId)) {
      for (const ch of targetChannels) {
        results.push({ channel: ch, success: false, skipped: "user_recently_active" });
      }
      return results;
    }
  }

  const prefs = await getPreferences(payload.developerId);

  for (const channel of targetChannels) {
    try {
      const result = await processChannel(sb, channel, payload, prefs);
      results.push(result);
    } catch (err) {
      console.error(`[notify] ${channel} error for dev ${payload.developerId}:`, err);
      results.push({ channel, success: false, skipped: "send_error" });
    }
  }

  return results;
}

/**
 * Fire-and-forget wrapper. Use this in API routes so notifications
 * never block the response. Errors are logged, not thrown.
 */
export function sendNotificationAsync(payload: NotificationPayload): void {
  sendNotification(payload).catch((err) => {
    console.error(`[notify:async] Failed for ${payload.type} dev=${payload.developerId}:`, err);
  });
}

/**
 * Flush all closed batches. Called by cron job.
 * Returns number of batches flushed.
 */
export async function flushPendingBatches(): Promise<number> {
  const sb = getSupabaseAdmin();

  const { data: batches } = await sb
    .from("notification_batches")
    .select("id, batch_key, developer_id, notification_type, channel")
    .is("processed_at", null)
    .lte("closes_at", new Date().toISOString())
    .order("closes_at", { ascending: true })
    .limit(100);

  if (!batches || batches.length === 0) return 0;

  let flushed = 0;

  for (const batch of batches) {
    try {
      const { data: items } = await sb
        .from("notification_batch_items")
        .select("event_data, created_at")
        .eq("batch_id", batch.id)
        .order("created_at", { ascending: true });

      if (!items || items.length === 0) {
        // Empty batch, just mark processed
        await sb
          .from("notification_batches")
          .update({ processed_at: new Date().toISOString() })
          .eq("id", batch.id);
        continue;
      }

      // Build digest notification from batch items
      const digestPayload = buildDigestFromBatch(batch, items);
      if (digestPayload) {
        await sendNotification(digestPayload);
      }

      await sb
        .from("notification_batches")
        .update({ processed_at: new Date().toISOString() })
        .eq("id", batch.id);

      flushed++;
    } catch (err) {
      console.error(`[notify:batch] Failed to flush batch ${batch.id}:`, err);
    }
  }

  return flushed;
}

// ── Channel Processing Pipeline ──

async function processChannel(
  sb: ReturnType<typeof getSupabaseAdmin>,
  channel: Channel,
  payload: NotificationPayload,
  prefs: NotificationPrefs,
): Promise<SendResult> {
  // 1. Check channel master toggle
  if (!payload.forceSend) {
    if (channel === "email" && !prefs.email_enabled) {
      return { channel, success: false, skipped: "channel_disabled" };
    }
    if (channel === "push" && !prefs.push_enabled) {
      return { channel, success: false, skipped: "channel_disabled" };
    }
  }

  // 2. Check category preference (with channel_overrides)
  if (!payload.forceSend) {
    if (!getCategoryEnabled(prefs, channel, payload.category)) {
      return { channel, success: false, skipped: "category_disabled" };
    }
  }

  // 3. Dedup check
  if (payload.dedupKey) {
    const { data: existing } = await sb
      .from("notification_log")
      .select("id")
      .eq("dedup_key", payload.dedupKey)
      .eq("channel", channel)
      .maybeSingle();

    if (existing) {
      return { channel, success: false, skipped: "duplicate" };
    }
  }

  // 4. Rate limit check (if rate limited and batch eligible, route to batch)
  const rateLimited = await checkRateLimit(sb, payload.developerId, channel);
  if (rateLimited) {
    if (payload.batchKey && payload.priority !== "high") {
      return await addToBatch(sb, channel, payload);
    }
    return { channel, success: false, skipped: `rate_limited:${rateLimited}` };
  }

  // 5. Batching: if low priority and user prefers digests, batch instead of sending
  if (shouldBatch(payload, prefs)) {
    return await addToBatch(sb, channel, payload);
  }

  // 6. Dispatch to channel-specific sender
  switch (channel) {
    case "email":
      return await dispatchEmail(sb, payload);
    case "push":
      return await dispatchPush(sb, payload);
    case "in_app":
      return await dispatchInApp(sb, payload);
  }
}

// ── Batching ──

function shouldBatch(payload: NotificationPayload, prefs: NotificationPrefs): boolean {
  if (payload.priority === "high") return false;
  if (payload.forceSend) return false;
  if (!payload.batchKey) return false;

  // Only batch if user has chosen non-realtime digest
  if (prefs.digest_frequency === "realtime") return false;

  return true;
}

async function addToBatch(
  sb: ReturnType<typeof getSupabaseAdmin>,
  channel: Channel,
  payload: NotificationPayload,
): Promise<SendResult> {
  const batchKey = `${payload.batchKey}:${channel}`;
  const windowMinutes = payload.batchWindowMinutes ?? 60;

  // Find or create open batch
  const { data: existingBatch } = await sb
    .from("notification_batches")
    .select("id")
    .eq("batch_key", batchKey)
    .eq("channel", channel)
    .is("processed_at", null)
    .gt("closes_at", new Date().toISOString())
    .maybeSingle();

  let batchId: number;

  if (existingBatch) {
    batchId = existingBatch.id;
  } else {
    const closesAt = new Date(Date.now() + windowMinutes * 60_000).toISOString();
    const { data: newBatch, error } = await sb
      .from("notification_batches")
      .insert({
        batch_key: batchKey,
        developer_id: payload.developerId,
        notification_type: payload.type,
        channel,
        closes_at: closesAt,
      })
      .select("id")
      .single();

    if (error) {
      // Race condition: another process created the batch. Try to find it.
      const { data: raceBatch } = await sb
        .from("notification_batches")
        .select("id")
        .eq("batch_key", batchKey)
        .eq("channel", channel)
        .is("processed_at", null)
        .gt("closes_at", new Date().toISOString())
        .maybeSingle();

      if (!raceBatch) {
        console.error(`[notify:batch] Failed to create/find batch for ${batchKey}:`, error);
        return { channel, success: false, skipped: "batch_create_failed" };
      }
      batchId = raceBatch.id;
    } else {
      batchId = newBatch.id;
    }
  }

  // Add event to batch
  await sb.from("notification_batch_items").insert({
    batch_id: batchId,
    event_data: {
      type: payload.type,
      title: payload.title,
      body: payload.body,
      action_url: payload.actionUrl,
      ...payload.batchEventData,
    },
  });

  return { channel, success: true, batched: true };
}

function buildDigestFromBatch(
  batch: { id: number; developer_id: number; notification_type: string; channel: string },
  items: { event_data: Record<string, unknown>; created_at: string }[],
): NotificationPayload | null {
  const count = items.length;
  if (count === 0) return null;

  // Build a summary based on notification type
  const typeMap: Record<string, { title: string; bodyFn: (n: number) => string }> = {
    raid_alert: {
      title: `Your building was raided ${count} time${count > 1 ? "s" : ""}!`,
      bodyFn: (n) => `${n} raid${n > 1 ? "s" : ""} while you were away.`,
    },
    achievement_unlocked: {
      title: `${count} new achievement${count > 1 ? "s" : ""} unlocked!`,
      bodyFn: (n) => `You unlocked ${n} achievement${n > 1 ? "s" : ""}.`,
    },
    kudos_received: {
      title: `You received ${count} kudos!`,
      bodyFn: (n) => `${n} developer${n > 1 ? "s" : ""} gave you kudos.`,
    },
  };

  const template = typeMap[batch.notification_type] ?? {
    title: `${count} new notification${count > 1 ? "s" : ""}`,
    bodyFn: (n: number) => `You have ${n} new notification${n > 1 ? "s" : ""}.`,
  };

  // Build HTML listing individual events
  const eventListHtml = items
    .slice(0, 10) // Cap at 10 items in digest
    .map((item) => {
      const d = item.event_data as Record<string, string>;
      return `<li style="margin-bottom: 4px; color: #e0d8cc;">${d.body || d.title || "New event"}</li>`;
    })
    .join("");

  const remainingText = count > 10 ? `<p style="color: #666; font-size: 13px;">...and ${count - 10} more</p>` : "";

  return {
    type: `${batch.notification_type}_digest`,
    category: "digest",
    developerId: batch.developer_id,
    dedupKey: `digest:${batch.id}`,
    title: template.title,
    body: template.bodyFn(count),
    html: `
      <p style="color: #e0d8cc; font-size: 15px;">${template.bodyFn(count)}</p>
      <ul style="padding-left: 20px; margin: 16px 0;">${eventListHtml}</ul>
      ${remainingText}
    `,
    actionUrl: `${BASE_URL}`,
    priority: "high", // Digests themselves are never re-batched
    channels: [batch.channel as Channel],
  };
}

// ── Email Dispatch ──

async function dispatchEmail(
  sb: ReturnType<typeof getSupabaseAdmin>,
  payload: NotificationPayload,
): Promise<SendResult> {
  const email = await getDeveloperEmail(payload.developerId);
  if (!email) {
    return { channel: "email", success: false, skipped: "no_email" };
  }

  // Check suppressions
  const { data: suppressed } = await sb
    .from("notification_suppressions")
    .select("reason")
    .eq("identifier", email)
    .eq("channel", "email")
    .maybeSingle();

  if (suppressed) {
    return { channel: "email", success: false, skipped: `suppressed:${suppressed.reason}` };
  }

  // Build unsubscribe URL (transactional/forceSend still get one for CAN-SPAM)
  const unsubCategory = payload.forceSend ? "all" : payload.category;
  const unsubUrl = buildUnsubscribeUrl(payload.developerId, unsubCategory);

  // Build final HTML
  const bodyHtml = payload.html || `<p>${escapeBasicHtml(payload.body)}</p>`;
  const fullHtml = wrapInBaseTemplate(bodyHtml, unsubUrl);

  // Send via Resend
  const resend = getResend();
  const { data: sent, error } = await resend.emails.send({
    from: FROM,
    to: email,
    subject: payload.title,
    html: fullHtml,
    headers: {
      "List-Unsubscribe": `<${unsubUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });

  const status = error ? "failed" : "sent";
  const providerId = sent?.id;

  // Log to notification_log
  await sb.from("notification_log").insert({
    developer_id: payload.developerId,
    channel: "email",
    notification_type: payload.type,
    recipient: email,
    title: payload.title,
    provider_id: providerId ?? null,
    status,
    failed_at: error ? new Date().toISOString() : null,
    failure_reason: error ? String(error.message ?? error) : null,
    metadata: { body_preview: payload.body.slice(0, 200) },
    dedup_key: payload.dedupKey || null,
  });

  if (error) {
    console.error(`[notify:email] Resend error for ${email}:`, error);
    return { channel: "email", success: false, skipped: "resend_error" };
  }

  return { channel: "email", success: true, providerId: providerId ?? undefined };
}

// ── Push Dispatch (ready for implementation) ──

async function dispatchPush(
  sb: ReturnType<typeof getSupabaseAdmin>,
  payload: NotificationPayload,
): Promise<SendResult> {
  const { data: subs } = await sb
    .from("push_subscriptions")
    .select("id, token, platform")
    .eq("developer_id", payload.developerId)
    .eq("active", true);

  if (!subs || subs.length === 0) {
    return { channel: "push", success: false, skipped: "no_push_token" };
  }

  // Check quiet hours (forceSend bypasses)
  if (!payload.forceSend) {
    const inQuietHours = await isInQuietHours(sb, payload.developerId);
    if (inQuietHours) {
      return { channel: "push", success: false, skipped: "quiet_hours" };
    }
  }

  // TODO: Replace with actual FCM/APNs/Web Push when implementing push
  // Right now, log intent for tracking and analytics
  await sb.from("notification_log").insert({
    developer_id: payload.developerId,
    channel: "push",
    notification_type: payload.type,
    recipient: `${subs.length}_devices`,
    title: payload.title,
    status: "pending_implementation",
    metadata: {
      body: payload.body,
      action_url: payload.actionUrl,
      icon_url: payload.iconUrl,
      data: payload.data,
      platforms: subs.map((s) => s.platform),
      tokens_count: subs.length,
    },
    dedup_key: payload.dedupKey || null,
  });

  return { channel: "push", success: false, skipped: "push_not_implemented" };
}

// ── In-App Dispatch ──

async function dispatchInApp(
  sb: ReturnType<typeof getSupabaseAdmin>,
  payload: NotificationPayload,
): Promise<SendResult> {
  // in_app always sends (ignores preferences) to maintain notification history
  await sb.from("notification_log").insert({
    developer_id: payload.developerId,
    channel: "in_app",
    notification_type: payload.type,
    recipient: String(payload.developerId),
    title: payload.title,
    status: "sent",
    metadata: {
      body: payload.body,
      action_url: payload.actionUrl,
      icon_url: payload.iconUrl,
      data: payload.data,
    },
    dedup_key: payload.dedupKey || null,
  });

  return { channel: "in_app", success: true };
}

// ── Preferences ──

interface NotificationPrefs {
  email_enabled: boolean;
  push_enabled: boolean;
  transactional: boolean;
  social: boolean;
  digest: boolean;
  marketing: boolean;
  streak_reminders: boolean;
  digest_frequency: "realtime" | "hourly" | "daily" | "weekly";
  quiet_hours_start: number | null;
  quiet_hours_end: number | null;
  channel_overrides: Record<string, Record<string, boolean>>;
}

const DEFAULT_PREFS: NotificationPrefs = {
  email_enabled: true,
  push_enabled: true,
  transactional: true,
  social: true,
  digest: true,
  marketing: false,
  streak_reminders: true,
  digest_frequency: "realtime",
  quiet_hours_start: null,
  quiet_hours_end: null,
  channel_overrides: {},
};

async function getPreferences(devId: number): Promise<NotificationPrefs> {
  const sb = getSupabaseAdmin();
  const { data } = await sb
    .from("notification_preferences")
    .select("*")
    .eq("developer_id", devId)
    .maybeSingle();

  if (!data) return DEFAULT_PREFS;

  return {
    email_enabled: data.email_enabled ?? true,
    push_enabled: data.push_enabled ?? true,
    transactional: data.transactional ?? true,
    social: data.social ?? true,
    digest: data.digest ?? true,
    marketing: data.marketing ?? false,
    streak_reminders: data.streak_reminders ?? true,
    digest_frequency: data.digest_frequency ?? "realtime",
    quiet_hours_start: data.quiet_hours_start ?? null,
    quiet_hours_end: data.quiet_hours_end ?? null,
    channel_overrides: (data.channel_overrides as Record<string, Record<string, boolean>>) ?? {},
  };
}

/**
 * Check if a category is enabled for a specific channel.
 * Priority: channel_overrides > category toggle
 */
function getCategoryEnabled(
  prefs: NotificationPrefs,
  channel: Channel,
  category: NotificationCategory,
): boolean {
  const override = prefs.channel_overrides?.[channel]?.[category];
  if (typeof override === "boolean") return override;
  return prefs[category] ?? true;
}

// ── Rate Limiting ──

async function checkRateLimit(
  sb: ReturnType<typeof getSupabaseAdmin>,
  devId: number,
  channel: Channel,
): Promise<string | null> {
  const limits = RATE_LIMITS[channel];
  const now = new Date();

  const oneHourAgo = new Date(now.getTime() - 3_600_000).toISOString();
  const { count: hourCount } = await sb
    .from("notification_log")
    .select("id", { count: "exact", head: true })
    .eq("developer_id", devId)
    .eq("channel", channel)
    .eq("status", "sent")
    .gte("created_at", oneHourAgo);

  if ((hourCount ?? 0) >= limits.perHour) return "hourly";

  const oneDayAgo = new Date(now.getTime() - 86_400_000).toISOString();
  const { count: dayCount } = await sb
    .from("notification_log")
    .select("id", { count: "exact", head: true })
    .eq("developer_id", devId)
    .eq("channel", channel)
    .eq("status", "sent")
    .gte("created_at", oneDayAgo);

  if ((dayCount ?? 0) >= limits.perDay) return "daily";

  return null;
}

// ── Quiet Hours ──

async function isInQuietHours(
  sb: ReturnType<typeof getSupabaseAdmin>,
  devId: number,
): Promise<boolean> {
  const { data } = await sb
    .from("notification_preferences")
    .select("quiet_hours_start, quiet_hours_end")
    .eq("developer_id", devId)
    .maybeSingle();

  if (data?.quiet_hours_start == null || data?.quiet_hours_end == null) return false;

  const { data: dev } = await sb
    .from("developers")
    .select("timezone")
    .eq("id", devId)
    .single();

  const tz = dev?.timezone || "UTC";
  let currentHour: number;
  try {
    const formatter = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false });
    currentHour = parseInt(formatter.format(new Date()), 10);
  } catch {
    currentHour = new Date().getUTCHours();
  }

  const start = data.quiet_hours_start;
  const end = data.quiet_hours_end;

  // Handle wrap-around (e.g., 22:00 - 07:00)
  if (start <= end) {
    return currentHour >= start && currentHour < end;
  }
  return currentHour >= start || currentHour < end;
}

// ── Unsubscribe URL ──

export function buildUnsubscribeUrl(devId: number, category: NotificationCategory | "all"): string {
  const token = generateHmacToken(devId, category);
  return `${BASE_URL}/api/unsubscribe?dev=${devId}&cat=${category}&token=${token}`;
}

export function generateHmacToken(devId: number, category: string): string {
  return crypto
    .createHmac("sha256", HMAC_SECRET)
    .update(`${devId}:${category}`)
    .digest("hex")
    .slice(0, 32);
}

export function verifyHmacToken(devId: number, category: string, token: string): boolean {
  const expected = generateHmacToken(devId, category);
  if (expected.length !== token.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token));
}

// ── Helpers ──

function escapeBasicHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
