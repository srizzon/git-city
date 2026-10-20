// ─── Instagram (API with Instagram Login) ───────────────────
// The one connected account (@samuelrizzondev): its posts, replying to a
// comment, subscribing the app to its comment and message webhooks (a story
// that tags the account arrives as a message), who sent a message, and
// keeping the long-lived token alive. The token lives in instagram_account (migration
// 170) once the cron has refreshed it, INSTAGRAM_ACCESS_TOKEN before that.
// Webhook payloads are signed with INSTAGRAM_APP_SECRET. Server only.

import { createHmac, timingSafeEqual } from "node:crypto";
import { getSupabaseAdmin } from "./supabase";

const GRAPH = "https://graph.instagram.com/v26.0";

export interface IgMedia {
  id: string;
  permalink: string;
  caption?: string;
  media_product_type: string;
  timestamp: string;
  thumbnail_url?: string;
  media_url?: string;
  comments_count?: number;
}

export async function instagramToken(): Promise<string | null> {
  const { data } = await getSupabaseAdmin().from("instagram_account").select("access_token").eq("id", 1).maybeSingle<{ access_token: string }>();
  return data?.access_token ?? process.env.INSTAGRAM_ACCESS_TOKEN ?? null;
}

async function graph<T>(path: string, params: Record<string, string> = {}, method: "GET" | "POST" = "GET"): Promise<T> {
  const token = await instagramToken();
  if (!token) throw new Error("Instagram isn't connected (no token).");
  const url = new URL(`${GRAPH}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);
  const res = await fetch(url, { method, cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok || json.error) throw new Error(`Instagram ${path}: ${json.error?.message ?? res.status}`);
  return json;
}

export function instagramMe() {
  return graph<{ user_id: string; username: string }>("/me", { fields: "user_id,username" });
}

export async function instagramMedia(limit = 24): Promise<IgMedia[]> {
  const { data } = await graph<{ data: IgMedia[] }>("/me/media", { fields: "id,permalink,caption,media_product_type,timestamp,thumbnail_url,media_url,comments_count", limit: String(limit) });
  return data;
}

export function replyToComment(commentId: string, message: string) {
  return graph<{ id: string }>(`/${commentId}/replies`, { message }, "POST");
}

/**
 * Turns on the account's webhooks (the dashboard's webhook setup alone
 * doesn't): comments, and messages when the token has the messaging
 * permission (stories that tag the account). Without it, comments alone.
 */
export async function subscribeToComments(): Promise<{ fields: string }> {
  try {
    await graph<{ success: boolean }>("/me/subscribed_apps", { subscribed_fields: "comments,messages" }, "POST");
    return { fields: "comments,messages" };
  } catch {
    await graph<{ success: boolean }>("/me/subscribed_apps", { subscribed_fields: "comments" }, "POST");
    return { fields: "comments" };
  }
}

/** The username behind a message's sender (an Instagram-scoped id). */
export async function instagramUsernameOf(igsid: string): Promise<string | null> {
  const u = await graph<{ username?: string }>(`/${igsid}`, { fields: "username" });
  return u.username?.toLowerCase() ?? null;
}

/** Stores a token pasted in the admin (one generated with new permissions), then turns the webhooks on with it. */
export async function connectInstagramToken(token: string): Promise<{ username: string; fields: string }> {
  // Checked before it replaces the working one.
  const res = await fetch(`${GRAPH}/me?fields=user_id,username&access_token=${encodeURIComponent(token)}`, { cache: "no-store" });
  const who = (await res.json().catch(() => ({}))) as { username?: string; error?: { message?: string } };
  if (!res.ok || !who.username) throw new Error(`That token doesn't work: ${who.error?.message ?? res.status}`);
  const sb = getSupabaseAdmin();
  const { data } = await sb.from("instagram_account").select("id").eq("id", 1).maybeSingle();
  if (data) await sb.from("instagram_account").update({ access_token: token, refreshed_at: new Date().toISOString() }).eq("id", 1);
  else await sb.from("instagram_account").insert({ id: 1, access_token: token });
  const me = await instagramMe();
  await sb.from("instagram_account").update({ ig_user_id: me.user_id, username: me.username }).eq("id", 1);
  const { fields } = await subscribeToComments();
  return { username: me.username, fields };
}

/** Stores the account and the token it was connected with (the env's, generated in Meta's dashboard). */
export async function connectInstagram(): Promise<{ user_id: string; username: string }> {
  const me = await instagramMe();
  const sb = getSupabaseAdmin();
  const { data } = await sb.from("instagram_account").select("id").eq("id", 1).maybeSingle();
  if (data) await sb.from("instagram_account").update({ ig_user_id: me.user_id, username: me.username }).eq("id", 1);
  else await sb.from("instagram_account").insert({ id: 1, ig_user_id: me.user_id, username: me.username, access_token: process.env.INSTAGRAM_ACCESS_TOKEN });
  return me;
}

/** Swaps the token for a fresh 60-day one and stores it (the token must be a day old). */
export async function refreshInstagramToken(): Promise<{ username: string; expiresAt: string }> {
  const token = await instagramToken();
  if (!token) throw new Error("Instagram isn't connected (no token).");
  const res = await fetch(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`, { cache: "no-store" });
  const json = (await res.json()) as { access_token?: string; expires_in?: number; error?: { message?: string } };
  if (!json.access_token) throw new Error(`Instagram refresh: ${json.error?.message ?? res.status}`);
  const expiresAt = new Date(Date.now() + (json.expires_in ?? 60 * 86_400) * 1000).toISOString();
  const sb = getSupabaseAdmin();
  await sb.from("instagram_account").upsert({ id: 1, access_token: json.access_token, refreshed_at: new Date().toISOString(), expires_at: expiresAt });
  const me = await instagramMe();
  await sb.from("instagram_account").update({ ig_user_id: me.user_id, username: me.username }).eq("id", 1);
  return { username: me.username, expiresAt };
}

/** Whether a webhook body came from Meta: its X-Hub-Signature-256 is the body's HMAC with the app secret. */
export function validInstagramSignature(body: string, header: string | null): boolean {
  const secret = process.env.INSTAGRAM_APP_SECRET;
  if (!secret || !header?.startsWith("sha256=")) return false;
  const want = Buffer.from(createHmac("sha256", secret).update(body).digest("hex"));
  const got = Buffer.from(header.slice(7));
  return want.length === got.length && timingSafeEqual(want, got);
}

export interface IgComment {
  id: string;
  text: string;
  timestamp?: string;
  from?: { id: string; username?: string };
  replies?: { data: IgComment[] };
}

/** A post's comments with their replies, newest first, up to `pages` pages of 50. */
export async function instagramComments(mediaId: string, pages = 4): Promise<IgComment[]> {
  const out: IgComment[] = [];
  let after: string | undefined;
  for (let i = 0; i < pages; i++) {
    const page = await graph<{ data: IgComment[]; paging?: { cursors?: { after?: string }; next?: string } }>(`/${mediaId}/comments`, {
      fields: "id,text,timestamp,from,replies{id,text,timestamp,from}",
      limit: "50",
      ...(after ? { after } : {}),
    });
    out.push(...page.data);
    after = page.paging?.next ? page.paging.cursors?.after : undefined;
    if (!after) break;
  }
  return out;
}

/** One comment's text (null when it's gone). */
export async function instagramCommentText(commentId: string): Promise<string | null> {
  return graph<{ text?: string }>(`/${commentId}`, { fields: "text" }).then((c) => c.text ?? null, () => null);
}

/** A thread: the top-level comment then its replies, oldest first, each with who wrote it (at most 8 replies, the latest). */
export async function instagramThread(parentId: string): Promise<{ id: string; text: string; username: string | null; at: string }[]> {
  const parent = await graph<{ id: string; text: string; timestamp: string; from?: { username?: string }; replies?: { data: { id: string; timestamp: string }[] } }>(`/${parentId}`, {
    fields: "id,text,timestamp,from,replies{id,timestamp}",
  });
  // The replies list leaves out who wrote each one: fetch them one by one.
  const ids = (parent.replies?.data ?? []).sort((a, b) => a.timestamp.localeCompare(b.timestamp)).slice(-8);
  const replies = await Promise.all(
    ids.map((r) =>
      graph<{ id: string; text: string; timestamp: string; from?: { username?: string } }>(`/${r.id}`, { fields: "id,text,timestamp,from" }).catch(() => null),
    ),
  );
  return [parent, ...replies.filter((r): r is NonNullable<typeof r> => !!r)].map((c) => ({ id: c.id, text: c.text, username: c.from?.username?.toLowerCase() ?? null, at: c.timestamp }));
}

// ─── Publishing reels and reading their numbers (the reel factory) ──────────

/** A reel's container: Instagram fetches the video from `videoUrl` and processes it. A trial goes only to non-followers. */
export async function createReelContainer(o: { videoUrl: string; caption: string; coverUrl?: string | null; thumbOffsetMs?: number | null; trial: boolean }): Promise<string> {
  const { id } = await graph<{ id: string }>(
    "/me/media",
    {
      media_type: "REELS",
      video_url: o.videoUrl,
      caption: o.caption,
      share_to_feed: "true",
      ...(o.coverUrl ? { cover_url: o.coverUrl } : {}),
      ...(o.thumbOffsetMs != null ? { thumb_offset: String(o.thumbOffsetMs) } : {}),
      // Instagram graduates a trial that does well with non-followers by itself (it then reaches followers and the grid).
      ...(o.trial ? { trial_params: JSON.stringify({ graduation_strategy: "SS_PERFORMANCE" }) } : {}),
    },
    "POST",
  );
  return id;
}

/** A container's processing state: IN_PROGRESS, FINISHED, ERROR, EXPIRED or PUBLISHED. */
export async function containerStatus(containerId: string): Promise<{ status: string; detail: string | null }> {
  const j = await graph<{ status_code?: string; status?: string }>(`/${containerId}`, { fields: "status_code,status" });
  return { status: j.status_code ?? "IN_PROGRESS", detail: j.status ?? null };
}

/** Publishes a finished container: the reel goes live. Returns its media id and permalink. */
export async function publishContainer(containerId: string): Promise<{ mediaId: string; permalink: string | null }> {
  const { id } = await graph<{ id: string }>("/me/media_publish", { creation_id: containerId }, "POST");
  const media = await graph<{ permalink?: string }>(`/${id}`, { fields: "permalink" }).catch(() => ({ permalink: undefined }));
  return { mediaId: id, permalink: media.permalink ?? null };
}

export const REEL_METRICS = ["views", "reach", "likes", "comments", "shares", "saved", "total_interactions", "ig_reels_avg_watch_time", "reels_skip_rate"] as const;

/** A reel's insights, one call per metric so a metric Instagram doesn't return for it leaves just that one out. */
export async function reelInsights(mediaId: string): Promise<Partial<Record<(typeof REEL_METRICS)[number], number>>> {
  const out: Partial<Record<(typeof REEL_METRICS)[number], number>> = {};
  const all = await graph<{ data: { name: string; values?: { value: number }[]; total_value?: { value: number } }[] }>(`/${mediaId}/insights`, {
    metric: REEL_METRICS.join(","),
  }).catch(() => null);
  const rows = all?.data ?? [];
  if (!all) {
    for (const m of REEL_METRICS) {
      const one = await graph<{ data: typeof rows }>(`/${mediaId}/insights`, { metric: m }).catch(() => null);
      rows.push(...(one?.data ?? []));
    }
  }
  for (const r of rows) {
    const v = r.values?.[0]?.value ?? r.total_value?.value;
    if (typeof v === "number") out[r.name as (typeof REEL_METRICS)[number]] = v;
  }
  return out;
}

/** When the account's followers are online, hour by hour (Instagram's online_followers insight; empty without enough data). */
export async function onlineFollowers(): Promise<{ values?: { value?: Record<string, number> }[] } | null> {
  const j = await graph<{ data: { values?: { value?: Record<string, number> }[] }[] }>("/me/insights", { metric: "online_followers", period: "lifetime" }).catch(() => null);
  return j?.data?.[0] ?? null;
}

/** Whether a post goes to the account's followers and grid: a trial reel turns true once it graduates. */
export async function sharedToFeed(mediaId: string): Promise<boolean | null> {
  const j = await graph<{ is_shared_to_feed?: boolean }>(`/${mediaId}`, { fields: "is_shared_to_feed" }).catch(() => null);
  return typeof j?.is_shared_to_feed === "boolean" ? j.is_shared_to_feed : null;
}
