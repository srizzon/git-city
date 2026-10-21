// ─── A reel's voice and sound ───────────────────────────────
// The narration from ElevenLabs with word timings (the approved voice comes
// from REELS_HOME's config, never from here), cached by text and settings so
// a re-render never spends credits twice; then the mix: the voice over the
// music bed, the bed's silent lead-in cut, ducked under the voice, faded at
// the end, -14 LUFS. Node only (the reel CLI).

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Word } from "@trailer-kit/narration";

export interface VoiceConfig {
  id: string;
  model: string;
  speed: number;
  seed: number;
  stability: number;
  similarity: number;
  style: number;
  speakerBoost: boolean;
}

interface Take {
  audio: string;
  alignment: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] };
}

async function speak(text: string, previous: string | null, voice: VoiceConfig, cacheDir: string): Promise<Take> {
  const body = {
    text,
    model_id: voice.model,
    seed: voice.seed,
    voice_settings: { stability: voice.stability, similarity_boost: voice.similarity, style: voice.style, use_speaker_boost: voice.speakerBoost, speed: voice.speed },
    ...(previous ? { previous_text: previous } : {}),
  };
  const key = createHash("sha256").update(JSON.stringify([voice.id, body])).digest("hex").slice(0, 24);
  const cached = path.join(cacheDir, `${key}.json`);
  if (existsSync(cached)) return JSON.parse(readFileSync(cached, "utf8")) as Take;
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY isn't set.");
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice.id}/with-timestamps?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { audio_base64: string; alignment: Take["alignment"] };
  const take = { audio: json.audio_base64, alignment: json.alignment };
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(cached, JSON.stringify(take));
  return take;
}

/** Characters with times → words with times (split on spaces, as the text was written). */
function wordsOf(a: Take["alignment"], shift: number): Word[] {
  const out: Word[] = [];
  let cur = "";
  let s = 0;
  let e = 0;
  a.characters.forEach((c, i) => {
    if (c === " ") {
      if (cur) out.push([cur, s + shift, e + shift]);
      cur = "";
      return;
    }
    if (!cur) s = a.character_start_times_seconds[i];
    cur += c;
    e = a.character_end_times_seconds[i];
  });
  if (cur) out.push([cur, s + shift, e + shift]);
  // A tone's audio tag ("[confident]") directs the voice: it isn't a spoken word.
  return out.filter(([w]) => !/^\[[^\]]*\]$/.test(w)).map(([w, a0, b0]) => [w, Math.round(a0 * 1000) / 1000, Math.round(b0 * 1000) / 1000]);
}

/** A line as the voice gets it: its tone's audio tag first. */
const toned = (l: { say: string; tone?: string }) => (l.tone ? `[${l.tone}] ${l.say}` : l.say);

const ffmpeg = (args: string[]) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: ["ignore", "ignore", "inherit"] });

/**
 * The narration as one track, written to `outMp3`, and its words on the
 * film's clock. One take of the whole text starting at `voiceAt`, or, when
 * every line has its own time, one take per line placed at that time (each
 * with the previous line as context, so the voice keeps its tone).
 */
export async function narrate(
  lines: { say: string; at?: number; tone?: string }[],
  voiceAt: number,
  voice: VoiceConfig,
  cacheDir: string,
  outMp3: string,
): Promise<Word[]> {
  const tmp = mkdtempSync(path.join(tmpdir(), "reel-voice-"));
  try {
    if (lines.every((l) => l.at === undefined)) {
      const take = await speak(lines.map(toned).join(" "), null, voice, cacheDir);
      const raw = path.join(tmp, "vo.mp3");
      writeFileSync(raw, Buffer.from(take.audio, "base64"));
      // The film's clock: silence before the first word.
      ffmpeg(["-i", raw, "-af", `adelay=${Math.round(voiceAt * 1000)}:all=1`, outMp3]);
      return wordsOf(take.alignment, voiceAt);
    }
    if (lines.some((l) => l.at === undefined)) throw new Error("Either every line has its own time (`at`) or none does.");
    const words: Word[] = [];
    const clips: [number, string][] = [];
    let previous: string | null = null;
    for (const [n, l] of lines.entries()) {
      const take = await speak(toned(l), previous, voice, cacheDir);
      const clip = path.join(tmp, `l${n}.mp3`);
      writeFileSync(clip, Buffer.from(take.audio, "base64"));
      clips.push([l.at!, clip]);
      const w = wordsOf(take.alignment, l.at!);
      const next = lines[n + 1]?.at;
      if (next !== undefined && w[w.length - 1][2] > next) throw new Error(`Line ${n + 1} ends at ${w[w.length - 1][2].toFixed(2)}s, after the next starts (${next}s).`);
      words.push(...w);
      previous = l.say;
    }
    const delays = clips.map(([at], i) => `[${i}:a]adelay=${Math.round(at * 1000)}:all=1[a${i}];`).join("");
    const mix = clips.map((_, i) => `[a${i}]`).join("") + `amix=inputs=${clips.length}:normalize=0:duration=longest`;
    ffmpeg([...clips.flatMap(([, c]) => ["-i", c]), "-filter_complex", delays + mix, outMp3]);
    return words;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * The reel's sound: the narration (already on the film's clock) over the bed,
 * the bed's silent lead-in cut so it opens on sound and looped once with a
 * crossfade, ducked while the voice talks, faded out at the end, -14 LUFS.
 */
export function mix(vo: string, bed: string, length: number, out: string, bedVolume: number) {
  const fade = Math.max(0, length - 0.9).toFixed(2);
  const trim = "silenceremove=start_periods=1:start_threshold=-40dB:start_silence=0.05";
  ffmpeg([
    "-i", vo, "-i", bed, "-i", bed,
    "-filter_complex",
    `[0:a]apad=pad_dur=3,asplit=2[vo][key];` +
      `[1:a]${trim}[b1];[2:a]${trim}[b2];` +
      `[b1][b2]acrossfade=d=1.5,volume=${bedVolume}[bed];` +
      `[bed][key]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=350[duck];` +
      `[vo][duck]amix=inputs=2:duration=shortest:normalize=0,atrim=0:${length.toFixed(3)},afade=t=out:st=${fade}:d=0.8,loudnorm=I=-14:TP=-1.5:LRA=11[out]`,
    "-map", "[out]", "-ar", "44100", out,
  ]);
}
