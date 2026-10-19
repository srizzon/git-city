// ─── Reels home ─────────────────────────────────────────────
// Where a reel's content lives: specs, voice, mixes, drafts, notes. Outside
// the repo (Git City is open source, a reel's script is not), in the folder
// REELS_HOME names; a fork sets its own. Dev only: the studio and its file
// route 404 in production and when REELS_HOME isn't set. Server only.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Word } from "@trailer-kit/narration";
import { parseSpec, type ReelSpec, specDir } from "./spec";

/** The folder, when the reels tools are on (dev, with REELS_HOME set). */
export function reelsHome(): string | null {
  if (process.env.NODE_ENV === "production") return null;
  const home = process.env.REELS_HOME;
  return home && existsSync(home) ? home : null;
}

/** A path inside REELS_HOME, never outside it. */
export function inHome(rel: string): string | null {
  const home = reelsHome();
  if (!home) return null;
  const full = path.resolve(home, rel);
  return full === path.resolve(home) || full.startsWith(path.resolve(home) + path.sep) ? full : null;
}

export interface ReelFiles {
  spec: ReelSpec;
  /** The narration's words on the film's clock (voice.json), or null before the voice is made. */
  words: Word[] | null;
  /** The mixed sound's URL for the studio and the export, or null before the mix. */
  song: string | null;
}

/** A reel folder's spec: its spec.json, or, for a trial written as a variation, the reel it varies with the change applied. */
export function readSpecAt(dir: string): ReelSpec {
  const json = (d: string) => JSON.parse(readFileSync(path.join(d, "spec.json"), "utf8")) as unknown;
  return parseSpec(json(dir), (slot) => json(path.join(dir, "..", slot)));
}

/** A reel's spec, voice and mix from its folder (days/<date>/<slot>/). */
export function readReel(id: string): ReelFiles | null {
  const dir = inHome(specDir(id).rel);
  if (!dir || !existsSync(path.join(dir, "spec.json"))) return null;
  const spec = readSpecAt(dir);
  const voice = path.join(dir, "voice.json");
  const words = existsSync(voice) ? (JSON.parse(readFileSync(voice, "utf8")) as Word[]) : null;
  const rel = specDir(id).rel;
  const song = existsSync(path.join(dir, "mix.wav")) ? `/api/reels/file/${rel}/mix.wav` : null;
  return { spec, words, song };
}
