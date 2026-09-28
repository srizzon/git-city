// ─── Towns teaser ───────────────────────────────────────────
// The Git City Towns "coming soon" teaser, as a Film (@trailer-kit/film) the
// studio plays in the engine, so the whole film is one screen recording. It
// is also the worked example of the trailer kit (.claude/skills/gg/kit/README.md):
// the takes, their moments, and the sounds on those moments.
//
// The film: a split screen burnout hooks, three flashes of play cut at their
// peak, the car freezes mid-air as the music drops out, then the end card
// (components/trailer/towns/EndCard). Every take's shot is drawn by
// components/trailer/towns/TownsRig, by its kind.

import type { CityBuilding } from "@/lib/github";
import { LOT, lotToWorld } from "@/lib/league-city/grid";
import type { CityObject } from "@/lib/league-city/types";
import {
  buildShots,
  frameOf,
  momentOf,
  scenesOf,
  shotFor as filmShotFor,
  type Film,
  type Shot as FilmShot,
  type SoundCue,
  type Take,
  type TitleCue,
} from "@trailer-kit/film";

/** The teaser track (the kit's tools/music.mjs, "soon"): 150 BPM, a beat is 0.4s, a bar 1.6s. */
export const BPM = 150;
/** Seconds per beat. */
export const BEAT = 60 / BPM;

/** Orange world (Claude Code's town) or blue (Codex's). */
export type Stage = "claude" | "codex";

/** The shots TownsRig can draw. The teaser uses some; the rest are there for the next film. */
export type ShotKind =
  | "rev"
  | "revback"
  | "cornersmash"
  | "drift"
  | "missile"
  | "topdrift"
  | "jump"
  | "boost"
  | "arrival"
  | "aerial"
  | "invasion"
  | "finale"
  | "rise"
  | "missileout"
  | "ui"
  | "floor"
  | "grow"
  | "mascot"
  | "regrow"
  | "crown"
  | "monument";

export type Shot = FilmShot<Stage, ShotKind>;

/** The takes: [name, stage, kind, beats long, trim, freeze] (see @trailer-kit/film). */
const TAKES: Take<Stage, ShotKind>[] = [
  ["Burnout · split", "both", "revback", 4, 0],
  ["Drift", "claude", "drift", 3, 2.1],
  ["Missile", "codex", "missile", 3, 1],
  ["Corner smash", "codex", "cornersmash", 3, 1.6],
  ["Jump · freeze", "claude", "jump", 5, 1, 4],
];

export const SHOTS: Shot[] = buildShots(TAKES, ["claude", "codex"]);
export { momentOf };

/** This stage's shot at `beat`, and seconds into its action. */
export function shotFor(stage: Stage, beat: number) {
  return filmShotFor(SHOTS, stage, beat, BEAT);
}

/** The missile hits on its take's third beat. */
export const MISSILE_HIT = 2;
/** A bomb goes off on the smash take's third beat. */
export const SMASH_BLAST = 2;
/** Beats into their action: the boost take hits its pad, the jump leaves the ramp. */
export const BOOST_HIT = 1;
export const JUMP_OFF = 2.2;
/** The tower take: the car hits and the tower starts to come down on its third beat. */
const FINALE = SHOTS.find((s) => s.kind === "finale");
export const COLLAPSE = FINALE ? FINALE.start + 2 : -1;
/** Drift take: straight in for this long, then round the corner in this long (s). */
export const DRIFT_IN = 0.3;
/** The drift take drives up the avenue this long before it turns (s). */
export const DRIFT_LEAD = 1.0;
export const DRIFT_ARC = 0.95;
/** The burnout launches this long into its take (s): the track's hit on beat 4. */
export const REV_LAUNCH = 1.2;
/** Corner smash: the car reaches the building's corner at the end of its drift (beats into the take). */
export const CORNER_HIT = (DRIFT_IN + DRIFT_ARC) / BEAT - 0.25;

/** Beats that flash the screen: the missile hit, the corner hit, the bombs. */
export const BLASTS: number[] = [
  ...SHOTS.flatMap((s) =>
    s.kind === "cornersmash"
      ? [momentOf(s, CORNER_HIT)]
      : s.kind === "missile"
        ? [momentOf(s, MISSILE_HIT)]
        : s.kind === "invasion"
          ? [momentOf(s, SMASH_BLAST)]
          : [],
  ),
];

/** The end card's button: the little car comes in this many beats after the cut, and bumps the lockup this long after. */
export const BUTTON_AT = 8;
export const BUMP = 0.8;

const SKID = "/sounds/drive/skid.ogg";
const IMPACT = "/sounds/drive/impact.ogg";

/** Sound effects over the music: each take's own moments, and the end card's button. */
export const SOUNDS: SoundCue[] = (
  [
    // The end card's button: the little car skids in, bumps the lockup, honks.
    {
      beat: SHOTS[SHOTS.length - 1].end + BUTTON_AT,
      src: SKID,
      gain: 0.6,
      dur: BUMP * BEAT + 0.1,
      rate: 1.2,
    },
    { beat: SHOTS[SHOTS.length - 1].end + BUTTON_AT + BUMP, src: IMPACT, gain: 0.45, rate: 1.4 },
    {
      beat: SHOTS[SHOTS.length - 1].end + BUTTON_AT + BUMP + 0.4,
      src: "/trailer/sfx/horn.wav",
      gain: 0.45,
    },
  ] as SoundCue[]
).concat(
  SHOTS.flatMap((s): SoundCue[] => {
    if (s.kind === "revback" && s.stage === "claude")
      return [{ beat: momentOf(s, REV_LAUNCH / BEAT), src: SKID, gain: 0.7, dur: 0.5, rate: 1.1 }];
    if (s.kind === "cornersmash")
      return [
        { beat: momentOf(s, DRIFT_IN / BEAT), src: SKID, gain: 0.8, dur: DRIFT_ARC },
        { beat: momentOf(s, CORNER_HIT), src: IMPACT, gain: 1 },
        { beat: momentOf(s, CORNER_HIT), src: "/trailer/sfx/explosion.wav", gain: 0.6, rate: 1.2 },
      ];
    if (s.kind === "rev")
      return [
        { beat: momentOf(s, REV_LAUNCH / BEAT), src: SKID, gain: 0.55, dur: 0.45, rate: 1.15 },
      ];
    if (s.kind === "drift")
      return [{ beat: momentOf(s, DRIFT_LEAD / BEAT), src: SKID, gain: 0.9, dur: DRIFT_ARC + 0.2 }];
    if (s.kind === "topdrift")
      return [{ beat: momentOf(s, DRIFT_IN / BEAT), src: SKID, gain: 0.8, dur: DRIFT_ARC + 0.2 }];
    if (s.kind === "invasion")
      return [
        { beat: momentOf(s, 1.5), src: IMPACT, gain: 0.8 },
        { beat: momentOf(s, SMASH_BLAST), src: "/trailer/sfx/explosion.wav", gain: 0.9 },
      ];
    if (s.kind === "boost")
      return [
        { beat: momentOf(s, BOOST_HIT), src: "/trailer/sfx/whoosh.wav", gain: 0.9, rate: 0.8 },
      ];
    if (s.kind === "jump")
      return [
        { beat: momentOf(s, JUMP_OFF), src: "/trailer/sfx/whoosh.wav", gain: 0.6, rate: 0.6 },
      ];
    if (s.kind === "finale")
      return [
        { beat: s.start + 2, src: IMPACT, gain: 1 },
        { beat: s.start + 2, src: "/trailer/sfx/explosion.wav", gain: 1, rate: 0.7 },
        { beat: s.start + 3.5, src: "/trailer/sfx/explosion.wav", gain: 0.7, rate: 0.5 },
      ];
    if (s.kind === "missile")
      return [
        { beat: momentOf(s, 1), src: "/trailer/sfx/whoosh.wav", gain: 0.6 },
        { beat: momentOf(s, MISSILE_HIT), src: "/trailer/sfx/explosion.wav", gain: 1 },
        { beat: momentOf(s, MISSILE_HIT), src: IMPACT, gain: 0.7, rate: 0.8 },
      ];
    return [];
  }),
);

/** The pictures end here; the rest is the black end card and the late crash. */
export const END = SHOTS[SHOTS.length - 1].end;
/** The end card starts here, on the cut to black, and runs ten beats. */
export const LOGO = END;
export const LENGTH = END + 10;

const ORANGE = "#e07a4f";
const BLUE = "#5b8def";
/** A word per take on its moment, [take kind, word, beat into the take, big]. Off in the teaser, which keeps its mystery. */
const TAGS: [ShotKind, string, number, boolean][] = [
  ["drift", "Drift", DRIFT_LEAD / BEAT + 0.5, false],
  ["missile", "Fire", MISSILE_HIT, false],
  ["topdrift", "Slide", 0.75, false],
  ["cornersmash", "Smash", CORNER_HIT, false],
  ["jump", "Fly", JUMP_OFF, false],
  ["boost", "Boost", BOOST_HIT, false],
];
// Flip to see word tags on the takes (the teaser went without them).
const TAGGED = false;

const TITLES: TitleCue[] = (TAGGED ? TAGS : []).flatMap(([kind, text, at, big]) =>
  SHOTS.filter((s) => s.kind === kind).map((s) => ({
    start: momentOf(s, at),
    end: s.end,
    text,
    place: big ? ("big" as const) : ("tag" as const),
    color: s.stage === "claude" ? ORANGE : BLUE,
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
  song: { src: "/trailer/towns-teaser.wav", offset: 0 },
  frameAt: (beat) => frameOf(SHOTS, beat),
};

// ─── The street the car smashes through ─────────────────────
// Both towns are young (a handful of members), so the teaser fills a run of
// empty lots next to the main street with extra buildings for the car to go
// through. They exist only on the trailer page.

/** Lots in a row the car drives up, south to north. */
const RUN = 5;
const EXTRA_HEIGHTS = [96, 132, 78, 150, 190];

export interface SmashRun {
  /** World x of the line the car drives (a lot column's center). */
  x: number;
  /** World z of each lot's center, south to north. */
  zs: number[];
  buildings: CityBuilding[];
}

/**
 * The first column next to the main street with RUN free lots close to the
 * entrance (cross streets in between are fine: the car goes straight over
 * them), filled with buildings, the tallest last.
 */
export function smashRun(
  objects: readonly CityObject[],
  h: number,
  model: CityBuilding,
): SmashRun | null {
  const taken = new Set(objects.map((o) => `${o.x},${o.z}`));
  for (const col of [1, -1, 3, -3]) {
    const rows: number[] = [];
    for (let z = -1; z >= Math.max(-2 * h + 1, -14) && rows.length < RUN; z--)
      if (!taken.has(`${col},${z}`)) rows.push(z);
    if (rows.length < RUN) continue;
    const [x] = lotToWorld(col, rows[0]);
    const zs = rows.map((z) => lotToWorld(col, z)[1]);
    const buildings = zs.map((z, i) => {
      const height = EXTRA_HEIGHTS[i];
      const w = 36 + ((i * 7) % 9);
      const login = `teaser-${col}-${i}`;
      return {
        ...model,
        login,
        loginLower: login,
        position: [x, 0, z] as [number, number, number],
        width: w,
        depth: w,
        height,
        floors: Math.max(3, Math.floor(height / 6)),
        windowsPerFloor: 4,
        sideWindowsPerFloor: 4,
        owned_items: [],
        loadout: null,
        custom_color: null,
        billboard_images: [],
        active_raid_tag: null,
        active_league_crown: null,
        active_drop: null,
      };
    });
    return { x, zs, buildings };
  }
  return null;
}

/** The lot size, for the shots. */
export { LOT };
