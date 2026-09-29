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
// The story: a Codex car drifts through @srizzon's building and the
// picture holds on the wreck under the game's "knocked your building down"
// popup, "Hit back" clicked; in the dark, `claude` and "win the week"; the
// week from behind, down to Sunday's last second; midnight, silence; the
// crown on the rebuilt building, the town lit, WINNER; the name.

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
/** The week: Monday to Saturday two beats a day, then Sunday's four on the clock. */
const DAY_BEATS = 2;
const SUNDAY_BEATS = 4;
const WEEK_BEATS = 6 * DAY_BEATS + SUNDAY_BEATS;

/** The takes: [name, stage, kind, beats long, trim, freeze] (see @trailer-kit/film). "ui" takes are the DOM layer on black. */
const TAKES: Take<Stage, ShotKind>[] = [
  // Cold open in the action: a Codex car drifts through @srizzon's building;
  // the picture holds on the wreck while the game's popup comes up over it.
  ["Raid", "claude", "cornersmash", 6, RAID_TRIM, RAID_TRIM + 2.4],
  // Suiting up, in the dark: `claude`, its welcome, "win the week".
  ["Suit up", "claude", "ui", 12, 0],
  // The week from above, both towns, Monday to Sunday midnight: two beats a
  // day, Sunday's last four on the clock, Claude passing on the last one.
  // The picture holds a beat on midnight, in silence.
  ["Week", "both", "week", WEEK_BEATS + 1, 0, WEEK_BEATS],
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

/** The pictures end here; the end card runs eight beats from the cut to black. */
export const END = SHOTS[SHOTS.length - 1].end;
export const LOGO = END;
export const CARD_END = LOGO + 8;
export const LENGTH = CARD_END;

/** Sunday's countdown: its last seconds, one a beat, midnight on the freeze (one beat of silence). */
export const FREEZE = take("Week").start + WEEK_BEATS;
export const COUNT_FROM = FREEZE - SUNDAY_BEATS;

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

/** The raid's popup comes up over the held wreck on this beat, and its button is clicked on this one. */
export const POPUP = { start: 3, click: 5 };

/** The takes the DOM layer draws over. */
export const UI = {
  popup: { start: POPUP.start, end: take("Raid").end },
  suit: take("Suit up"),
  week: take("Week"),
  winner: take("Winner"),
};

/** How many days are in at a beat (0 to 7): half a day a beat to Saturday, then Sunday a quarter a beat, whole at midnight. */
export function daysAt(beat: number): number {
  const b = Math.floor(beat - UI.week.start + 1e-6) + 1;
  if (beat >= FREEZE) return 7;
  if (beat < UI.week.start) return 0;
  if (b <= 6 * DAY_BEATS) return b / DAY_BEATS;
  // Sunday's beats count 6, 6¼, 6½, 6¾: the last quarter comes in on midnight.
  return 6 + (b - 6 * DAY_BEATS - 1) / SUNDAY_BEATS;
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
  // The popup comes up on silence, and its button is clicked.
  { beat: POPUP.start, src: PING, gain: 0.9 },
  { beat: POPUP.click, src: CLICK_SFX, gain: 0.9 },
  // In the dark: the keys, the Enters.
  ...keys(UI.suit.start + SUIT.cmd, CMD),
  { beat: UI.suit.start + SUIT.enter, src: KEY, gain: 1, rate: 0.6 },
  ...keys(UI.suit.start + SUIT.ask, ASK),
  { beat: UI.suit.start + SUIT.send, src: KEY, gain: 1, rate: 0.6 },
  // The week: a soft thud on every beat as buildings gain floors.
  ...Array.from({ length: FREEZE - UI.week.start }, (_, i) => ({
    beat: UI.week.start + i,
    src: IMPACT,
    gain: 0.3,
    rate: 1.2 + 0.03 * (i % 4),
  })),
  // Midnight's silence breaks on the crown.
  { beat: take("Crown").start + 0.25, src: WHOOSH, gain: 0.6, rate: 1.4 },
  { beat: take("Crown").start + 0.5, src: CROWN, gain: 1 },
  { beat: take("Crown").start + 0.5, src: IMPACT, gain: 1, rate: 0.6 },
  // The town lights up in rings from the crown.
  ...Array.from({ length: 4 }, (_, i) => ({ beat: UI.winner.start + i, src: BOOM, gain: 0.35 + 0.1 * i, rate: 1.6 - 0.1 * i })),
];

export const ORANGE = "#e07a4f";
export const BLUE = "#5b8def";
export const LIME = "#c8e64a";

/** Beats that flash the screen: the drift's corner hit, and the crown. */
export const BLASTS: number[] = [momentOf(take("Raid"), CORNER_HIT), take("Crown").start + 0.5];

/** No stakes cards: the game's own UI (the popup, the numbers, WINNER) is the caption. */
const TITLES: TitleCue[] = [];

/** The acts, for the studio's scene list. */
const SCENES = [
  { name: "Raid", start: 0, end: UI.suit.start },
  { name: "Suit up", start: UI.suit.start, end: UI.week.start },
  { name: "Week", start: UI.week.start, end: take("Crown").start },
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
