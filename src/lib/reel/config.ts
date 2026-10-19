// ─── The reels' private config ──────────────────────────────
// What only the account owner decides lives in REELS_HOME/reels.config.json,
// not in the repo: the narrator's voice and its settings, the studio's URL,
// the Instagram handles a caption may tag, and the posting slots.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

export const ReelsConfig = z.object({
  voice: z.object({
    id: z.string(),
    model: z.string().default("eleven_multilingual_v2"),
    speed: z.number().default(1),
    seed: z.number().int().default(0),
    stability: z.number().default(0.5),
    similarity: z.number().default(0.75),
    style: z.number().default(0),
    speakerBoost: z.boolean().default(true),
  }),
  /** The dev server the studio runs on (the export opens it). */
  studioUrl: z.string().default("http://localhost:3002"),
  /** Music beds, relative to REELS_HOME. */
  beds: z.string().default("_assets"),
  verifiedHandles: z.array(z.string()).default([]),
  slots: z
    .object({
      /** Brasília time, "HH:MM". */
      main: z.string().regex(/^\d{2}:\d{2}$/).default("12:00"),
      trialGapHours: z.number().positive().default(2),
    })
    .default({ main: "12:00", trialGapHours: 2 }),
});
export type ReelsConfig = z.infer<typeof ReelsConfig>;

export function readConfig(home: string): ReelsConfig {
  const file = path.join(home, "reels.config.json");
  if (!existsSync(file)) throw new Error(`No ${file}: copy the voice and settings there first.`);
  return ReelsConfig.parse(JSON.parse(readFileSync(file, "utf8")));
}
