// ─── Putting a finished reel on the agenda ──────────────────
// Uploads a reel's final mp4 (and the main reel's cover) to the private
// reel-uploads bucket and writes its reel_schedule row; the reel-publish cron
// posts it at its slot (lib/reel/publish). Used by the studio's Schedule
// button and by `npm run reel -- schedule`. Server only, dev only (it reads
// the reel's files from REELS_HOME).

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { anchorAt, type Word } from "@trailer-kit/narration";
import type { ReelsConfig } from "./config";
import { reelOf } from "./film";
import { BUCKET } from "./publish";
import { bedOf } from "./beds";
import { filled, type ReelSpec, specDir } from "./spec";
import { readSpecAt } from "./home";
import { readStatus, setError, setState } from "./status";

const BRT = "-03:00";
const HOUR = 3_600_000;

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
 * Where a reel goes: the day's main at the main slot (the config's "HH:MM", or
 * "auto": the hour the followers are most online), each trial its gap after,
 * by slot name; never in the past, never within the hour of another reel.
 */
export function slotFor(o: { spec: ReelSpec; trials: string[]; config: ReelsConfig; taken: number[]; busiest: number | null; now: number; at?: string }): Date {
  if (o.at) return new Date(`${o.at}${BRT}`);
  const { date, slot } = specDir(o.spec.id);
  const main = o.config.slots.main === "auto" ? `${String(o.busiest ?? 12).padStart(2, "0")}:00` : o.config.slots.main;
  const base = new Date(`${date}T${main}:00${BRT}`).getTime();
  let t = o.spec.kind === "main" ? base : base + (o.trials.indexOf(slot) + 1) * o.config.slots.trialGapHours * HOUR;
  const soonest = o.now + 10 * 60_000;
  while (t < soonest || o.taken.some((x) => Math.abs(x - t) < HOUR)) t += t < soonest ? Math.ceil((soonest - t) / (HOUR / 2)) * (HOUR / 2) : HOUR / 2;
  return new Date(t);
}

/** What the report calls a reel's hook: its first line, or for a variation, the one thing it changed. */
function hookOf(spec: ReelSpec): string {
  const v = spec.variation;
  const plain = (s: string) => s.replace(/\*/g, "");
  if (!v || v.test === "voice") return plain(spec.lines[0].show);
  if (v.test === "text") return plain(v.lines.map((l) => l.text).join(" "));
  if (v.test === "shot") return v.scene.name ?? v.scene.scene;
  return v.headline ? "headline" : "header";
}

/** Uploads a finished reel and puts it on the agenda; returns when it will post. */
export async function scheduleReel(o: {
  home: string;
  id: string;
  sb: SupabaseClient;
  config: ReelsConfig;
  busiest: number | null;
  at?: string;
}): Promise<Date> {
  const { date, rel } = specDir(o.id);
  const dir = path.join(o.home, rel);
  try {
    if (readStatus(dir).state !== "final") throw new Error(`${o.id} isn't a finished reel (state ${readStatus(dir).state}).`);
    if (!existsSync(path.join(dir, "final.mp4"))) throw new Error("No final.mp4.");
    const spec = filled(readSpecAt(dir));
    const day = path.join(o.home, "days", date);
    const trials = readdirSync(day)
      .filter((s) => existsSync(path.join(day, s, "spec.json")))
      .filter((s) => (JSON.parse(readFileSync(path.join(day, s, "spec.json"), "utf8")) as { kind?: string }).kind === "trial")
      .sort();
    const { data: rows } = await o.sb.from("reel_schedule").select("spec_id, scheduled_at").in("status", ["scheduled", "publishing"]);
    const taken = (rows ?? []).filter((r) => r.spec_id !== o.id).map((r) => Date.parse(r.scheduled_at as string));
    const when = slotFor({ spec, trials, config: o.config, taken, busiest: o.busiest, now: Date.now(), at: o.at });

    const key = `${o.id}/${crypto.randomUUID()}`;
    const upload = async (file: string, type: string) => {
      const p = `${key}-${file}`;
      const { error } = await o.sb.storage.from(BUCKET).upload(p, readFileSync(path.join(dir, file)), { contentType: type, upsert: true });
      if (error) throw new Error(`upload ${file}: ${error.message}`);
      return p;
    };
    if (spec.kind === "main" && !existsSync(path.join(dir, "cover.png"))) throw new Error("The main reel has no cover.png yet.");
    const video = await upload("final.mp4", "video/mp4");
    const cover = spec.kind === "main" ? await upload("cover.png", "image/png") : null;
    const words = JSON.parse(readFileSync(path.join(dir, "voice.json"), "utf8")) as Word[];
    const reel = reelOf(spec, words, null);
    // A trial has no cover: the grid shows this frame if it graduates.
    const thumb = spec.post.thumbAt !== undefined ? anchorAt(words, spec.post.thumbAt) : reel.length - 1;
    const { error } = await o.sb.from("reel_schedule").upsert(
      {
        spec_id: o.id,
        kind: spec.kind,
        caption: spec.post.caption,
        video_path: video,
        cover_path: cover,
        thumb_offset_ms: Math.round(thumb * 1000),
        scheduled_at: when.toISOString(),
        status: "scheduled",
        attempts: 0,
        error: null,
        container_id: null,
        meta: {
          preset: spec.variation ? `trial:${spec.variation.test}` : spec.preset,
          hook: hookOf(spec),
          opening_scene: spec.scenes[0].scene,
          length_s: Math.round(reel.length * 100) / 100,
          bed: bedOf(spec, o.config, o.home),
          cta: (spec.header?.cta ?? []).map((l) => l.text.replace(/\*/g, "")).join(" "),
          watch: spec.post.watch,
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "spec_id" },
    );
    if (error) throw new Error(`agenda: ${error.message}`);
    setState(dir, "scheduled");
    return when;
  } catch (e) {
    setError(dir, "schedule", (e as Error).message);
    throw e;
  }
}
