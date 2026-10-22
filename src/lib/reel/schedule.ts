// ─── Putting a finished reel on the agenda ──────────────────
// Uploads a finished mp4 (and a main reel's cover) to the private
// reel-uploads bucket and writes its reel_schedule row; the reel-publish cron
// posts it at its slot (lib/reel/publish). Used by `npm run reel -- schedule`.
// Server only, dev only (it reads the files from disk).

import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReelsConfig } from "./config";
import { BUCKET } from "./publish";

const BRT = "-03:00";
const HOUR = 3_600_000;

export type ReelKind = "main" | "trial";

/** Today's date in Brasília, "YYYY-MM-DD". */
export const brt = (d = new Date()) => new Date(d.getTime() - 3 * HOUR).toISOString().slice(0, 10);

/**
 * The hour (Brasília, 0–23) most of the account's followers are online,
 * from Instagram's online_followers insight (summed over the days it
 * returns); null while Instagram has no data for the account.
 */
export function busiestHour(insight: { values?: { value?: Record<string, number> }[] } | null): number | null {
  const byHour = new Array<number>(24).fill(0);
  for (const day of insight?.values ?? []) for (const [h, n] of Object.entries(day.value ?? {})) byHour[Number(h) % 24] += n;
  const max = Math.max(...byHour);
  // Instagram's insight days run midnight to midnight Pacific (their end_time is 07:00 UTC), so its
  // hours are Pacific (UTC-7 in daylight time): Brasília is 4 hours later.
  return max > 0 ? (byHour.indexOf(max) + 4) % 24 : null;
}

/**
 * Where a reel goes: a main at the day's main slot (the config's "HH:MM", or
 * "auto": the hour the followers are most online), a trial its gap after the
 * day's trials already on the agenda; never in the past, and (with a gap set)
 * never closer to another reel than the gap or an hour.
 */
export function slotFor(o: { kind: ReelKind; date: string; trialsBefore: number; config: ReelsConfig; taken: number[]; busiest: number | null; now: number; at?: string }): Date {
  if (o.at) return new Date(`${o.at}${BRT}`);
  const main = o.config.slots.main === "auto" ? `${String(o.busiest ?? 12).padStart(2, "0")}:00` : o.config.slots.main;
  const base = new Date(`${o.date}T${main}:00${BRT}`).getTime();
  let t = o.kind === "main" ? base : base + (o.trialsBefore + 1) * o.config.slots.trialGapHours * HOUR;
  const soonest = o.now + 10 * 60_000;
  const apart = Math.min(HOUR, o.config.slots.trialGapHours * HOUR);
  while (t < soonest || o.taken.some((x) => Math.abs(x - t) < apart)) t += t < soonest ? Math.ceil((soonest - t) / (HOUR / 2)) * (HOUR / 2) : HOUR / 2;
  return new Date(t);
}

/** Uploads a finished reel and puts it on the agenda; returns when it will post. */
export async function scheduleReel(o: {
  sb: SupabaseClient;
  config: ReelsConfig;
  busiest: number | null;
  /** The agenda's key (reel_schedule.spec_id): scheduling the same id again replaces it. */
  id: string;
  kind: ReelKind;
  caption: string;
  video: string;
  /** A main reel's grid cover (png); a trial has none. */
  cover: string | null;
  /** The frame a trial shows on the grid if it graduates, in seconds. */
  thumbAt: number;
  lengthS: number;
  hook?: string;
  /** Its comments place devs on the Brasil map from the first one. */
  watch?: boolean;
  at?: string;
}): Promise<Date> {
  if (o.kind === "main" && !o.cover) throw new Error("A main reel needs a cover.");
  // Scheduling a posted id again would overwrite its row (media, permalink) and post another video under it.
  const { data: posted } = await o.sb.from("reel_schedule").select("permalink").eq("spec_id", o.id).eq("status", "posted").maybeSingle<{ permalink: string | null }>();
  if (posted) throw new Error(`"${o.id}" is already posted (${posted.permalink}): pass another --id.`);
  const date = o.at ? o.at.slice(0, 10) : brt();
  const { data: rows } = await o.sb.from("reel_schedule").select("spec_id, kind, scheduled_at").in("status", ["scheduled", "publishing"]);
  const others = (rows ?? []).filter((r) => r.spec_id !== o.id);
  const taken = others.map((r) => Date.parse(r.scheduled_at as string));
  const trialsBefore = others.filter((r) => r.kind === "trial" && brt(new Date(r.scheduled_at as string)) === date).length;
  const when = slotFor({ kind: o.kind, date, trialsBefore, config: o.config, taken, busiest: o.busiest, now: Date.now(), at: o.at });

  const key = `${o.id}/${crypto.randomUUID()}`;
  const upload = async (file: string, name: string, type: string) => {
    const p = `${key}-${name}`;
    const { error } = await o.sb.storage.from(BUCKET).upload(p, readFileSync(file), { contentType: type, upsert: true });
    if (error) throw new Error(`upload ${file}: ${error.message}`);
    return p;
  };
  const video = await upload(o.video, "final.mp4", "video/mp4");
  const cover = o.kind === "main" && o.cover ? await upload(o.cover, "cover.png", "image/png") : null;
  const { error } = await o.sb.from("reel_schedule").upsert(
    {
      spec_id: o.id,
      kind: o.kind,
      caption: o.caption,
      video_path: video,
      cover_path: cover,
      thumb_offset_ms: Math.round(o.thumbAt * 1000),
      scheduled_at: when.toISOString(),
      status: "scheduled",
      attempts: 0,
      error: null,
      container_id: null,
      meta: { hook: o.hook, length_s: Math.round(o.lengthS * 100) / 100, watch: o.watch },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "spec_id" },
  );
  if (error) throw new Error(`agenda: ${error.message}`);
  return when;
}
