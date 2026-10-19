// ─── Posting scheduled reels, measuring posted ones ─────────
// The server half of the reel factory's agenda (migration 174). The reel CLI
// uploads a finished reel and writes its reel_schedule row; the reel-publish
// cron calls publishDue every few minutes, which posts each reel whose time
// has come; the reel-insights cron calls measurePosts, which snapshots each
// post's numbers (hourly for 48h, then daily for a week). Server only.

import type { SupabaseClient } from "@supabase/supabase-js";
import { containerStatus, createReelContainer, publishContainer, reelInsights, sharedToFeed } from "@/lib/instagram";
import { sendEmail } from "@/lib/resend";
import { FROM_NOTIFY } from "@/lib/email/senders";

export const BUCKET = "reel-uploads";
const RETRY_AFTER_MS = 10 * 60_000;
const MAX_ATTEMPTS = 2;
/** How long one cron run waits on Instagram's processing before leaving it for the next run. */
const WAIT_MS = 4 * 60_000;
const OWNER = "samuel@thegitcity.com";

export interface ScheduleRow {
  id: string;
  spec_id: string;
  kind: "main" | "trial";
  caption: string;
  video_path: string;
  cover_path: string | null;
  thumb_offset_ms: number | null;
  scheduled_at: string;
  status: "scheduled" | "publishing" | "posted" | "failed" | "cancelled";
  attempts: number;
  error: string | null;
  container_id: string | null;
  media_id: string | null;
  permalink: string | null;
  meta: { preset?: string; hook?: string; opening_scene?: string; length_s?: number; bed?: string; cta?: string; watch?: boolean };
  updated_at: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function signed(sb: SupabaseClient, path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error || !data) throw new Error(`signed url for ${path}: ${error?.message ?? "none"}`);
  return data.signedUrl;
}

async function fail(sb: SupabaseClient, row: ScheduleRow, message: string) {
  const attempts = row.attempts + 1;
  await sb.from("reel_schedule").update({ status: "failed", attempts, error: message, container_id: null, updated_at: new Date().toISOString() }).eq("id", row.id);
  if (attempts >= MAX_ATTEMPTS) {
    await sendEmail({
      from: FROM_NOTIFY,
      to: OWNER,
      subject: `Reel ${row.spec_id} didn't post`,
      text: `The ${row.kind} reel ${row.spec_id}, scheduled for ${row.scheduled_at}, failed twice:\n\n${message}\n\nIt's on the agenda at /admin/reels to try again.`,
    }).catch(() => {});
  }
}

/** Posts one reel: its container (made now or on an earlier run), then publishes it once Instagram has processed it. */
async function post(sb: SupabaseClient, row: ScheduleRow, deadline: number): Promise<"posted" | "waiting"> {
  let container = row.container_id;
  if (!container) {
    container = await createReelContainer({
      videoUrl: (await signed(sb, row.video_path))!,
      coverUrl: await signed(sb, row.cover_path),
      caption: row.caption,
      thumbOffsetMs: row.kind === "trial" ? row.thumb_offset_ms : null,
      trial: row.kind === "trial",
    });
    await sb.from("reel_schedule").update({ container_id: container, updated_at: new Date().toISOString() }).eq("id", row.id);
  }
  for (;;) {
    const { status, detail } = await containerStatus(container);
    if (status === "FINISHED") break;
    if (status === "ERROR" || status === "EXPIRED") throw new Error(`Instagram couldn't process the video (${status}${detail ? `: ${detail}` : ""}).`);
    if (Date.now() > deadline) return "waiting";
    await sleep(10_000);
  }
  const { mediaId, permalink } = await publishContainer(container);
  const now = new Date().toISOString();
  await sb.from("reel_schedule").update({ status: "posted", media_id: mediaId, permalink, error: null, updated_at: now }).eq("id", row.id);
  await sb.from("reel_posts").upsert({
    media_id: mediaId,
    spec_id: row.spec_id,
    kind: row.kind,
    permalink,
    preset: row.meta.preset ?? null,
    hook: row.meta.hook ?? null,
    opening_scene: row.meta.opening_scene ?? null,
    length_s: row.meta.length_s ?? null,
    bed: row.meta.bed ?? null,
    cta: row.meta.cta ?? null,
    trial_strategy: row.kind === "trial" ? "SS_PERFORMANCE" : null,
    posted_at: now,
  });
  // A reel whose call to action puts people on the map: its comments count from the first one.
  if (row.meta.watch) await sb.from("brasil_reels").upsert({ media_id: mediaId, permalink, caption: row.caption.slice(0, 300), watching: true, kind: "brasil" });
  await sb.storage.from(BUCKET).remove([row.video_path, ...(row.cover_path ? [row.cover_path] : [])]);
  return "posted";
}

/** Posts every reel whose time has come (and retries a failed one once, 10 minutes on). */
export async function publishDue(sb: SupabaseClient, now = Date.now()): Promise<{ posted: string[]; waiting: string[]; failed: string[] }> {
  const { data } = await sb
    .from("reel_schedule")
    .select("*")
    .in("status", ["scheduled", "publishing", "failed"])
    .lte("scheduled_at", new Date(now).toISOString())
    .order("scheduled_at")
    .returns<ScheduleRow[]>();
  const due = (data ?? []).filter((r) => r.status !== "failed" || (r.attempts < MAX_ATTEMPTS && now - Date.parse(r.updated_at) > RETRY_AFTER_MS));
  const out = { posted: [] as string[], waiting: [] as string[], failed: [] as string[] };
  const deadline = now + WAIT_MS;
  for (const row of due) {
    // Claim it, so two overlapping runs never post the same reel twice.
    const { data: claimed } = await sb
      .from("reel_schedule")
      .update({ status: "publishing", updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("updated_at", row.updated_at)
      .select("id");
    if (!claimed?.length) continue;
    try {
      const r = await post(sb, row, deadline);
      out[r].push(row.spec_id);
    } catch (e) {
      await fail(sb, row, (e as Error).message);
      out.failed.push(row.spec_id);
    }
  }
  return out;
}

interface PostRow {
  media_id: string;
  permalink: string | null;
  posted_at: string;
  kind: "main" | "trial";
  graduated: boolean;
}

/** Snapshots each post's numbers: hourly for its first 48 hours, then daily until it's a week old. */
export async function measurePosts(sb: SupabaseClient, now = Date.now()): Promise<number> {
  const week = new Date(now - 7 * 86_400_000).toISOString();
  const { data: posts } = await sb.from("reel_posts").select("media_id, permalink, posted_at, kind, graduated").gte("posted_at", week).returns<PostRow[]>();
  let taken = 0;
  for (const p of posts ?? []) {
    const { data: last } = await sb.from("reel_stats").select("taken_at").eq("media_id", p.media_id).order("taken_at", { ascending: false }).limit(1).maybeSingle<{ taken_at: string }>();
    const age = now - Date.parse(p.posted_at);
    const every = age < 48 * 3_600_000 ? 55 * 60_000 : 23 * 3_600_000;
    if (last && now - Date.parse(last.taken_at) < every) continue;
    // A trial that Instagram graduated now goes to the followers' feed too (is_shared_to_feed turns true;
    // to confirm on the first real trial).
    if (p.kind === "trial" && !p.graduated && (await sharedToFeed(p.media_id))) await sb.from("reel_posts").update({ graduated: true }).eq("media_id", p.media_id);
    const m = await reelInsights(p.media_id).catch(() => null);
    if (!m) continue;
    // In a trial's first half hour Instagram has views but reports reach and skip rate as 0: not measured yet.
    const early = (m.views ?? 0) > 0 && !m.reach;
    const { count } = p.permalink
      ? await sb.from("brasil_comments").select("id", { count: "exact", head: true }).eq("reel", p.permalink).eq("outcome", "added")
      : { count: null };
    await sb.from("reel_stats").insert({
      media_id: p.media_id,
      taken_at: new Date(now).toISOString(),
      views: m.views ?? null,
      reach: early ? null : (m.reach ?? null),
      likes: m.likes ?? null,
      comments: m.comments ?? null,
      shares: m.shares ?? null,
      saved: m.saved ?? null,
      total_interactions: m.total_interactions ?? null,
      avg_watch_ms: early ? null : (m.ig_reels_avg_watch_time ?? null),
      skip_rate: early ? null : (m.reels_skip_rate ?? null),
      devs_placed: count ?? null,
    });
    taken++;
  }
  return taken;
}
