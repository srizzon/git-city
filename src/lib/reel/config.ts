// ─── The reels' private config ──────────────────────────────
// What only the account owner decides lives in REELS_HOME/reels.config.json,
// not in the repo: the narrators' voices and their settings, and the posting
// slots.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { VoiceConfig } from "./voice";

const Voice = z.object({
  id: z.string(),
  model: z.string().default("eleven_multilingual_v2"),
  speed: z.number().default(1),
  seed: z.number().int().default(0),
  stability: z.number().default(0.5),
  similarity: z.number().default(0.75),
  style: z.number().default(0),
  speakerBoost: z.boolean().default(true),
});

export const ReelsConfig = z.object({
  /** The fallback narrator, when `voices` has no "davi". */
  voice: Voice,
  /** Narrators by name (`npm run reel -- voice --voice <name>`); "davi" is the default. */
  voices: z.record(z.string(), Voice).default({}),
  slots: z
    .object({
      /** Brasília time, "HH:MM", or "auto": the hour the followers are most online (12:00 until Instagram has the data). */
      main: z.string().regex(/^(\d{2}:\d{2}|auto)$/).default("auto"),
      trialGapHours: z.number().nonnegative().default(2),
    })
    .default({ main: "12:00", trialGapHours: 2 }),
});
export type ReelsConfig = z.infer<typeof ReelsConfig>;

export function readConfig(home: string): ReelsConfig {
  const file = path.join(home, "reels.config.json");
  if (!existsSync(file)) throw new Error(`No ${file}: copy the voice and settings there first.`);
  return ReelsConfig.parse(JSON.parse(readFileSync(file, "utf8")));
}

/** A narrator by name, or the default (Davi). */
export function narratorOf(config: ReelsConfig, name?: string): VoiceConfig {
  const v = name ? config.voices[name] : (config.voices.davi ?? config.voice);
  if (!v) throw new Error(`No voice "${name}" in reels.config.json's voices.`);
  return v;
}
