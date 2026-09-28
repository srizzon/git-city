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
  // The hook: a commit, a floor; a push, a floor; a roll, the whole town.
  ["Type commit", "claude", "ui", 3, 0],
  ["Floor", "claude", "floor", 2, 0],
  ["Type push", "claude", "ui", 2, 0],
  ["Floor 2", "claude", "floor", 2, 0],
  ["Type roll", "claude", "ui", 1, 0],
  ["Rise", "claude", "rise", 6, 0],
  // Pick a side.
  ["Sides", "both", "mascot", 8, 0],
  // Code all week: a day a bar, two beats in a town, two on the board.
  ["Board", "claude", "ui", 2, 0],
  ["Mon", "claude", "grow", 2, 0],
  ["Board Mon", "claude", "ui", 2, 0],
  ["Tue", "codex", "grow", 2, 0],
  ["Board Tue", "claude", "ui", 2, 0],
  ["Wed", "codex", "grow", 2, 0],
  ["Board Wed", "claude", "ui", 4, 0],
  // It gets personal: into their town, and they build back.
  ["Thu", "codex", "cornersmash", 4, 1.6],
  ["Tower", "codex", "finale", 5, 1],
  ["Fri", "codex", "regrow", 4, 0],
  ["Board Fri", "claude", "ui", 3, 0],
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
  ["Midnight", "claude", "ui", 4, 0],
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

/** Sunday's countdown: ten seconds, one a beat, zero on the freeze. */
export const FREEZE = take("Midnight").start + 2;
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

/** The takes that show the board, the terminal, or the Sunday clock. */
export const UI = {
  terminal: ["Type commit", "Type push", "Type roll"].map(take),
  board: ["Board", "Board Mon", "Board Tue", "Board Wed", "Board Fri", "Midnight"].map(take),
  sides: take("Sides"),
  sunday: [take("Sun").start, take("Midnight").end] as [number, number],
};

/** Days on the board at each board take's start, rolled in over its first beat. */
const BOARD_DAYS = [0, 1, 2, 3, 5, 7];

/** How many days are in at a beat (0 to 7), as the board shows them. */
export function daysAt(beat: number): number {
  const sun = UI.sunday[0];
  if (beat >= FREEZE) return 7;
  if (beat >= sun) return 6 + (beat - sun) / (FREEZE - sun);
  let days = 0;
  UI.board.forEach((s, i) => {
    if (i === BOARD_DAYS.length - 1 || beat < s.start) return;
    const from = i === 0 ? 0 : BOARD_DAYS[i - 1];
    days = from + (BOARD_DAYS[i] - from) * Math.min(1, beat - s.start);
  });
  return days;
}

/** What each typed take types. */
export const TYPED = ['git commit -m "ship it"', "git push", 'git commit -am "one more"'];

/** Beats that flash the screen: the corner hit, the tower. */
export const BLASTS: number[] = [momentOf(take("Thu"), CORNER_HIT), take("Tower").start + 1];

const SKID = "/sounds/drive/skid.ogg";
const IMPACT = "/sounds/drive/impact.ogg";
const BOOM = "/trailer/sfx/explosion.wav";
const KEY = "/trailer/sfx/key.wav";
const WHOOSH = "/trailer/sfx/whoosh.wav";
const HORN = "/trailer/sfx/horn.wav";

/** When the typed take's `k`-th character lands (the last quarter beat is the Enter's). */
export function keyBeat(s: Shot, i: number, k: number): number {
  return s.start + (k / TYPED[i].length) * (s.end - s.start - 0.25);
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
  ...Array.from({ length: 6 }, (_, i) => ({
    beat: take("Rise").start + i,
    src: IMPACT,
    gain: 0.4 + 0.08 * i,
    rate: 0.75 + 0.05 * i,
  })),
  // Growing buildings pop on their beats.
  ...["Mon", "Tue", "Wed"].flatMap((n) => [
    { beat: take(n).start, src: IMPACT, gain: 0.5, rate: 1.1 },
    { beat: take(n).start + 1, src: IMPACT, gain: 0.6, rate: 1.2 },
  ]),
  // Thursday.
  { beat: momentOf(take("Thu"), DRIFT_IN / BEAT), src: SKID, gain: 0.8, dur: DRIFT_ARC },
  { beat: momentOf(take("Thu"), CORNER_HIT), src: IMPACT, gain: 1 },
  { beat: momentOf(take("Thu"), CORNER_HIT), src: BOOM, gain: 0.6, rate: 1.2 },
  { beat: take("Tower").start + 1, src: IMPACT, gain: 1 },
  { beat: take("Tower").start + 1, src: BOOM, gain: 1, rate: 0.7 },
  { beat: take("Tower").start + 2.5, src: BOOM, gain: 0.7, rate: 0.5 },
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

/** The four cards, each for one bar from its take's start. */
const CARDS: [string, string, string][] = [
  ["Sides", "PICK A SIDE.", LIME],
  ["Board", "CODE ALL WEEK.", LIME],
  ["Thu", "IT GETS PERSONAL.", ORANGE],
  ["Crown", "TOP TOWN WINS.", LIME],
];

const TITLES: TitleCue[] = CARDS.map(([name, text, color]) => ({
  start: take(name).start,
  end: take(name).start + 4,
  text,
  place: "big" as const,
  color,
}));

/** The acts, for the studio's scene list. */
const SCENES = [
  { name: "Hook", start: 0, end: take("Sides").start },
  { name: "Pick a side", start: take("Sides").start, end: take("Board").start },
  { name: "Code all week", start: take("Board").start, end: take("Thu").start },
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
