// ─── Towns launch trailer: "Commits are ammo" ───────────────
// The launch film (Oct 8), in the same towns and rig as the teaser
// (lib/trailer/towns/teaser, components/trailer/towns/TownsRig). The story:
// your code builds your town, your car breaks theirs, they build back, and
// Claude Code's side comes out on top. Built take by take in the studio at
// /trailer/launch; the script is in the launch notes.

import {
  buildShots,
  frameOf,
  momentOf,
  scenesOf,
  shotFor as filmShotFor,
  type Film,
  type SoundCue,
  type Take,
  type TitleCue,
} from "@trailer-kit/film";
import {
  BEAT,
  CORNER_HIT,
  DRIFT_ARC,
  DRIFT_IN,
  MISSILE_HIT,
  REV_LAUNCH,
  SMASH_BLAST,
  type Shot,
  type ShotKind,
  type Stage,
} from "./teaser";

/** Rise: the building gains a floor band on every beat of its take, this many beats in all. */
export const RISE_BEATS = 8;

/** The takes: [name, stage, kind, beats long, trim, freeze] (see @trailer-kit/film). */
const TAKES: Take<Stage, ShotKind>[] = [
  // Your code builds your town: a band of floors on every beat.
  ["Rise", "claude", "rise", RISE_BEATS, 0],
  // The burnout, launching on the take's last beat, into the drop.
  ["Launch", "claude", "revback", 4, 0],
  // In the blue town: through a building's corner, a bomb, the missile.
  ["Corner smash", "codex", "cornersmash", 4, 1.6],
  ["Bomb", "codex", "invasion", 4, 0.5],
  ["Missile", "codex", "missileout", 4, 1],
  // They code too: the blue town builds back.
  ["Rebuild", "codex", "rise", 4, 0],
  // Hitting back, faster.
  ["Corner smash 2", "codex", "cornersmash", 2, 2.2],
  ["Missile 2", "codex", "missileout", 2, 1.8],
  // The last floor falls; the picture freezes as the music cuts out.
  ["Last floor", "codex", "finale", 8, 0, 6],
];

export const SHOTS: Shot[] = buildShots(TAKES, ["claude", "codex"]);

/** The pictures end here; the end card starts on the cut to black and runs twelve beats. */
export const END = SHOTS[SHOTS.length - 1].end;
export const LOGO = END;
export const LENGTH = END + 12;
/** The end card's button: the little car comes in this many beats after the cut, and bumps the lockup this long after. */
export const BUTTON_AT = 8;
export const BUMP = 0.8;

/** This stage's shot at `beat`, and seconds into its action. */
export function shotFor(stage: Stage, beat: number) {
  return filmShotFor(SHOTS, stage, beat, BEAT);
}

/** Beats that flash the screen: the corner hit, the bomb, the missile hit. */
export const BLASTS: number[] = SHOTS.flatMap((s) =>
  s.kind === "cornersmash"
    ? [momentOf(s, CORNER_HIT)]
    : s.kind === "invasion"
      ? [momentOf(s, SMASH_BLAST)]
      : s.kind === "missileout"
        ? [momentOf(s, MISSILE_HIT)]
        : [],
);

const SKID = "/sounds/drive/skid.ogg";
const IMPACT = "/sounds/drive/impact.ogg";
const BOOM = "/trailer/sfx/explosion.wav";
const WHOOSH = "/trailer/sfx/whoosh.wav";

/** Sound effects over the music, on each take's own moments. */
export const SOUNDS: SoundCue[] = SHOTS.flatMap((s): SoundCue[] => {
  if (s.kind === "rise")
    // A thud on every floor band, climbing.
    return Array.from({ length: RISE_BEATS }, (_, i) => ({
      beat: momentOf(s, i),
      src: IMPACT,
      gain: 0.35 + 0.05 * i,
      rate: 0.7 + 0.04 * i,
    }));
  if (s.kind === "revback")
    return [{ beat: momentOf(s, REV_LAUNCH / BEAT), src: SKID, gain: 0.7, dur: 0.5, rate: 1.1 }];
  if (s.kind === "finale")
    return [
      { beat: s.start + 2, src: IMPACT, gain: 1 },
      { beat: s.start + 2, src: BOOM, gain: 1, rate: 0.7 },
      { beat: s.start + 3.5, src: BOOM, gain: 0.7, rate: 0.5 },
    ];
  if (s.kind === "cornersmash")
    return [
      { beat: momentOf(s, DRIFT_IN / BEAT), src: SKID, gain: 0.8, dur: DRIFT_ARC },
      { beat: momentOf(s, CORNER_HIT), src: IMPACT, gain: 1 },
      { beat: momentOf(s, CORNER_HIT), src: BOOM, gain: 0.6, rate: 1.2 },
    ];
  if (s.kind === "invasion")
    return [
      { beat: momentOf(s, 1.5), src: IMPACT, gain: 0.8 },
      { beat: momentOf(s, SMASH_BLAST), src: BOOM, gain: 0.9 },
    ];
  if (s.kind === "missileout")
    return [
      { beat: momentOf(s, 1), src: WHOOSH, gain: 0.6 },
      { beat: momentOf(s, MISSILE_HIT), src: BOOM, gain: 1 },
      { beat: momentOf(s, MISSILE_HIT), src: IMPACT, gain: 0.7, rate: 0.8 },
    ];
  return [];
}).concat([
  // The end card's button: the little car skids in, bumps the lockup, honks.
  { beat: LOGO + BUTTON_AT, src: SKID, gain: 0.6, dur: BUMP * BEAT + 0.1, rate: 1.2 },
  { beat: LOGO + BUTTON_AT + BUMP, src: IMPACT, gain: 0.45, rate: 1.4 },
  { beat: LOGO + BUTTON_AT + BUMP + 0.4, src: "/trailer/sfx/horn.wav", gain: 0.45 },
]);


const ORANGE = "#e07a4f";
const BLUE = "#5b8def";

/** The cards, [take name, text, color]: one on each take, for its whole length. */
const CARDS: [string, string, string][] = [
  ["Launch", "YOUR CODE BUILDS.", ORANGE],
  ["Rebuild", "THEY CODE TOO.", BLUE],
];

const TITLES: TitleCue[] = CARDS.flatMap(([name, text, color]) =>
  SHOTS.filter((s) => s.name === name).map((s) => ({
    start: s.start,
    end: s.end,
    text,
    place: "big" as const,
    color,
  })),
);

/** The film the studio plays. */
export const FILM: Film<Stage> = {
  beat: BEAT,
  length: LENGTH,
  scenes: [...scenesOf(SHOTS), { name: "End card", start: LOGO, end: LENGTH }],
  sounds: SOUNDS,
  titles: TITLES,
  flashes: BLASTS,
  song: { src: "/trailer/towns-launch.wav", offset: 0 },
  frameAt: (beat) => frameOf(SHOTS, beat),
};
