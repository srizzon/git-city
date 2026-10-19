// ─── Reel film ──────────────────────────────────────────────
// A reel spec (./spec) and its narration's word timings → the trailer kit's
// Film, with every anchor turned into seconds: the cuts, the caption lines,
// when the header turns into the call to action, and the overlays' moments.
// Pure; the studio and the validator both build it.

import { buildShots, frameOf, scenesOf, type Film, type Shot, type SoundCue } from "@trailer-kit/film";
import { anchorAt, captionLines, takesOf, type CaptionLine, type Word } from "@trailer-kit/narration";
import type { ReelSpec } from "./spec";

/** Which canvas a cut plays on: "world", or a town's stage name in a towns reel. */
export type Stage = string;

export interface ReelCut {
  name: string;
  kind: string;
  stage: Stage;
  from: number;
  to: number;
  params: Record<string, unknown>;
}

export interface ReelBalloon {
  target: "example" | { login: string };
  from: number;
  to: number;
  plate: string | null;
  badges: { kind: string; at: number; sub: string }[];
}

/** A panel between the header and the captions: a ranking as bars, or a list of people a page at a time. */
export type ReelPanel =
  | { kind: "bars"; from: number; to: number; title: string | null; rows: { label: string; value: number | string; lit: boolean }[] }
  | { kind: "roster"; from: number; to: number; title: string | null; rows: { tag: string; login: string; lit: boolean }[]; perPage: number }
  | { kind: "counter"; from: number; reach: number; to: number; value: number; label: string }
  | { kind: "poster"; from: number; to: number; title: string; login: string; when: string; where: string }
  | { kind: "profile"; from: number; to: number; login: string }
  | {
      kind: "follow";
      from: number;
      to: number;
      done: number;
      handle: string;
      name: string;
      avatar: string;
      bio: string[];
      link: string;
      posts: string;
      followers: string;
      following: string;
    };

/** A scene's own sound: a thud this long into the cut. */
const SCENE_SOUNDS: Record<string, { at: number; gain: number; rate?: number }> = {
  collapse: { at: 0.15, gain: 1, rate: 0.8 },
  "montage-hit": { at: 0.05, gain: 0.7 },
};
const THUD = "/sounds/drive/impact.ogg";

export interface Reel {
  film: Film<Stage>;
  shots: Shot<Stage, string>[];
  length: number;
  cuts: ReelCut[];
  lines: CaptionLine[];
  ctaAt: number;
  balloons: ReelBalloon[];
  panels: ReelPanel[];
}

/** The film of a filled spec (./spec `filled`), its words on the film's clock, and its mixed sound's URL. */
export function reelOf(spec: ReelSpec, words: readonly Word[], song: string | null): Reel {
  const length = words[words.length - 1][2] + spec.tail;
  // Each scene's word is looked for from the previous cut on, so a repeated word picks the right one.
  const froms: number[] = [];
  spec.scenes.forEach((s, i) => froms.push(i === 0 ? anchorAt(words, s.at) : anchorAt(words, s.at, froms[i - 1])));
  if (froms[0] !== 0) throw new Error(`The first scene must start at 0, not ${froms[0]}.`);
  froms.forEach((f, i) => {
    if (i && f <= froms[i - 1]) throw new Error(`Scene ${i + 1} (${spec.scenes[i].scene}) starts before the one before it.`);
  });
  // A scene's own moments (a building's rise: params.from / params.to) are anchors too, looked for from its cut on.
  const moments = (params: Record<string, unknown>, after: number) =>
    Object.fromEntries(
      Object.entries(params).map(([k, v]) => [k, (k === "from" || k === "to") && (typeof v === "string" || typeof v === "number") ? anchorAt(words, v, after) : v]),
    );
  const stages = spec.world.type === "towns" ? Object.keys(spec.world.towns) : ["world"];
  const cuts: ReelCut[] = spec.scenes.map((s, i) => ({
    name: s.name ?? s.scene,
    kind: s.scene,
    stage: typeof s.params.town === "string" && stages.includes(s.params.town) ? s.params.town : stages[0],
    from: froms[i],
    to: froms[i + 1] ?? length,
    params: moments(s.params, froms[i]),
  }));
  const takes = takesOf(
    cuts.map((c) => ({ name: c.name, kind: c.kind, stage: c.stage, from: c.from })),
    length,
  );
  const shots = buildShots<Stage, string>(takes, [stages[0], stages[1] ?? stages[0]]);
  // Lines voiced one at a time (with pauses between) hide their caption in the pause.
  const paused = spec.lines.some((l) => l.at !== undefined);
  const lines = captionLines(spec.lines, words, length, paused ? 0.7 : undefined);
  const balloons: ReelBalloon[] = spec.overlays
    .flatMap((o) => (o.type === "balloon" ? [o] : []))
    .map((o) => {
      const from = anchorAt(words, o.from);
      return {
        target: o.target,
        from,
        to: o.to === undefined ? length : anchorAt(words, o.to, from),
        plate: o.plate ?? null,
        badges: o.badges.map((b) => ({ kind: b.kind, at: anchorAt(words, b.at, from), sub: b.sub })),
      };
    });
  const panels: ReelPanel[] = spec.overlays.flatMap((o): ReelPanel[] => {
    if (o.type === "balloon") return [];
    const from = anchorAt(words, o.from);
    if (o.type === "counter") {
      const value = typeof o.value === "number" ? o.value : Number(String(o.value).replace(/\D/g, ""));
      return [{ kind: "counter", from, reach: anchorAt(words, o.reach, from), to: anchorAt(words, o.to, from), value, label: o.label }];
    }
    if (o.type === "follow") {
      const str = (v: number | string) => (typeof v === "number" ? v.toLocaleString("pt-BR") : v);
      return [
        {
          kind: "follow",
          from,
          to: length,
          done: anchorAt(words, o.done, from),
          handle: o.handle,
          name: o.name,
          avatar: o.avatar,
          bio: o.bio,
          link: o.link,
          posts: str(o.posts),
          followers: str(o.followers),
          following: str(o.following),
        },
      ];
    }
    const to = o.to === undefined ? length : anchorAt(words, o.to, from);
    if (o.type === "poster") return [{ kind: "poster", from, to, title: o.title, login: o.login, when: o.when, where: o.where }];
    if (o.type === "profile") return [{ kind: "profile", from, to, login: o.login }];
    if (o.type === "bars") return [{ kind: "bars", from, to, title: o.title ?? null, rows: o.rows.map((r) => ({ ...r, lit: !!r.lit })) }];
    return [{ kind: "roster", from, to, title: o.title ?? null, rows: o.rows.map((r) => ({ ...r, lit: !!r.lit })), perPage: o.perPage }];
  });
  const sounds: SoundCue[] = [
    ...cuts.flatMap((c) => (SCENE_SOUNDS[c.kind] ? [{ beat: c.from + SCENE_SOUNDS[c.kind].at, src: THUD, gain: SCENE_SOUNDS[c.kind].gain, rate: SCENE_SOUNDS[c.kind].rate }] : [])),
    ...spec.sounds.map((x) => ({ beat: anchorAt(words, x.at), src: x.src, gain: x.gain, rate: x.rate })),
  ];
  const film: Film<Stage> = {
    beat: 1,
    length,
    scenes: scenesOf(shots),
    // The narration and the bed are one mixed file; the scenes' thuds and the spec's effects play over it.
    sounds,
    titles: [],
    flashes: [],
    ...(song ? { song: { src: song, offset: 0 } } : {}),
    frameAt: (beat) => frameOf(shots, beat),
  };
  return { film, shots, length, cuts, lines, ctaAt: spec.header ? anchorAt(words, spec.header.ctaAt) : Infinity, balloons, panels };
}

/** The cut under way at `t` seconds, and how far into it (0–1). */
export function cutAt(reel: Reel, t: number): { cut: ReelCut; index: number; u: number; t: number } {
  const i = Math.max(0, reel.cuts.findLastIndex((c) => t >= c.from));
  const cut = reel.cuts[i];
  const local = Math.max(0, t - cut.from);
  return { cut, index: i, u: Math.min(1, local / Math.max(1e-6, cut.to - cut.from)), t: local };
}
