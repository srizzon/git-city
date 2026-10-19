// ─── Narration ──────────────────────────────────────────────
// A narrated film (a vertical reel, an explainer) is cut on its voice, not
// on a beat grid: every cut, caption and moment is anchored on a spoken
// word. This turns a narration's word timings into those times. Pure, no
// React. The film then runs at one beat per second (Film.beat = 1).
//
// Words come from a TTS with timestamps (ElevenLabs' `with-timestamps`),
// already on the film's clock: [text, start, end] in seconds.

import type { Take } from "./film";

export type Word = [text: string, start: number, end: number];

/** "Eleição:" → "eleição": what an anchor matches against (case and punctuation don't count). */
export function bare(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}@]+/gu, "");
}

/**
 * When an anchor falls, in seconds:
 * - a number: that time;
 * - "#12": when word 12 starts;
 * - "eleição": when the first word "eleição" at or after `after` starts;
 * - either with "+0.3" / "-0.1": shifted by that much.
 * Throws when a word isn't said, so a broken anchor fails before any render.
 */
export function anchorAt(words: readonly Word[], at: number | string, after = 0): number {
  if (typeof at === "number") return at;
  const m = /^(.*?)([+-]\d+(?:\.\d+)?)?$/.exec(at.trim());
  const key = (m?.[1] ?? at).trim();
  const shift = Number(m?.[2] ?? 0);
  if (/^#\d+$/.test(key)) {
    const w = words[Number(key.slice(1))];
    if (!w) throw new Error(`Anchor "${at}": there is no word ${key}.`);
    return w[1] + shift;
  }
  const want = bare(key);
  const w = words.find((x) => x[1] >= after - 1e-6 && bare(x[0]) === want);
  if (!w) throw new Error(`Anchor "${at}": "${key}" isn't said${after > 0 ? ` after ${after.toFixed(2)}s` : ""}.`);
  return w[1] + shift;
}

/** A caption line: what it shows (`*word*` lit) and what the voice says for it. */
export interface NarrationLine {
  show: string;
  /** The spoken words behind this line; defaults to `show` without the stars. */
  say?: string;
}

export interface CaptionLine {
  /** Seconds: when its first word is said, and when the next line takes over. */
  from: number;
  to: number;
  /** Each shown word, whether it's lit, and when it appears. */
  words: { text: string; lit: boolean; at: number }[];
}

const spoken = (l: NarrationLine) => (l.say ?? l.show.replace(/\*/g, "")).split(/\s+/).filter(Boolean);

/** How many spoken words the lines account for: it must equal the narration's word count. */
export function spokenCount(lines: readonly NarrationLine[]): number {
  return lines.reduce((n, l) => n + spoken(l).length, 0);
}

/**
 * The caption lines on the clock. Each line takes the next run of spoken
 * words (as many as its `say` has). Shown words land on their own spoken
 * word when the counts match; otherwise ("88.202" said as five words) they
 * land spread evenly over the line's words. A line holds until the next
 * line starts, or until `holdMax` seconds after its last word if given (a
 * pause shows nothing), and the last one until `end`.
 */
export function captionLines(lines: readonly NarrationLine[], words: readonly Word[], end: number, holdMax?: number): CaptionLine[] {
  const need = spokenCount(lines);
  if (need !== words.length) throw new Error(`The lines say ${need} words, the narration has ${words.length}.`);
  let i = 0;
  const spans = lines.map((l) => {
    const n = spoken(l).length;
    const span = words.slice(i, i + n);
    i += n;
    return span;
  });
  return lines.map((l, k) => {
    const span = spans[k];
    let lit = false;
    const shown = l.show.split(/\s+/).filter(Boolean);
    const out = shown.map((w, j) => {
      if (w.startsWith("*")) lit = true;
      const on = lit;
      if (w.endsWith("*")) lit = false;
      const at = span[shown.length === span.length ? j : Math.floor((j * span.length) / shown.length)][1];
      return { text: w.replace(/\*/g, ""), lit: on, at };
    });
    const next = spans[k + 1]?.[0]?.[1] ?? end;
    const last = span[span.length - 1][2];
    return { from: span[0][1], to: holdMax === undefined ? next : Math.min(next, last + holdMax), words: out };
  });
}

/** A cut: from its anchor until the next cut (or the end). */
export interface Cut<K extends string, S extends string = string> {
  name: string;
  kind: K;
  stage: S;
  /** Seconds. */
  from: number;
}

/** Cuts in order → the kit's takes (one beat = one second). */
export function takesOf<K extends string, S extends string>(cuts: readonly Cut<K, S>[], length: number): Take<S, K>[] {
  return cuts.map((c, i) => [c.name, c.stage, c.kind, (cuts[i + 1]?.from ?? length) - (i ? c.from : 0), 0]);
}
