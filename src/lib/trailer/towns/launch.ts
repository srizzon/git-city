// ─── Towns launch trailer: "Commits" ────────────────────────
// The launch film (Oct 8), in the same towns and rig as the teaser
// (lib/trailer/towns/teaser, components/trailer/towns/TownsRig), plus a DOM
// layer for the terminal and the town ranking (components/trailer/towns/
// LaunchOverlay). It teaches the rule in three ideas: pick a side, your code
// is your town's score, the top town takes the week. The rhythm is typing:
// a commit per beat, a day per bar, and Thursday breaks the pattern.
// The numbers are staged: the first battle starts Oct 12.

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

/** The takes: [name, stage, kind, beats long, trim, freeze] (see @trailer-kit/film). "ui" takes are the DOM layer on black. */
const TAKES: Take<Stage, ShotKind>[] = [
  // The hook: a commit, a floor; a push, a floor; one more, the whole town.
  ["Type commit", "claude", "ui", 4, 0],
  ["Floor", "claude", "floor", 2, 0],
  ["Type push", "claude", "ui", 2, 0],
  ["Floor 2", "claude", "floor", 2, 0],
  ["Type win", "claude", "ui", 5, 0],
  ["Rise", "claude", "rise", 5, 0],
  // Pick a side.
  ["Sides", "both", "mascot", 4, 0],
  // Code all week: both towns from above, buildings gaining floors on every
  // beat, each side's number counting up with them; a bar a day.
  ["Week", "both", "week", 12, 0],
  // It gets personal: the orange car drifts through the corner of one of
  // their buildings (the teaser's take); on Friday they build it back.
  ["Thu", "codex", "cornersmash", 3, 1.6],
  ["Fri", "codex", "regrow", 5, 0],
  // Sunday: the cuts shorten toward midnight.
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
  ["Sun 11", "claude", "aerial", 0.5, 6],
  // The payoff.
  ["Crown", "claude", "crown", 4, 0],
  ["Monument", "claude", "monument", 4, 0],
];

export const SHOTS: Shot[] = buildShots(TAKES, ["claude", "codex"]);

function take(name: string): Shot {
  const s = SHOTS.find((x) => x.name === name);
  if (!s) throw new Error(`No take "${name}"`);
  return s;
}

/** The pictures end here; the end card starts on the cut to black and runs twelve beats. */
export const END = SHOTS[SHOTS.length - 1].end;
export const LOGO = END;
export const LENGTH = END + 12;
/** The end card's button starts this many beats after the cut. */
export const BUTTON_AT = 7;

/** Sunday's countdown: ten seconds, one a beat, midnight on the cut to the crown. */
export const FREEZE = take("Crown").start;
export const COUNT_FROM = FREEZE - 10;

/** This stage's shot at `beat`, and seconds into its action. */
export function shotFor(stage: Stage, beat: number) {
  return filmShotFor(SHOTS, stage, beat, BEAT);
}

// ─── The staged week ────────────────────────────────────────
// Per dev, a day at a time, Monday first. Claude leads Monday, Codex passes
// on Wednesday and leads into Sunday, Claude takes it by one at midnight.

export type Side = "claude" | "codex";

export const WEEK: Record<Side, number[]> = {
  claude: [44, 38, 30, 52, 61, 48, 69],
  codex: [40, 40, 56, 39, 50, 58, 58],
};

/** Per dev after `days` days (fractional: part of the next day). */
export function perDev(side: Side, days: number): number {
  let sum = 0;
  for (let d = 0; d < 7; d++) sum += WEEK[side][d] * Math.max(0, Math.min(1, days - d));
  return sum;
}

/** The takes the DOM layer draws over: the terminal, the pickers, the week's split, Friday, and Sunday's cuts. */
export const UI = {
  terminal: ["Type commit", "Type push", "Type win"].map(take),
  sides: take("Sides"),
  week: take("Week"),
  fri: take("Fri"),
  sunday: [take("Sun").start, take("Crown").start] as [number, number],
};

/** Days are counted in a quarter at a time, one on each beat (a commit's worth). */
const step = (from: number, to: number, beats: number, b: number) =>
  from + (to - from) * Math.min(1, Math.floor(b + 1e-6) / beats);

/** How many days are in at a beat (0 to 7). Thursday and Saturday pass off screen. */
export function daysAt(beat: number): number {
  const w = UI.week;
  if (beat >= FREEZE) return 7;
  if (beat >= UI.sunday[0]) return step(6, 7, FREEZE - UI.sunday[0], beat - UI.sunday[0]);
  if (beat >= UI.fri.start) return step(4, 5, UI.fri.end - UI.fri.start, beat - UI.fri.start);
  if (beat >= w.end) return 4;
  if (beat >= w.start) return step(0, 3, w.end - w.start, beat - w.start + 1);
  return 0;
}

/** The day's name at a beat, while the week counts. */
export function dayName(beat: number): string {
  return ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"][Math.min(6, Math.floor(daysAt(beat) - 1e-6))] ?? "MON";
}

/** What each typed take types. */
export const TYPED = ['git commit -m "ship it"', "git push", 'git commit -m "win the week"'];

/** Beats that flash the screen: the corner hit. */
export const BLASTS: number[] = [momentOf(take("Thu"), CORNER_HIT)];

const SKID = "/sounds/drive/skid.ogg";
const IMPACT = "/sounds/drive/impact.ogg";
const BOOM = "/trailer/sfx/explosion.wav";
const KEY = "/trailer/sfx/key.wav";
const WHOOSH = "/trailer/sfx/whoosh.wav";
const HORN = "/trailer/sfx/horn.wav";

/** Beats per typed character: fast typing, slow enough to read. */
const KEY_EVERY = 0.125;

/** When the typed take's `k`-th character lands; the whole line then holds until the Enter on the take's end. */
export function keyBeat(s: Shot, i: number, k: number): number {
  return s.start + 0.25 + k * KEY_EVERY;
}

/** A key click for every character typed, and the Enter. */
function typing(): SoundCue[] {
  return UI.terminal.flatMap((s, i) => [
    ...Array.from({ length: TYPED[i].length }, (_, k) => ({
      beat: keyBeat(s, i, k),
      src: KEY,
      gain: 0.5,
      rate: 0.9 + ((k * 7) % 5) * 0.05,
    })),
    { beat: s.end, src: KEY, gain: 1, rate: 0.6 },
  ]);
}

/** Sound effects over the music, on each take's own moments. */
export const SOUNDS: SoundCue[] = [
  ...typing(),
  // A floor slams down on each Enter; the town rises a band a beat.
  ...["Floor", "Floor 2"].map((n) => ({ beat: take(n).start, src: IMPACT, gain: 1, rate: 0.7 })),
  ...Array.from({ length: take("Rise").end - take("Rise").start }, (_, i) => ({
    beat: take("Rise").start + i,
    src: IMPACT,
    gain: 0.4 + 0.08 * i,
    rate: 0.75 + 0.05 * i,
  })),
  // The week: a soft thud on every beat as buildings gain floors.
  ...Array.from({ length: take("Week").end - take("Week").start }, (_, i) => ({
    beat: take("Week").start + i,
    src: IMPACT,
    gain: 0.3,
    rate: 1.2 + 0.03 * (i % 4),
  })),
  // Thursday: the drift, the corner hit.
  { beat: momentOf(take("Thu"), DRIFT_IN / BEAT), src: SKID, gain: 0.8, dur: DRIFT_ARC },
  { beat: momentOf(take("Thu"), CORNER_HIT), src: IMPACT, gain: 1 },
  { beat: momentOf(take("Thu"), CORNER_HIT), src: BOOM, gain: 0.7, rate: 1.1 },
  // Friday: their floors come back, a beat each.
  ...Array.from({ length: 4 }, (_, i) => ({ beat: take("Fri").start + i, src: IMPACT, gain: 0.45, rate: 1.3 })),
  // The crown slams down; the monument rises in two steps.
  { beat: take("Crown").start + 0.5, src: IMPACT, gain: 1, rate: 0.6 },
  { beat: take("Crown").start + 0.25, src: WHOOSH, gain: 0.5, rate: 1.4 },
  { beat: take("Monument").start, src: IMPACT, gain: 0.9, rate: 0.5 },
  { beat: take("Monument").start + 1, src: IMPACT, gain: 1, rate: 0.45 },
  // The end card's button: Codex scores, Claude answers at once, a honk.
  { beat: LOGO + BUTTON_AT + 1, src: KEY, gain: 0.8, rate: 0.7 },
  { beat: LOGO + BUTTON_AT + 1.5, src: KEY, gain: 0.8, rate: 0.9 },
  { beat: LOGO + BUTTON_AT + 2, src: HORN, gain: 0.45 },
];

export const ORANGE = "#e07a4f";
export const BLUE = "#5b8def";
export const LIME = "#c8e64a";

/** The four cards, each for one bar from its take's start (or its take, if shorter). */
const CARDS: [string, string, string][] = [
  ["Sides", "PICK A SIDE.", LIME],
  ["Week", "CODE ALL WEEK.", LIME],
  ["Thu", "IT GETS PERSONAL.", ORANGE],
  ["Crown", "TOP TOWN WINS.", LIME],
];

const TITLES: TitleCue[] = CARDS.map(([name, text, color]) => ({
  start: take(name).start,
  end: Math.min(take(name).start + 4, take(name).end),
  text,
  place: "big" as const,
  color,
}));

/** The acts, for the studio's scene list. */
const SCENES = [
  { name: "Hook", start: 0, end: take("Sides").start },
  { name: "Pick a side", start: take("Sides").start, end: take("Week").start },
  { name: "Code all week", start: take("Week").start, end: take("Thu").start },
  { name: "It gets personal", start: take("Thu").start, end: take("Sun").start },
  { name: "Sunday", start: take("Sun").start, end: take("Crown").start },
  { name: "Top town wins", start: take("Crown").start, end: END },
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
