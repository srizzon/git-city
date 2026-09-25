import crypto from "node:crypto";
import { getSupabaseAdmin } from "./supabase";
import { sendEmail, toResendTag } from "./resend";
import { mapWithConcurrency } from "./concurrency";
import { getDeveloperEmail, isRecentlyActive } from "./notification-helpers";
import { renderLayout, renderText, type EmailLinks } from "./email/layout";
import { bulletList, button, heading, paragraph, trackedUrl } from "./email/components";
import { FROM_MAIL, FROM_NOTIFY } from "./email/senders";

// ── Types ──

export type Channel = "email" | "push" | "in_app";

export type NotificationCategory =
  | "transactional"
  | "social"
  | "digest"
  | "marketing"
  | "streak_reminders"
  | "jobs_applications"
  | "jobs_performance"
  | "jobs_digest"
  | "jobs_updates"
  | "leagues";

export type Priority = "high" | "normal" | "low";

export interface NotificationPayload {
  type: string;                          // 'welcome', 'raid_alert', etc.
  category: NotificationCategory;
  developerId: number;
  dedupKey: string;

  // Content (adapts per channel)
  title: string;                         // email subject, push title
  body: string;                          // push body, email preview text
  render?: (links: EmailLinks) => { html: string; text: string }; // full email; without it the body is sent as one paragraph
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

const HMAC_SECRET = (() => {
  const secret = process.env.UNSUBSCRIBE_HMAC_SECRET;
  if (!secret) {
    throw new Error("[notifications] UNSUBSCRIBE_HMAC_SECRET is required but not set.");
  }
  return secret;
})();
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://thegitcity.com";

// Non-transactional caps. Over the cap, batchable events (raids, emblems) roll
// into the next digest instead of being dropped.
const RATE_LIMITS: Record<Channel, { perHour: number; perDay: number; perWeek: number }> = {
  email: { perHour: 2, perDay: 3, perWeek: 8 },
  push: { perHour: 20, perDay: 50, perWeek: 200 },
  in_app: { perHour: 200, perDay: 1000, perWeek: 5000 },
};

// Recaps and marketing stop for anyone idle this long (sunset). Social
// triggers like raid alerts still go out: they're the best way back in.
const SUNSET_DAYS = 90;
const SUNSET_CATEGORIES: NotificationCategory[] = ["digest", "marketing"];

// Categories exempt from rate limiting (always send)
const RATE_LIMIT_EXEMPT: NotificationCategory[] = ["transactional"];

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

/** Collapse a sendNotification result into one outcome, for cron counters. */
export function sendOutcome(results: SendResult[]): "sent" | "skipped" | "error" {
  if (results.some((r) => r.success)) return "sent";
  if (results.some((r) => r.skipped === "resend_error" || r.skipped === "send_error")) return "error";
  return "skipped";
}

/** Add settled sendNotification calls to a cron's { sent, skipped, errors } counters. */
export function tallySends(
  settled: PromiseSettledResult<SendResult[]>[],
  counters: { sent: number; skipped: number; errors: number },
): void {
  for (const r of settled) {
    const outcome = r.status === "fulfilled" ? sendOutcome(r.value) : "error";
    if (outcome === "sent") counters.sent++;
    else if (outcome === "error") counters.errors++;
    else counters.skipped++;
  }
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
export async function flushPendingBatches(deadline = Infinity): Promise<number> {
  const sb = getSupabaseAdmin();

  const { data: batches } = await sb
    .from("notification_batches")
    .select("id, batch_key, developer_id, notification_type, channel, closes_at")
    .is("processed_at", null)
    .lte("closes_at", new Date().toISOString())
    .order("closes_at", { ascending: true })
    .limit(100);

  if (!batches || batches.length === 0) return 0;

  let flushed = 0;

  // Processed batches are deleted (items cascade) so the next batch for the
  // same key can be created under UNIQUE(batch_key, channel).
  const removeBatch = (id: number) => sb.from("notification_batches").delete().eq("id", id);

  await mapWithConcurrency(batches, 4, async (batch) => {
    if (Date.now() > deadline) return;
    try {
      const { data: items } = await sb
        .from("notification_batch_items")
        .select("event_data, created_at")
        .eq("batch_id", batch.id)
        .order("created_at", { ascending: true });

      if (!items || items.length === 0) {
        await removeBatch(batch.id);
        return;
      }

      // Build digest notification from batch items
      const digestPayload = buildDigestFromBatch(batch, items);
      if (digestPayload) {
        const results = await sendNotification(digestPayload);
        // Keep a batch whose send errored for the next flush, for up to a day.
        const errored = results.some((r) => r.skipped === "resend_error" || r.skipped === "send_error");
        const stale = Date.now() - Date.parse(batch.closes_at) > 86_400_000;
        if (errored && !stale) return;
      }

      await removeBatch(batch.id);
      flushed++;
    } catch (err) {
      console.error(`[notify:batch] Failed to flush batch ${batch.id}:`, err);
    }
  });

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

  // Sunset: no recaps or marketing for long-idle players
  if (!payload.forceSend && SUNSET_CATEGORIES.includes(payload.category)) {
    if (!(await isRecentlyActive(payload.developerId, SUNSET_DAYS * 24 * 60))) {
      return { channel, success: false, skipped: "sunset" };
    }
  }

  // 3. Dedup check (a failed attempt doesn't count, so it can be retried)
  if (payload.dedupKey) {
    const { data: existing } = await sb
      .from("notification_log")
      .select("id")
      .eq("dedup_key", payload.dedupKey)
      .eq("channel", channel)
      .neq("status", "failed")
      .maybeSingle();

    if (existing) {
      return { channel, success: false, skipped: "duplicate" };
    }
  }

  // 4. Rate limit check (exempt transactional, if rate limited and batch eligible, route to batch)
  const isExempt = RATE_LIMIT_EXEMPT.includes(payload.category) || payload.forceSend;
  const rateLimited = isExempt ? null : await checkRateLimit(sb, payload.developerId, channel);
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
      // UNIQUE(batch_key, channel): either another process created the batch,
      // a closed batch is waiting for the flush cron (join it, it goes out on
      // the next flush), or a legacy processed row is still holding the key.
      const { data: pendingBatch } = await sb
        .from("notification_batches")
        .select("id")
        .eq("batch_key", batchKey)
        .eq("channel", channel)
        .is("processed_at", null)
        .maybeSingle();

      if (pendingBatch) {
        batchId = pendingBatch.id;
      } else {
        // Processed batches are deleted on flush now; clear an old one and retry.
        await sb
          .from("notification_batches")
          .delete()
          .eq("batch_key", batchKey)
          .eq("channel", channel)
          .not("processed_at", "is", null);

        const { data: retryBatch, error: retryError } = await sb
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

        if (retryError || !retryBatch) {
          console.error(`[notify:batch] Failed to create/find batch for ${batchKey}:`, retryError ?? error);
          return { channel, success: false, skipped: "batch_create_failed" };
        }
        batchId = retryBatch.id;
      }
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
  if (items.length === 0) return null;

  const eventData = items.map((i) => i.event_data);
  const { subject, preheader } = digestContent(batch.notification_type, eventData);

  return {
    type: `${batch.notification_type}_digest`,
    // Same category as the events it bundles, so the raid/jobs toggles (not
    // the weekly recap one) control it and the recap sunset doesn't stop it.
    category: batch.notification_type === "job_filled" ? "jobs_updates" : "social",
    developerId: batch.developer_id,
    dedupKey: `digest:${batch.id}`,
    title: subject,
    body: preheader,
    render: (links) => renderDigestEmail(batch.notification_type, eventData, links),
    actionUrl: `${BASE_URL}`,
    priority: "high", // Digests themselves are never re-batched
    channels: [batch.channel as Channel],
  };
}

const DIGEST_MAX_ROWS = 10;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Subject, rows and CTA for a batched digest, per notification type. */
function digestContent(type: string, events: Record<string, unknown>[]) {
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const num = (v: unknown) => (typeof v === "number" ? v : 0);
  const firstUrl = events.map((e) => str(e.action_url)).find(Boolean) || BASE_URL;
  const count = events.length;

  if (type === "raid_alert") {
    const tagged = events.filter((e) => e.success === true);
    const held = count - tagged.length;
    const lastTagger = str(tagged[tagged.length - 1]?.attacker);
    return {
      subject: count === 1 ? "Your building was raided" : `Your building was raided ${count} times`,
      preheader: tagged.length === 0
        ? `You held off ${count === 1 ? "the attack" : `all ${count}`}.`
        : held === 0
          ? `${count === 1 ? "It" : "All of them"} got through.`
          : `${plural(tagged.length, "raid")} got through, you held off ${held}.`,
      title: ["", plural(count, "raid"), " on your building"] as [string, string, string],
      rows: events.map((e) => {
        const a = num(e.attack_score);
        const d = num(e.defense_score);
        return e.success === true
          ? { lead: `@${str(e.attacker)}`, text: `tagged your building, attack ${a} vs your defense ${d}.` }
          : { lead: `@${str(e.attacker)}`, text: `was held off, your defense ${d} vs attack ${a}.` };
      }),
      cta: lastTagger
        ? { text: `Raid @${lastTagger} back`, url: `${BASE_URL}/?user=${encodeURIComponent(lastTagger)}` }
        : { text: "Open Git City", url: BASE_URL },
    };
  }

  if (type === "emblem_earned") {
    const emblems = events.flatMap((e) =>
      Array.isArray(e.emblems) ? (e.emblems as { name?: unknown; tier?: unknown }[]) : [],
    );
    const tier = (t: unknown) => (str(t) ? `${str(t).charAt(0).toUpperCase()}${str(t).slice(1)} emblem.` : "Emblem.");
    return {
      subject: `You earned ${plural(emblems.length, "emblem")}`,
      preheader: `${emblems.length === 1 ? "It's" : "They're"} in your trophy case now.`,
      title: ["You earned", plural(emblems.length, "emblem"), ""] as [string, string, string],
      rows: emblems.map((e) => ({ lead: `${str(e.name)}.`, text: tier(e.tier) })),
      cta: { text: "See your trophy case", url: firstUrl },
    };
  }

  if (type === "job_filled") {
    return {
      subject: count === 1 ? "A role you applied to was filled" : `${count} roles you applied to were filled`,
      preheader: `${count === 1 ? "It's" : "They're"} no longer open. There are more roles on the job board.`,
      title: ["", plural(count, "role"), ` you applied to ${count === 1 ? "was" : "were"} filled`] as [string, string, string],
      rows: events.map((e) => ({ lead: str(e.listing) || str(e.title), text: str(e.company) ? `at ${str(e.company)}.` : "" })),
      cta: { text: "Browse jobs", url: `${BASE_URL}/jobs` },
    };
  }

  return {
    subject: `${plural(count, "new notification")}`,
    preheader: "Here's what happened in Git City.",
    title: ["", plural(count, "new notification"), ""] as [string, string, string],
    rows: events.map((e) => ({ lead: str(e.title) || "New event", text: str(e.body) })),
    cta: { text: "Open Git City", url: firstUrl },
  };
}

/** Batched raid / emblem / job digest in the email layout. */
export function renderDigestEmail(type: string, events: Record<string, unknown>[], links: EmailLinks) {
  const { subject, preheader, title, rows, cta } = digestContent(type, events);
  const url = trackedUrl(cta.url, `${type}_digest`);
  const shown = rows.slice(0, DIGEST_MAX_ROWS);
  const more = rows.length > DIGEST_MAX_ROWS ? `And ${rows.length - DIGEST_MAX_ROWS} more.` : null;
  const reason = "You're getting this digest because several notifications arrived close together on Git City.";

  const html = renderLayout({
    title: subject,
    preheader,
    body: [
      heading(title[0], title[1], title[2]),
      paragraph(preheader),
      bulletList(shown),
      more ? paragraph(more, { muted: true }) : "",
      button(cta.text, url),
    ].join("\n"),
    reason,
    links,
  });

  const text = renderText({
    lines: [
      title.join(" ").replace(/\s+/g, " ").trim(),
      "",
      preheader,
      "",
      ...shown.map((r) => `- ${r.lead} ${r.text}`.trimEnd()),
      ...(more ? [more] : []),
      "",
      `${cta.text}: ${url}`,
    ],
    reason,
    links,
  });

  return { subject, preheader, html, text };
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

  // Receipts and account mail (transactional or forceSend) carry no
  // unsubscribe: it used to switch off "transactional" or all email, with no
  // way back in settings. They link to email settings instead.
  const isTransactional = payload.forceSend || payload.category === "transactional";
  const unsubUrl = isTransactional ? undefined : buildUnsubscribeUrl(payload.developerId, payload.category);

  // Build final HTML
  let fullHtml: string;
  let text = payload.body;
  if (payload.render) {
    const rendered = payload.render({ unsubscribeUrl: unsubUrl });
    fullHtml = rendered.html;
    text = rendered.text;
  } else {
    const reason = "You're getting this because you have a Git City account.";
    const links = { unsubscribeUrl: unsubUrl };
    fullHtml = renderLayout({ title: payload.title, preheader: payload.body, body: paragraph(payload.body), reason, links });
    text = renderText({ lines: [payload.body], reason, links });
  }

  // Send via Resend (throttled, retried on 429, idempotent per dedup key)
  const { data: sent, error } = await sendEmail(
    {
      from: isTransactional ? FROM_NOTIFY : FROM_MAIL,
      to: email,
      subject: payload.title,
      html: fullHtml,
      text,
      headers: unsubUrl
        ? {
            "List-Unsubscribe": `<${unsubUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          }
        : undefined,
      tags: [
        { name: "type", value: toResendTag(payload.type) },
        { name: "category", value: toResendTag(payload.category) },
      ],
    },
    payload.dedupKey ? { idempotencyKey: payload.dedupKey.slice(0, 256) } : undefined,
  );

  const status = error ? "failed" : "sent";
  const providerId = sent?.id;

  // Log to notification_log. Upsert because a retry reuses the dedup key of
  // the failed row (UNIQUE(dedup_key, channel)).
  await sb.from("notification_log").upsert({
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
    created_at: new Date().toISOString(),
  }, { onConflict: "dedup_key,channel" });

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
  jobs_applications: boolean;
  jobs_performance: boolean;
  jobs_digest: boolean;
  jobs_updates: boolean;
  leagues: boolean;
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
  jobs_applications: true,
  jobs_performance: true,
  jobs_digest: true,
  jobs_updates: true,
  leagues: true,
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
    jobs_applications: data.jobs_applications ?? true,
    jobs_performance: data.jobs_performance ?? true,
    jobs_digest: data.jobs_digest ?? true,
    jobs_updates: data.jobs_updates ?? true,
    leagues: data.leagues ?? true,
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
    .neq("status", "failed") // the webhook rewrites "sent" to delivered/bounced/...
    .gte("created_at", oneHourAgo);

  if ((hourCount ?? 0) >= limits.perHour) return "hourly";

  const oneDayAgo = new Date(now.getTime() - 86_400_000).toISOString();
  const { count: dayCount } = await sb
    .from("notification_log")
    .select("id", { count: "exact", head: true })
    .eq("developer_id", devId)
    .eq("channel", channel)
    .neq("status", "failed")
    .gte("created_at", oneDayAgo);

  if ((dayCount ?? 0) >= limits.perDay) return "daily";

  const oneWeekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const { count: weekCount } = await sb
    .from("notification_log")
    .select("id", { count: "exact", head: true })
    .eq("developer_id", devId)
    .eq("channel", channel)
    .neq("status", "failed")
    .gte("created_at", oneWeekAgo);

  if ((weekCount ?? 0) >= limits.perWeek) return "weekly";

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
