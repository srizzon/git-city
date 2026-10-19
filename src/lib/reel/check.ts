// ─── Reel checks ────────────────────────────────────────────
// The git-city-reels rules a spec has to pass before any voice is spent
// (text), once its voice exists (timing), and once its draft is rendered
// (picture: the boxes the studio reports). A "fail" blocks the pipeline; a
// "warn" shows in the studio for Sam to judge. Pure.

import { bare, type Word } from "@trailer-kit/narration";
import { reelOf } from "./film";
import { READ_HOLD, TYPE_CPS } from "./timing";
import { filled, type ReelSpec } from "./spec";

export interface Issue {
  level: "fail" | "warn";
  rule: string;
  message: string;
}

/** Words the audience shouldn't hear: "teu/tua" (always seu/sua) and gamer jargon. */
const BANNED = ["teu", "tua", "teus", "tuas", "raid", "raidar", "pvp", "smash", "xp", "loot"];

const words = (text: string) => text.split(/\s+/).filter(Boolean);
const numbersIn = (text: string) => text.match(/\d+(?:[.,]\d+)*/g) ?? [];

/** Every value in the facts, as text (numbers both plain and pt-BR formatted). */
function factValues(facts: unknown, out = new Set<string>()): Set<string> {
  if (typeof facts === "number") {
    out.add(String(facts));
    out.add(facts.toLocaleString("pt-BR"));
  } else if (typeof facts === "string") out.add(facts.toLowerCase());
  else if (Array.isArray(facts)) facts.forEach((v) => factValues(v, out));
  else if (facts && typeof facts === "object") Object.values(facts).forEach((v) => factValues(v, out));
  return out;
}

/** Everything the viewer reads on screen. */
function onScreen(spec: ReelSpec): string[] {
  return [
    ...(spec.header ? [...spec.header.rule, ...spec.header.cta].map((l) => l.text) : []),
    ...(spec.headline ?? []).flatMap((h) => h.lines.map((l) => l.text)),
    ...spec.lines.map((l) => l.show),
    ...spec.overlays.flatMap((o) =>
      o.type === "balloon"
        ? [o.plate ?? "", ...o.badges.map((b) => b.sub)]
        : o.type === "bars"
          ? [o.title ?? "", ...o.rows.flatMap((r) => [r.label, String(r.value)])]
          : o.type === "roster"
            ? [o.title ?? "", ...o.rows.map((r) => r.tag)]
            : o.type === "counter"
              ? [String(o.value), o.label]
              : o.type === "poster"
                ? [o.title, o.when, o.where]
                : o.type === "profile" || o.type === "contrib"
                  ? []
                : o.type === "comment"
                  ? [o.handle, ...o.parts.map((x) => x.text)]
                : o.type === "pins"
                  ? []
                : o.type === "place"
                  ? [o.value]
                : o.type === "score"
                  ? [o.value]
                : o.type === "race"
                  ? [...o.rows.map((r) => r.number), ...(o.label ? [o.label] : [])]
                : o.type === "carousel"
                  ? o.cards.map((c) => c.number)
                : o.type === "santinhos"
                  ? [...o.cards.map((c) => c.number), ...(o.label ? [o.label] : [])]
                : o.type === "urna"
                  ? [o.number, ...(o.label ? [o.label] : []), ...(o.points ? [o.points.value] : [])]
                : o.type === "pointer"
                  ? [o.label]
                : o.type === "card"
                  ? [...o.lines.map((l) => l.text), ...(o.draw?.kind === "comment" ? [o.draw.text] : []), ...(o.points ? [o.points.value] : [])]
                : o.type === "phone"
                  ? o.screens.flatMap((x) => [...x.posted, ...x.parts.map((y) => y.text), x.points?.value ?? ""])
                : o.type === "points"
                  ? o.rows.flatMap((r) => [r.value, r.label])
                : // The account's own profile card: its bio is the owner's, not the day's data.
                  [],
    ),
  ].map((t) => t.replace(/\*/g, ""));
}

const UNITS = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "catorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const TENS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const HUNDREDS = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

/** A whole number in Portuguese words, as the narrator says it ("mil seiscentos e sessenta e cinco"). */
export function extenso(n: number): string {
  if (n < 20) return UNITS[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ` e ${UNITS[n % 10]}` : "");
  if (n === 100) return "cem";
  if (n < 1000) return HUNDREDS[Math.floor(n / 100)] + (n % 100 ? ` e ${extenso(n % 100)}` : "");
  if (n < 1_000_000) {
    const k = Math.floor(n / 1000);
    const r = n % 1000;
    const head = k === 1 ? "mil" : `${extenso(k)} mil`;
    return r === 0 ? head : `${head}${r < 100 || r % 100 === 0 ? " e " : " "}${extenso(r)}`;
  }
  return String(n);
}

/** A shown number ("1.665", "64") said the way the voice says it, or null when it isn't a plain count. */
const spokenNumber = (shown: string): string | null => {
  const n = Number(shown.replace(/\./g, ""));
  return /^\d{1,3}(\.\d{3})*$|^\d+$/.test(shown) && Number.isFinite(n) ? extenso(n) : null;
};

const hookOf = (spec: ReelSpec) => bare(spec.lines[0].show.replace(/\*/g, ""));

export interface TextContext {
  /** The scenes the spec's world plays. */
  scenes: readonly string[];
  /** First lines of every reel made before (log.md and older specs), to never reuse a hook. */
  priorHooks: readonly string[];
  /** The same day's main reel, for a trial (it must differ in hook, opening, bed). */
  main?: ReelSpec | null;
  /** Instagram handles a caption may tag. */
  verifiedHandles: readonly string[];
}

/** Rules on the text: before any voice is made. */
export function checkText(raw: ReelSpec, ctx: TextContext): Issue[] {
  const out: Issue[] = [];
  const fail = (rule: string, message: string) => out.push({ level: "fail", rule, message });
  const warn = (rule: string, message: string) => out.push({ level: "warn", rule, message });
  let spec: ReelSpec;
  try {
    spec = filled(raw);
  } catch (e) {
    fail("facts", (e as Error).message);
    return out;
  }

  const said = spec.lines.flatMap((l) => [l.show, l.say ?? ""]);
  for (const text of [...onScreen(spec), ...said, spec.post.caption]) {
    for (const w of words(text)) if (BANNED.includes(bare(w))) fail("words", `"${w}" (say seu/sua; no gamer jargon): "${text}"`);
  }

  spec.lines.forEach((l, i) => {
    const n = words(l.show).length;
    if (n > 4) warn("captions", `Line ${i + 1} shows ${n} words (2–4 read best): "${l.show}"`);
    if (l.say && /\d/.test(l.say)) fail("voice", `Line ${i + 1} says digits; spell them out for the voice: "${l.say}"`);
    if (!l.say && /\d/.test(l.show)) fail("voice", `Line ${i + 1} shows digits and has no "say": the voice would read them as digits.`);
  });

  // A number on a caption line is said as that number (a script that shows 25 and says "vinte e sete" is wrong).
  spec.lines.forEach((l, i) => {
    if (!l.say) return;
    const said = ` ${bare(l.say.replace(/[-–]/g, " ")).length ? l.say.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim() : ""} `;
    for (const n of numbersIn(l.show.replace(/\*/g, ""))) {
      const words = spokenNumber(n);
      if (words && !said.includes(` ${words} `)) fail("real data", `Line ${i + 1} shows ${n} but says "${l.say}" (${n} is "${words}").`);
    }
  });

  const known = factValues(spec.facts);
  // A login's digits ("erickj3") aren't a number on screen: the facts' words come out before the numbers are read.
  const factWords = [...known].filter((v) => /[a-z]/.test(v) && /\d/.test(v)).sort((x, y) => y.length - x.length);
  for (const text of onScreen(spec)) {
    const plain = factWords.reduce((t, w) => t.split(new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")).join(" "), text);
    for (const n of numbersIn(plain)) if (!known.has(n)) fail("real data", `"${n}" on screen isn't a fact: "${text}"`);
  }
  const logins = spec.overlays.flatMap((o) =>
    o.type === "balloon" ? (o.target === "example" ? [] : [o.target.login]) : o.type === "roster" || o.type === "pins" ? o.rows.map((r) => r.login) : o.type === "poster" || o.type === "profile" || o.type === "place" || o.type === "urna" ? [o.login] : o.type === "santinhos" || o.type === "carousel" ? o.cards.map((c) => c.login) : o.type === "race" ? o.rows.map((r) => r.login) : [],
  );
  for (const login of logins) if (!known.has(login.toLowerCase())) fail("real data", `${login} on screen isn't in the facts.`);

  const first = spec.lines[0].show.replace(/\*/g, "");
  if (words(first).length > 3 && !/^\d/.test(first)) warn("hook", `The first line is ${words(first).length} words: open on a number alone or a provocation.`);
  // A variation that keeps the main's spoken hook shares it on purpose.
  const ownHook = !spec.variation || spec.variation.test === "voice";
  if (ownHook && ctx.priorHooks.map(bare).includes(hookOf(spec))) fail("hook", `The hook "${first}" was used before.`);

  spec.scenes.forEach((s, i) => {
    if (!ctx.scenes.includes(s.scene)) fail("scenes", `"${s.scene}" isn't a scene of the ${spec.world.type} world (${ctx.scenes.join(", ")}).`);
    const prev = spec.scenes[i - 1];
    // A montage repeats its move on purpose.
    if (prev && prev.scene === s.scene && !s.scene.startsWith("montage")) fail("scenes", `"${s.scene}" twice in a row (scenes ${i} and ${i + 1}).`);
  });

  // The call to action: the header's, else the last headline beat and the last comment card (typed out in full).
  // The call to action: the header's, else the last headline beat and the last comment typed (a card or the phone).
  const last = [...spec.overlays].reverse().find((o) => o.type === "comment" || o.type === "phone");
  const typed = !last ? [] : last.type === "comment" ? [last.parts.map((x) => x.text).join("")] : last.screens.flatMap((x) => [...x.posted, x.parts.map((y) => y.text).join("")]);
  const cta = [...(spec.header?.cta ?? spec.headline?.[spec.headline.length - 1].lines ?? []).map((l) => l.text), ...typed];
  if (spec.post.watch && !cta.some((t) => /\bseuuser (?:[A-Z]{2}\b|[A-ZÀ-Ú][a-zà-ú])/.test(t.replace(/\*/g, ""))))
    fail("cta", "A watched reel's call to action must show the parseable `seuuser UF` or `seuuser Cidade`.");
  for (const h of spec.post.caption.match(/@[\w.]+/g) ?? []) {
    if (!ctx.verifiedHandles.includes(h.slice(1).toLowerCase())) fail("caption", `${h} in the caption isn't a verified handle.`);
  }

  // Words on screen add to the voice, never repeat it (Sam, 2026-10-19: "nunca ter o mesmo texto falado escrito na tela"):
  // a title, card, plate or label that the narration says word for word fails. Captions are the voice by design.
  const norm = (x: string) => ` ${x.toLowerCase().replace(/\*/g, "").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim()} `;
  const spoken = norm(spec.lines.map((l) => l.say ?? l.show).join(" "));
  const titles = [
    ...(spec.header ? [...spec.header.rule, ...spec.header.cta].map((l) => l.text) : []),
    ...(spec.headline ?? []).flatMap((h) => h.lines.map((l) => l.text)),
    ...spec.overlays.flatMap((o) => (o.type === "card" ? [o.lines.map((l) => l.text).join(" ")] : o.type === "santinhos" || o.type === "urna" || o.type === "pointer" || o.type === "race" ? [o.label ?? ""] : [])),
  ];
  for (const title of titles) {
    const t = norm(title);
    if (words(t).length >= 3 && spoken.includes(t)) fail("echo", `"${title.replace(/\*/g, "")}" on screen is what the voice says: show something it doesn't.`);
  }

  if (spec.kind === "main" && !spec.post.cover) warn("cover", "The main reel has no cover prompt yet (post.cover): it's made after the final, from the prompt approved with the script.");

  if (spec.kind === "trial") {
    const main = ctx.main ? filled(ctx.main) : null;
    if (!main) warn("trial", "No main reel for this day to compare with.");
    else if (spec.variation) {
      // A variation is the main with one change: the change must show.
      const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
      const t = spec.variation.test;
      if (t === "voice" && hookOf(main) === hookOf(spec)) fail("trial", "A voice variation with the main's spoken hook.");
      if (t === "text" && same([main.header?.rule, main.headline?.[0]], [spec.header?.rule, spec.headline?.[0]])) fail("trial", "A text variation with the main's text up top.");
      if (t === "shot" && same(main.scenes[0], spec.scenes[0])) fail("trial", "A shot variation that opens on the main's shot.");
      if (t === "layout" && same([main.header, main.headline], [spec.header, spec.headline])) fail("trial", "A layout variation with the main's layout.");
    } else {
      if (hookOf(main) === hookOf(spec)) fail("trial", "Same hook as the main reel.");
      if (JSON.stringify([main.scenes[0].scene, main.scenes[1]?.scene]) === JSON.stringify([spec.scenes[0].scene, spec.scenes[1]?.scene]))
        fail("trial", "Opens on the same scenes as the main reel.");
      if (main.bed && main.bed === spec.bed) out.push({ level: "warn", rule: "trial", message: "Same music bed as the main reel: fine now and then, but Instagram fingerprints the sound too." });
    }
  }
  return out;
}

/** Rules on the timing: once the voice exists. `mainLength`: the day's main reel's length, for a trial. */
export function checkTimed(raw: ReelSpec, voice: readonly Word[], mainLength?: number): Issue[] {
  const out: Issue[] = [];
  const spec = filled(raw);
  try {
    const reel = reelOf(spec, voice, null);
    // Typed words finish READ_HOLD before their cut, or nobody reads them (Sam, 2026-10-19).
    const typed = [
      ...reel.headline.map((h) => ({ what: h.lines.map((l) => l.text).join(" "), from: h.from, to: h.to })),
      ...reel.panels.flatMap((p) => (p.kind === "santinhos" && p.label && !p.hero ? [{ what: p.label.replace(/ \/ /g, " "), from: p.slamAt, to: p.to }] : [])),
    ];
    for (const x of typed) {
      const done = x.from + x.what.replace(/\*/g, "").length / TYPE_CPS;
      if (x.what && done > x.to - READ_HOLD)
        out.push({ level: "fail", rule: "typing", message: `"${x.what.replace(/\*/g, "")}" finishes typing at ${done.toFixed(1)}s, ${(x.to - done).toFixed(1)}s before its cut (${READ_HOLD}s to read).` });
    }
    const talk = voice[voice.length - 1][2] - voice[0][1];
    if (talk < 15 || talk > 22) out.push({ level: "fail", rule: "length", message: `${talk.toFixed(1)}s of narration (15–22s).` });
    if (voice[0][1] > 2) out.push({ level: "fail", rule: "hook", message: `The first word comes at ${voice[0][1].toFixed(1)}s: the hook must land in the first 2s.` });
    if (spec.kind === "trial" && !spec.variation && mainLength !== undefined && Math.abs(reel.length - mainLength) < 3)
      out.push({ level: "fail", rule: "trial", message: `${reel.length.toFixed(1)}s vs the main's ${mainLength.toFixed(1)}s: a trial differs by 3s or more.` });
  } catch (e) {
    out.push({ level: "fail", rule: "anchors", message: (e as Error).message });
  }
  return out;
}

/** What the export reports per frame: boxes in stage fractions (0–1). */
export interface FrameReport {
  t: number;
  boxes: { name: string; x: number; y: number; w: number; h: number }[];
}

/** Instagram's safe zone (Meta's Reels spec): 14–65% down, centred, at most 72% wide (the captions' own box is 76%, their text stays inside 72%). */
export function checkPicture(frames: readonly FrameReport[]): Issue[] {
  const out = new Map<string, Issue>();
  const fail = (key: string, message: string) => {
    if (!out.has(key)) out.set(key, { level: "fail", rule: "safe zone", message });
  };
  for (const f of frames) {
    for (const b of f.boxes) {
      if (b.w <= 0 || b.h <= 0) continue;
      const at = `${b.name} at ${f.t.toFixed(1)}s`;
      if (b.y < 0.14 - 0.005) fail(`${b.name}-top`, `${at} reaches ${(b.y * 100).toFixed(0)}% from the top (14% minimum).`);
      if (b.y + b.h > 0.65 + 0.005) fail(`${b.name}-bottom`, `${at} reaches ${((b.y + b.h) * 100).toFixed(0)}% down (65% maximum).`);
      if (b.name !== "balloon" && Math.abs(b.x + b.w / 2 - 0.5) > 0.01) fail(`${b.name}-centre`, `${at} is off-centre by ${((b.x + b.w / 2 - 0.5) * 100).toFixed(1)}%.`);
      if (b.x < 0.06 - 0.005 || b.x + b.w > 0.94 + 0.005) fail(`${b.name}-side`, `${at} runs into the 6% side margin.`);
      if (b.w > 0.72 + 0.005) fail(`${b.name}-wide`, `${at} is ${(b.w * 100).toFixed(0)}% wide (72% maximum).`);
    }
    const roof = f.boxes.find((b) => b.name === "roof");
    const captions = f.boxes.find((b) => b.name === "captions");
    const subject = (key: string, message: string) => {
      if (!out.has(key)) out.set(key, { level: "fail", rule: "subject", message });
    };
    if (roof && captions && roof.y > captions.y - 0.01 && roof.y < captions.y + captions.h + 0.01 && roof.x > captions.x && roof.x < captions.x + captions.w)
      subject("roof", `The captions cover the building's roof at ${f.t.toFixed(1)}s.`);
    if (roof && (roof.y < 0.05 || roof.y > 0.95)) subject("roof-off", `The building's roof is off screen at ${f.t.toFixed(1)}s.`);
    // Nothing over the captions: the header, a balloon or a panel running into them.
    if (captions)
      for (const b of f.boxes)
        if (b.name !== "captions" && b.name !== "roof" && b.w > 0 && b.y < captions.y + captions.h && b.y + b.h > captions.y && b.x < captions.x + captions.w && b.x + b.w > captions.x)
          fail(`${b.name}-captions`, `The ${b.name} runs into the captions at ${f.t.toFixed(1)}s.`);
    const balloon = f.boxes.find((b) => b.name === "balloon");
    const header = f.boxes.find((b) => b.name === "header");
    if (balloon && header && balloon.w > 0 && balloon.y < header.y + header.h) fail("balloon-header", `The balloon runs under the header at ${f.t.toFixed(1)}s.`);
  }
  return [...out.values()];
}
