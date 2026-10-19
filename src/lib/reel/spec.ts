// ─── Reel spec ──────────────────────────────────────────────
// A vertical reel as data: the world it plays in, the narration line by
// line, the scenes cut on spoken words, the overlays, and the facts every
// number on screen comes from. The reel factory (docs: the git-city-reels
// skill) writes one per reel; the studio at /reels plays it and the export
// renders it. Specs live outside the repo, in REELS_HOME.

import { z } from "zod";

/** Seconds, "#12" (word 12), or a spoken word, each with an optional "+0.3" / "-0.1". */
export const Anchor = z.union([z.number().nonnegative(), z.string().min(1)]);
export type Anchor = z.infer<typeof Anchor>;

const HeaderLine = z.object({
  text: z.string().min(1),
  /** giant: one number or word that fills the frame (a card's candidate number). */
  size: z.enum(["giant", "huge", "big", "small"]),
  /** Kept as typed (a login, "seuuser SP"), not in caps. */
  plain: z.boolean().optional(),
});

const Badge = z.object({
  kind: z.enum(["governor", "senator", "mayor", "president", "founder"]),
  at: Anchor,
  /** The small line under the title, e.g. "seuuser · SP · esta semana". */
  sub: z.string(),
});

const Balloon = z.object({
  type: z.literal("balloon"),
  /** "example": the world's example building; otherwise a resident's login. */
  target: z.union([z.literal("example"), z.object({ login: z.string() })]),
  from: Anchor,
  /** Fades out over 0.4s from here (default: the end). */
  to: Anchor.optional(),
  /** A plate with this text (no @: on Instagram an @ tags whoever owns it); else the GitHub photo. */
  plate: z.string().optional(),
  /** The plate as a comment (the ink speech bubble) that drops onto its building's lot from above, in hard steps. */
  drop: z.boolean().default(false),
  badges: z.array(Badge).default([]),
});

/** A ranking as bars between the header and the captions (the state race). */
const Bars = z.object({
  type: z.literal("bars"),
  from: Anchor,
  to: Anchor.optional(),
  title: z.string().optional(),
  rows: z
    .array(z.object({ label: z.string(), value: z.union([z.number(), z.string()]), lit: z.boolean().optional() }))
    .min(2)
    .max(8),
});

/** A list of people (photo, login, a tag such as the state) between the header and the captions, a page at a time. */
const Roster = z.object({
  type: z.literal("roster"),
  from: Anchor,
  to: Anchor.optional(),
  title: z.string().optional(),
  rows: z.array(z.object({ tag: z.string(), login: z.string(), lit: z.boolean().optional() })).min(1),
  /** Seven rows fit between the header and the captions. */
  perPage: z.number().int().min(3).max(7).default(7),
});

/** A number counting up in the header's place (e.g. buildings knocked down over a montage). */
const Counter = z.object({
  type: z.literal("counter"),
  from: Anchor,
  /** When it reaches its value. */
  reach: Anchor,
  to: Anchor,
  value: z.union([z.number(), z.string()]),
  label: z.string(),
});

/** A WANTED poster slammed in: a dev's photo in sepia, when and where. */
const Poster = z.object({
  type: z.literal("poster"),
  from: Anchor,
  to: Anchor.optional(),
  title: z.string(),
  login: z.string(),
  when: z.string(),
  where: z.string(),
});

/** The account's Instagram profile card, its Follow button tapped at `done` (the follower count goes up by one). */
const Follow = z.object({
  type: z.literal("follow"),
  from: Anchor,
  done: Anchor,
  handle: z.string(),
  name: z.string(),
  /** The profile picture: a GitHub login, or an image under REELS_HOME (a path with a "/", e.g. the account's own Instagram photo). */
  avatar: z.string(),
  bio: z.array(z.string()).max(4),
  link: z.string(),
  posts: z.union([z.number(), z.string()]),
  followers: z.union([z.number(), z.string()]),
  following: z.union([z.number(), z.string()]),
});

/** A building's card as the app shows it on a click: photo, name, level, rank and numbers (real, from the building). */
const Profile = z.object({
  type: z.literal("profile"),
  login: z.string(),
  from: Anchor,
  to: Anchor.optional(),
});

/** An Instagram comment as the app draws it in dark mode, typed a part at a time (each @ lit), the scene dimmed behind it. */
const Comment = z.object({
  type: z.literal("comment"),
  from: Anchor,
  to: Anchor.optional(),
  /** The commenter as Instagram shows them. */
  handle: z.string(),
  /** What gets typed: each part starts typing at its moment, after the ones before. */
  parts: z.array(z.object({ at: Anchor, text: z.string().min(1) })).min(1),
});

/** A GitHub contribution graph (an illustration, no numbers), today's square lighting up at `at`; the scene dimmed behind it. */
const Contrib = z.object({
  type: z.literal("contrib"),
  from: Anchor,
  to: Anchor.optional(),
  at: Anchor,
});

/** A place card (the reference's): a dev's photo and login, their office, their number big, and a line on the race; the scene dimmed behind it. */
const Place = z.object({
  type: z.literal("place"),
  from: Anchor,
  to: Anchor.optional(),
  login: z.string(),
  /** Their office as a crown over the photo. */
  crown: z.boolean().default(false),
  /** The big number, e.g. "45 pontos". */
  value: z.string(),

});

/** A points table, a row at a time as each is said: the real thing (an Instagram comment, a GitHub row, an @mention) and its points big. `label` is for the studio, not shown. The scene dimmed behind it. */
const Points = z.object({
  type: z.literal("points"),
  from: Anchor,
  to: Anchor.optional(),
  rows: z
    .array(z.object({ at: Anchor, icon: z.enum(["comment", "code", "friend"]), value: z.string(), label: z.string() }))
    .min(1)
    .max(4),
});

/**
 * A phone in the middle of the frame, the scene dimmed behind it, its screen
 * changing at each screen's moment: Instagram's comments with the keyboard up
 * (typing `parts`, sent at `send`), a GitHub contribution graph (today's
 * square lighting at `send`), or this reel playing on Instagram (`image` as
 * its video, the comment button tapped at `send`); `points` pop beside it. The way to show an
 * action that happens off the map.
 */
const Phone = z.object({
  type: z.literal("phone"),
  from: Anchor,
  to: Anchor.optional(),
  screens: z
    .array(
      z.object({
        at: Anchor,
        kind: z.enum(["comment", "graph", "reel"]),
        parts: z.array(z.object({ at: Anchor, text: z.string().min(1) })).default([]),
        send: Anchor.optional(),
        points: z.object({ at: Anchor, value: z.string() }).optional(),
        /** A comments screen's comments already there (sent before), over the one being typed. */
        posted: z.array(z.string()).default([]),
        /** A reel screen's video: an image under REELS_HOME (a frame of this reel, so it reads as this one). */
        image: z.string().optional(),
      }),
    )
    .min(1),
});

/** One way to score, alone and big: the app's own icon for it (the "How to score" panel's) on its tile, the points under it. */
const Score = z.object({
  type: z.literal("score"),
  from: Anchor,
  to: Anchor.optional(),
  icon: z.enum(["comment", "code", "friend", "story", "join"]),
  value: z.string(),
});

/** GitHub photos pinned on the map over each state's capital (a world with a map), popping in one after another from the north. */
const Pins = z.object({
  type: z.literal("pins"),
  from: Anchor,
  to: Anchor.optional(),
  rows: z.array(z.object({ uf: z.string().length(2), login: z.string() })).min(1),
  /** Seconds between one pin and the next. */
  stagger: z.number().nonnegative().default(0.04),
});

/**
 * A full-frame card on the channel's dotted dark background that draws what the voice is saying
 * (how to score, a rule): its lines type in, a number in a `*block*` counts up from 0 over the
 * card, and under them one drawing in the channel's style:
 * - map: Brazil in dots, lighting up with the count;
 * - comment: the ink speech bubble, `text` typed into it from `at`;
 * - graph: a GitHub contribution graph, today's square lighting at `at`.
 * What happens on Instagram (following, a reel playing) stays in Instagram's own UI (the phone, the follow card).
 * `points` pops a green block (`+5`) at its moment. An optional image goes under the lines (under
 * REELS_HOME). It cuts in and out; the captions and the headline step aside while it's up.
 */
const Card = z.object({
  type: z.literal("card"),
  from: Anchor,
  to: Anchor.optional(),
  lines: z.array(HeaderLine).min(1),
  draw: z
    .discriminatedUnion("kind", [
      z.object({ kind: z.literal("map") }),
      z.object({ kind: z.literal("comment"), text: z.string().min(1), at: Anchor }),
      z.object({ kind: z.literal("graph"), at: Anchor }),
    ])
    .optional(),
  points: z.object({ at: Anchor, value: z.string().min(1) }).optional(),
  /** What a number in a block does: counts up over the card, blinks in hard steps (a candidate's number), or holds still. */
  numbers: z.enum(["count", "blink", "still"]).default("count"),
  /** Its words type in; off, they're all there from the first frame (a hook that has to read at once). */
  typed: z.boolean().default(true),
  image: z.string().optional(),
});

/**
 * A green pixel arrow pointing at the viewer's own comment button (bottom right of Instagram's
 * Reels screen), the scene dimmed, `label` in the green block: "comment here" made literal.
 */
const Pointer = z.object({
  type: z.literal("pointer"),
  from: Anchor,
  to: Anchor.optional(),
  label: z.string().min(1),
  /** What it points at on the viewer's Reels screen: the comment button, or the account's name (the profile, the link in bio). */
  target: z.enum(["comment", "profile"]).default("comment"),
});

/**
 * Real source code scrolling fast in a terminal window (the feature being built), then `commit`
 * typed on the bottom line behind a green `>`. `lines` are copied from the repo, never made up.
 */
const Code = z.object({
  type: z.literal("code"),
  from: Anchor,
  to: Anchor.optional(),
  file: z.string(),
  lines: z.array(z.string()).min(5),
  commit: z.string().optional(),
  /** When the commit starts typing. */
  commitAt: Anchor.optional(),
});

/**
 * The game's voting machine filling the frame (its look, from the Vote panel): the keypad types
 * `number` one key at a time from `typeAt`, the candidate's photo and login come up on the screen
 * with the last digit, and CONFIRMA at `confirmAt` turns the screen to FIM.
 */
const Urna = z.object({
  type: z.literal("urna"),
  from: Anchor,
  to: Anchor.optional(),
  /** Its two digits ("53", "01"), or a {facts.x} that fills to them. */
  number: z.string().min(1),
  login: z.string(),
  avatar: z.string(),
  uf: z.string().nullable().optional(),
  typeAt: Anchor,
  confirmAt: Anchor.optional(),
  /** A terminal plate over the machine. */
  label: z.string().optional(),
  /** It rises into the frame from below in hard steps, instead of cutting in. */
  enter: z.boolean().default(false),
  /** A green block (`+10`) that drops onto the machine at its moment. */
  points: z.object({ at: Anchor, value: z.string().min(1) }).optional(),
});

/**
 * Campaign flyers (santinhos) raining over the dimmed world from the first frame, each a
 * candidate's photo, ballot number and login, falling and turning at its own pace; at `slamAt`
 * `label` slams into the middle on a big terminal plate (or, with `hero`, that candidate's flyer).
 */
const Santinhos = z.object({
  type: z.literal("santinhos"),
  from: Anchor,
  to: Anchor.optional(),
  cards: z.array(z.object({ number: z.string(), login: z.string(), avatar: z.string() })).min(3),
  hero: z.string().optional(),
  slamAt: Anchor,
  label: z.string().optional(),
});

/**
 * The candidates' flyers on a conveyor over the dimmed world: it runs fast from `from`, brakes onto
 * each stop's flyer (a ballot number) at its moment, and whips past all the others to the next.
 * The flyer in the middle reads bigger.
 */
const Carousel = z.object({
  type: z.literal("carousel"),
  from: Anchor,
  to: Anchor.optional(),
  cards: z.array(z.object({ number: z.string(), login: z.string(), avatar: z.string() })).min(3),
  stops: z.array(z.object({ at: Anchor, number: z.string() })).min(1),
});

/**
 * A vote count raced: each vote in `events` (ballot numbers, in the order they really came in) lands
 * in turn over the first part of the overlay, the bars growing and the rows swapping places when one
 * passes another, then the final count holds. `label` goes on a terminal plate over it.
 */
const Race = z.object({
  type: z.literal("race"),
  from: Anchor,
  to: Anchor.optional(),
  rows: z.array(z.object({ number: z.string(), login: z.string(), avatar: z.string() })).min(2).max(5),
  events: z.array(z.string()).min(1),
  label: z.string().optional(),
});

export const Overlay = z.discriminatedUnion("type", [Balloon, Bars, Roster, Counter, Poster, Follow, Profile, Comment, Contrib, Pins, Place, Points, Score, Phone, Card, Pointer, Urna, Santinhos, Carousel, Race, Code]);
export type Overlay = z.infer<typeof Overlay>;

const BrasilWorld = z.object({
  type: z.literal("brasil"),
  /** The map as it stood then (ISO); default: now. */
  asOf: z.string().optional(),
  /** "none" films the empty map (Dia 1). */
  residents: z.enum(["live", "none"]).default("live"),
  /** A building that isn't on the map yet, put on the first lot of its state's capital (lot-rise raises it). */
  example: z.object({ login: z.string(), uf: z.string().length(2) }).optional(),
  /** A film's extra fill light (2: Sam's pick for the map, 2026-10-19). */
  exposure: z.number().positive().max(6).default(2),
});

const BayWorld = z.object({
  type: z.literal("bay"),
  /** A dev left out of the city: their lot stands empty until the "lot" scene raises their building. */
  lot: z.string().optional(),
  /** The time of day the sky and the light are drawn at (0–24); 20.5 is the city's night. */
  skyHour: z.number().min(0).max(24).default(20.5),
  /** How much more light the film lets into the night: the ambient fill times this (1: as the city is; 2, Sam's pick 2026-10-19). */
  exposure: z.number().positive().max(6).default(2),
});

/** One or more towns (a canvas each, cut between): stage name → town slug. Scenes say which with params.town. */
const TownsWorld = z.object({
  type: z.literal("towns"),
  towns: z.record(z.string().regex(/^[a-z]+$/), z.string()),
  /** A film's extra fill light (the towns read well as they are: 1). */
  exposure: z.number().positive().max(6).default(1),
});

export const World = z.discriminatedUnion("type", [BrasilWorld, BayWorld, TownsWorld]);
export type World = z.infer<typeof World>;

export const Scene = z.object({
  scene: z.string().min(1),
  at: Anchor,
  /** Shown in the studio's scene list; defaults to the scene's kind. */
  name: z.string().optional(),
  params: z.record(z.string(), z.unknown()).default({}),
});
export type Scene = z.infer<typeof Scene>;

const Header = z.object({
  rule: z.array(HeaderLine).min(1),
  cta: z.array(HeaderLine).min(1),
  ctaAt: Anchor,
});
const Headline = z.array(z.object({ at: Anchor, lines: z.array(HeaderLine) })).min(1);

export const Line = z.object({
  show: z.string().min(1),
  say: z.string().min(1).optional(),
  /** Seconds on the film's clock: the line is voiced alone at this time (a pause before it). */
  at: z.number().nonnegative().optional(),
  /** Said but not captioned (e.g. while a poster says it). */
  hidden: z.boolean().optional(),
});

/**
 * A trial that is the day's main with one thing changed, so the trials of a day differ only in what's
 * being tested: the spoken hook (its first lines), the hook's text up top, the opening shot, or the
 * layout (fixed header vs headline beats).
 */
export const Variation = z.discriminatedUnion("test", [
  /** Replaces the main's first lines (as many as given). */
  z.object({ test: z.literal("voice"), lines: z.array(Line).min(1) }),
  /** Replaces the first headline beat's lines, or the header's rule. */
  z.object({ test: z.literal("text"), lines: z.array(HeaderLine).min(1) }),
  /** Replaces the opening scene (it still starts when the main's does). */
  z.object({ test: z.literal("shot"), scene: z.object({ scene: z.string().min(1), name: z.string().optional(), params: z.record(z.string(), z.unknown()).default({}) }) }),
  /** Swaps the main's header and headline for these (one of them, or both). */
  z.object({ test: z.literal("layout"), header: Header.optional(), headline: Headline.optional() }),
]);
export type Variation = z.infer<typeof Variation>;

export const ReelSpec = z.object({
  id: z.string().regex(/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/),
  kind: z.enum(["main", "trial"]),
  preset: z.string().optional(),
  /**
   * How the words sit on the picture: "outline", white pixel type with a black outline over the scene;
   * "plates", the channel's own look (samuelrizzondev's kit), each line on a dark plate with a hard
   * shadow, the headline typed behind a green `>` like its Terminal piece.
   */
  look: z.enum(["outline", "plates"]).default("outline"),
  /** A trial written as a variation of another reel of the day: what it changes (set when the spec is read). */
  variation: Variation.optional(),
  world: World,
  /** Seconds of picture before the narrator's first word (single-take voice). */
  voiceAt: z.number().nonnegative().default(0.4),
  /** Seconds after the last word. */
  tail: z.number().nonnegative().default(1.4),
  /** The music bed; left out, the config's rotation picks one. */
  bed: z.string().optional(),
  bedVolume: z.number().positive().max(1).default(0.26),
  /** The rule up top that turns into the call to action; a reel without one (a story told on its own) leaves it out. */
  header: Header.optional(),
  /**
   * A big headline up top that carries the story instead of the fixed header: each beat shows from
   * its moment until the next one's, and the captions go small under it; a beat with no lines clears it
   * (a card carries that beat). Anchors are looked for in order.
   */
  headline: Headline.optional(),
  /** Extra sound effects (a scene's own, like a fall's thud, come with it). */
  sounds: z.array(z.object({ at: Anchor, src: z.string(), gain: z.number().default(1), rate: z.number().optional() })).default([]),
  lines: z.array(Line).min(1),
  scenes: z.array(Scene).min(1),
  overlays: z.array(Overlay).default([]),
  /** Every number and login on screen comes from here, as {facts.path}. */
  facts: z.record(z.string(), z.unknown()).default({}),
  /** The loop the reel closes, one line each (shown over the script in the studio). */
  loop: z
    .object({ comment: z.string(), change: z.string(), who: z.string(), now: z.string() })
    .optional(),
  post: z
    .object({
      caption: z.string().default(""),
      /** The trial's grid frame (no cover). */
      thumbAt: Anchor.optional(),
      /** Add to /admin/brasil's watched reels: only when the CTA is `user UF`. */
      watch: z.boolean().default(false),
      /** The main reel's grid cover: the image prompt in the channel's cover style (see covers.json), approved with the script. */
      cover: z.object({ prompt: z.string().min(1) }).optional(),
    })
    .default({ caption: "", watch: false }),
});
export type ReelSpec = z.infer<typeof ReelSpec>;

/** "{facts.leader.PE}" → the value at that path; a missing fact throws. */
export function fill(text: string, facts: Record<string, unknown>): string {
  return text.replace(/\{facts\.([\w.]+)\}/g, (_, path: string) => {
    const v = path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), facts);
    if (v === undefined || v === null) throw new Error(`No fact "${path}".`);
    return typeof v === "number" ? v.toLocaleString("pt-BR") : String(v);
  });
}

/** Fills every {facts.x} in the spec's strings (header, lines, overlays, params). */
export function filled(spec: ReelSpec): ReelSpec {
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return fill(v, spec.facts);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === "facts" ? x : walk(x)]));
    return v;
  };
  return walk(spec) as ReelSpec;
}

/** The kit's takes are rendered from specs filed on this day: they're not reels, so the board and the worker skip it. */
export const KIT_DAY = "2000-01-01";

/** A day folder of reels (not the kit's, not a stray file). */
export const isReelDay = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d !== KIT_DAY;

/** "2026-10-19-main" → its folder under REELS_HOME. */
export function specDir(id: string): { date: string; slot: string; rel: string } {
  const date = id.slice(0, 10);
  const slot = id.slice(11);
  return { date, slot, rel: `days/${date}/${slot}` };
}

/** A trial's spec.json written as a variation: the reel it varies (a slot of the same day), and the one change. */
export const TrialFile = z.object({
  id: z.string().regex(/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/),
  kind: z.literal("trial"),
  from: z.string().default("main"),
  variation: Variation,
  /** The rotation's bed unless named (a day's varied trials share one, apart from the main's). */
  bed: z.string().optional(),
  post: z.object({ caption: z.string().optional(), thumbAt: Anchor.optional() }).default({}),
});
export type TrialFile = z.infer<typeof TrialFile>;

const wordsIn = (l: z.infer<typeof Line>) => (l.say ?? l.show.replace(/\*/g, "")).trim().split(/\s+/).filter(Boolean).length;

/** Shifts "#n" anchors at or past word `from` by `by` words, anywhere in a value. */
function shiftWords<T>(v: T, from: number, by: number): T {
  if (!by) return v;
  const walk = (x: unknown): unknown => {
    if (typeof x === "string") {
      const m = /^#(\d+)((?:[+-]\d+(?:\.\d+)?)?)$/.exec(x.trim());
      return m && Number(m[1]) >= from ? `#${Number(m[1]) + by}${m[2]}` : x;
    }
    if (Array.isArray(x)) return x.map(walk);
    if (x && typeof x === "object") return Object.fromEntries(Object.entries(x).map(([k, y]) => [k, walk(y)]));
    return x;
  };
  return walk(v) as T;
}

/** The trial a variation file makes of its base reel (a full spec, parsed). */
export function applyVariation(base: ReelSpec, trial: TrialFile): ReelSpec {
  if (base.variation) throw new Error(`${trial.id} varies ${base.id}, which is itself a variation.`);
  const v = trial.variation;
  let spec: ReelSpec = { ...base };
  if (v.test === "voice") {
    if (v.lines.length > base.lines.length) throw new Error(`The voice variation replaces ${v.lines.length} lines; ${base.id} has ${base.lines.length}.`);
    const old = base.lines.slice(0, v.lines.length).reduce((t, l) => t + wordsIn(l), 0);
    const now = v.lines.reduce((t, l) => t + wordsIn(l), 0);
    spec = { ...shiftWords({ ...base, lines: [] }, old, now - old), lines: [...v.lines, ...base.lines.slice(v.lines.length)] };
  } else if (v.test === "text") {
    if (base.headline) spec.headline = [{ ...base.headline[0], lines: v.lines }, ...base.headline.slice(1)];
    else if (base.header) spec.header = { ...base.header, rule: v.lines };
    else throw new Error(`${base.id} has no header or headline for a text variation to change.`);
  } else if (v.test === "shot") {
    spec.scenes = [{ ...v.scene, at: base.scenes[0].at }, ...base.scenes.slice(1)];
  } else {
    if (!v.header && !v.headline) throw new Error("A layout variation gives a header, a headline or both.");
    spec.header = v.header;
    spec.headline = v.headline;
  }
  return ReelSpec.parse({
    ...spec,
    id: trial.id,
    kind: "trial",
    variation: v,
    bed: trial.bed,
    post: { ...base.post, caption: trial.post.caption ?? base.post.caption, thumbAt: trial.post.thumbAt ?? base.post.thumbAt, cover: undefined },
  });
}

/** A spec.json's reel: a full spec, or a variation applied to the reel it names (read by `loadBase`, a slot of the same day). */
export function parseSpec(json: unknown, loadBase: (slot: string) => unknown): ReelSpec {
  if (json && typeof json === "object" && "variation" in json && !("lines" in json)) {
    const trial = TrialFile.parse(json);
    return applyVariation(ReelSpec.parse(loadBase(trial.from)), trial);
  }
  return ReelSpec.parse(json);
}
