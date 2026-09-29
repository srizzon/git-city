// ─── Towns launch trailer: "Revenge" ────────────────────────
// The launch film (Oct 8), in the same towns and rig as the teaser
// (lib/trailer/towns/teaser, components/trailer/towns/TownsRig), plus a DOM
// layer for the game's own UI (components/trailer/towns/LaunchOverlay).
// Built from two trailers broken down shot by shot (.claude/skills/
// game-trailer/references.md): Fall Guys' hero arc (falls, suits up,
// climbs, nearly loses, wins the crown) and Clash of Clans' "Revenge" (raided,
// the game's own Revenge button, the payoff). The game's UI is the only
// caption. The numbers are staged: the first battle starts Oct 12.
//
// The story: a Codex car drifts through @srizzon's building; the real
// "knocked your building down" email, "Hit Codex back" clicked; in the dark,
// `claude` and "win the week"; Claude Code #2; the week from behind; the
// revenge drift through Codex; Sunday down to the last second; midnight,
// silence; the crown on the rebuilt building, the town lit, WINNER; the
// name; and the same email landing on the other side.

import {
  buildShots,
  momentOf,
  shotFor as filmShotFor,
  type Film,
  type Frame,
  type SoundCue,
  type Take,
  type TitleCue,
} from "@trailer-kit/film";
import { BEAT, CORNER_HIT, DRIFT_ARC, DRIFT_IN, type Shot, type ShotKind, type Stage } from "./teaser";

/** The corner drift opens this many beats into its action (the teaser's take, a little earlier). */
const RAID_TRIM = 0.8;

/** The takes: [name, stage, kind, beats long, trim, freeze] (see @trailer-kit/film). "ui" takes are the DOM layer on black. */
const TAKES: Take<Stage, ShotKind>[] = [
  // Cold open in the action: a Codex car drifts through @srizzon's building.
  ["Raid", "claude", "cornersmash", 4, RAID_TRIM],
  // The game's own "Revenge" button: the email, and "Hit Codex back" clicked.
  ["Email", "claude", "ui", 4, 0],
  // Suiting up, in the dark: `claude`, its welcome, "win the week".
  ["Suit up", "claude", "ui", 12, 0],
  // Where Claude Code stands on Monday.
  ["Rank", "claude", "ui", 4, 0],
  // The week from above, both towns, Claude climbing from behind.
  ["Week", "both", "week", 12, 0],
  // The revenge: the orange car drifts through a Codex building's corner.
  ["Revenge", "codex", "cornersmash", 4, RAID_TRIM],
  // Sunday: the cuts shorten toward midnight; the last one freezes on it.
  ["Sun", "claude", "aerial", 2, 0],
  ["Sun 2", "codex", "aerial", 2, 0],
  ["Sun 3", "claude", "aerial", 2, 1],
  ["Sun 4", "codex", "aerial", 1, 2],
  ["Sun 5", "claude", "aerial", 1, 3],
  ["Sun 6", "codex", "aerial", 1, 3],
  ["Sun 7", "claude", "aerial", 1, 4],
  ["Sun 8", "codex", "aerial", 0.5, 4],
  ["Sun 9", "claude", "aerial", 0.5, 5],
  ["Sun 10", "codex", "aerial", 0.5, 5],
  ["Midnight", "claude", "aerial", 1.5, 6, 6.5],
  // The crown on the rebuilt building, then the whole town lit.
  ["Crown", "claude", "crown", 4, 0],
  ["Winner", "claude", "celebrate", 4, 0],
];

export const SHOTS: Shot[] = buildShots(TAKES, ["claude", "codex"]);

function take(name: string): Shot {
  const s = SHOTS.find((x) => x.name === name);
  if (!s) throw new Error(`No take "${name}"`);
  return s;
}

/** The pictures end here; the end card runs eight beats from the cut to black, then the button. */
export const END = SHOTS[SHOTS.length - 1].end;
export const LOGO = END;
export const CARD_END = LOGO + 8;
/** The button: the same email, landing on the other side. */
export const BUTTON = { start: CARD_END, end: CARD_END + 6 };
export const LENGTH = BUTTON.end;

/** Sunday's countdown: ten seconds, one a beat, midnight on the freeze (one beat of silence). */
export const FREEZE = take("Midnight").start + 0.5;
export const COUNT_FROM = FREEZE - 10;

/** This stage's shot at `beat`, and seconds into its action. */
export function shotFor(stage: Stage, beat: number) {
  return filmShotFor(SHOTS, stage, beat, BEAT);
}

// ─── The staged week ────────────────────────────────────────
// Per dev, a day at a time, Monday first. Codex leads all week; Claude
// closes in and takes it by one in the last second.

export type Side = "claude" | "codex";

export const WEEK: Record<Side, number[]> = {
  claude: [30, 34, 38, 52, 61, 48, 69],
  codex: [44, 42, 40, 39, 50, 58, 58],
};

/** Per dev after `days` days (fractional: part of the next day). */
export function perDev(side: Side, days: number): number {
  let sum = 0;
  for (let d = 0; d < 7; d++) sum += WEEK[side][d] * Math.max(0, Math.min(1, days - d));
  return sum;
}

/** The takes the DOM layer draws over. */
export const UI = {
  email: take("Email"),
  suit: take("Suit up"),
  rank: take("Rank"),
  week: take("Week"),
  sunday: [take("Sun").start, take("Crown").start] as [number, number],
  winner: take("Winner"),
  button: BUTTON,
};

/** Days are counted in a quarter at a time, one on each beat (a commit's worth). */
const step = (from: number, to: number, beats: number, b: number) =>
  from + (to - from) * Math.min(1, Math.floor(b + 1e-6) / beats);

/** How many days are in at a beat (0 to 7). Thursday to Saturday pass off screen. */
export function daysAt(beat: number): number {
  const w = UI.week;
  if (beat >= FREEZE) return 7;
  if (beat >= UI.sunday[0]) return step(6, 7, FREEZE - UI.sunday[0], beat - UI.sunday[0]);
  if (beat >= w.end) return 3;
  if (beat >= w.start) return step(0, 3, w.end - w.start, beat - w.start + 1);
  return 0;
}

/** The day's name at a beat, while the week counts. */
export function dayName(beat: number): string {
  return ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"][Math.min(6, Math.floor(daysAt(beat) - 1e-6))] ?? "MON";
}

// ─── The dark: `claude`, and what it's asked ────────────────

/** Beats into the suit-up take: `claude` types, Enter, the welcome, the ask, Enter. */
export const SUIT = { cmd: 0.5, enter: 2, welcome: 2.5, ask: 4.5, send: 10 };
export const CMD = "claude";
export const ASK = "win the week";
/** Beats per typed character: fast typing, slow enough to read. */
export const KEY_EVERY = 0.2;

/** The email: it lands, then the cursor clicks its button on this beat of the take. */
export const CLICK = 3;

// ─── Sound ──────────────────────────────────────────────────

const SKID = "/sounds/drive/skid.ogg";
const IMPACT = "/sounds/drive/impact.ogg";
const BOOM = "/trailer/sfx/explosion.wav";
const KEY = "/trailer/sfx/key.wav";
const WHOOSH = "/trailer/sfx/whoosh.wav";
const PING = "/trailer/sfx/ping.wav";
const CLICK_SFX = "/trailer/sfx/click.wav";
const CROWN = "/trailer/sfx/crown.wav";

const keys = (from: number, text: string): SoundCue[] =>
  [...text].map((_, k) => ({ beat: from + k * KEY_EVERY, src: KEY, gain: 0.55, rate: 0.9 + ((k * 7) % 5) * 0.05 }));

const drift = (s: Shot): SoundCue[] => [
  { beat: momentOf(s, DRIFT_IN / BEAT), src: SKID, gain: 0.8, dur: DRIFT_ARC },
  { beat: momentOf(s, CORNER_HIT), src: IMPACT, gain: 1 },
  { beat: momentOf(s, CORNER_HIT), src: BOOM, gain: 0.8, rate: 1.1 },
];

/** Sound effects over the music. The game's own sounds (the email's ping, the keys) play alone, in the music's drop-outs. */
export const SOUNDS: SoundCue[] = [
  ...drift(take("Raid")),
  // The email lands on silence, and its button is clicked.
  { beat: UI.email.start + 0.25, src: PING, gain: 0.9 },
  { beat: UI.email.start + CLICK, src: CLICK_SFX, gain: 0.9 },
  // In the dark: the keys, the Enters.
  ...keys(UI.suit.start + SUIT.cmd, CMD),
  { beat: UI.suit.start + SUIT.enter, src: KEY, gain: 1, rate: 0.6 },
  ...keys(UI.suit.start + SUIT.ask, ASK),
  { beat: UI.suit.start + SUIT.send, src: KEY, gain: 1, rate: 0.6 },
  // The week: a soft thud on every beat as buildings gain floors.
  ...Array.from({ length: UI.week.end - UI.week.start }, (_, i) => ({
    beat: UI.week.start + i,
    src: IMPACT,
    gain: 0.3,
    rate: 1.2 + 0.03 * (i % 4),
  })),
  ...drift(take("Revenge")),
  // Midnight's silence breaks on the crown.
  { beat: take("Crown").start + 0.25, src: WHOOSH, gain: 0.6, rate: 1.4 },
  { beat: take("Crown").start + 0.5, src: CROWN, gain: 1 },
  { beat: take("Crown").start + 0.5, src: IMPACT, gain: 1, rate: 0.6 },
  // The town lights up in rings from the crown.
  ...Array.from({ length: 4 }, (_, i) => ({ beat: UI.winner.start + i, src: BOOM, gain: 0.35 + 0.1 * i, rate: 1.6 - 0.1 * i })),
  // The button: the same ping, on the other side.
  { beat: BUTTON.start + 0.5, src: PING, gain: 0.9 },
];

export const ORANGE = "#e07a4f";
export const BLUE = "#5b8def";
export const LIME = "#c8e64a";

/** Beats that flash the screen: both drifts' corner hits, and the crown. */
export const BLASTS: number[] = [
  momentOf(take("Raid"), CORNER_HIT),
  momentOf(take("Revenge"), CORNER_HIT),
  take("Crown").start + 0.5,
];

/** No stakes cards: the game's own UI (the email, the rank, WINNER) is the caption. */
const TITLES: TitleCue[] = [];

/** The acts, for the studio's scene list. */
const SCENES = [
  { name: "Raid", start: 0, end: UI.email.start },
  { name: "Email", start: UI.email.start, end: UI.suit.start },
  { name: "Suit up", start: UI.suit.start, end: UI.rank.start },
  { name: "Rank and week", start: UI.rank.start, end: take("Revenge").start },
  { name: "Revenge", start: take("Revenge").start, end: take("Sun").start },
  { name: "Sunday", start: take("Sun").start, end: take("Crown").start },
  { name: "Crown", start: take("Crown").start, end: END },
  { name: "End card", start: LOGO, end: LENGTH },
];

/** Black under the DOM layer's takes and after the pictures end. */
function frameAt(beat: number): Frame<Stage> {
  if (beat >= END || beat < 0) return { kind: "black" };
  const s = [...SHOTS].reverse().find((x) => beat >= x.start) ?? SHOTS[0];
  if (s.kind === "ui") return { kind: "black" };
  return s.split ? { kind: "split" } : { kind: "full", stage: s.stage };
}

/** The film the studio plays. */
export const FILM: Film<Stage> = {
  beat: BEAT,
  length: LENGTH,
  scenes: SCENES,
  sounds: SOUNDS,
  titles: TITLES,
  flashes: BLASTS,
  song: { src: "/trailer/towns-launch.wav", offset: 0 },
  frameAt,
};
