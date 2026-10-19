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
  size: z.enum(["big", "small"]),
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
  /** The GitHub login whose photo is the profile picture. */
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

export const Overlay = z.discriminatedUnion("type", [Balloon, Bars, Roster, Counter, Poster, Follow, Profile]);
export type Overlay = z.infer<typeof Overlay>;

const BrasilWorld = z.object({
  type: z.literal("brasil"),
  /** The map as it stood then (ISO); default: now. */
  asOf: z.string().optional(),
  /** "none" films the empty map (Dia 1). */
  residents: z.enum(["live", "none"]).default("live"),
  /** A building that isn't on the map yet, put on the first lot of its state's capital (lot-rise raises it). */
  example: z.object({ login: z.string(), uf: z.string().length(2) }).optional(),
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

export const Line = z.object({
  show: z.string().min(1),
  say: z.string().min(1).optional(),
  /** Seconds on the film's clock: the line is voiced alone at this time (a pause before it). */
  at: z.number().nonnegative().optional(),
  /** Said but not captioned (e.g. while a poster says it). */
  hidden: z.boolean().optional(),
});

export const ReelSpec = z.object({
  id: z.string().regex(/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/),
  kind: z.enum(["main", "trial"]),
  preset: z.string().optional(),
  world: World,
  /** Seconds of picture before the narrator's first word (single-take voice). */
  voiceAt: z.number().nonnegative().default(0.4),
  /** Seconds after the last word. */
  tail: z.number().nonnegative().default(1.4),
  bed: z.string().default("lofi-up-1.mp3"),
  bedVolume: z.number().positive().max(1).default(0.26),
  /** The rule up top that turns into the call to action; a reel without one (a story told on its own) leaves it out. */
  header: z
    .object({
      rule: z.array(HeaderLine).min(1),
      cta: z.array(HeaderLine).min(1),
      ctaAt: Anchor,
    })
    .optional(),
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

/** "2026-10-19-main" → its folder under REELS_HOME. */
export function specDir(id: string): { date: string; slot: string; rel: string } {
  const date = id.slice(0, 10);
  const slot = id.slice(11);
  return { date, slot, rel: `days/${date}/${slot}` };
}
