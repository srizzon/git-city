"use client";

import { useEffect, useRef, type CSSProperties, type RefObject } from "react";
import { beatOf, type FilmClock } from "@trailer-kit/clock";
import type { Reel, ReelBalloon, ReelPanel } from "@/lib/reel/film";
import type { ReelSpec } from "@/lib/reel/spec";
import type { CityBuilding } from "@/lib/github";
import { MAP_BOUNDS, onLand } from "@/lib/towns/brasil-geo";
import { levelProgress, rankFromLevel, tierFromLevel, xpForLevel } from "@/lib/xp";
import { CircleUser, Clapperboard, Code2, Heart, House, Instagram, MapPin, MessageCircle, Search, Send, SquarePlus, UserPlus, type LucideIcon } from "lucide-react";

// A reel's words over its world: the rule fixed up top that turns into the
// call to action, each caption line a word at a time as it is spoken
// (keywords lime), white caps with a black outline and no box, and the
// balloon a rig pins over a roof (a plate that bursts into office badges).
// Read from the film's clock every frame, so a scrub shows what records.
//
// Everything sits in Instagram's safe zone (Meta's Reels spec): clear of the
// top 14%, the bottom 35%, 6% at the sides and the bottom-right rail;
// centred on the frame (never off-centre), between 14% and 65% down, at
// most 72% wide.
//
// The "plates" look is the channel's own (samuelrizzondev's video kit): each
// line on a near-black plate with a hard shadow, the headline typed behind a
// green `>` in hard steps, and cards on its dotted dark background.

const FADE = 0.15; // s
/** How dark the scene goes behind a card. */
const DIM = 0.55;

type BadgeKind = "governor" | "senator" | "mayor" | "president" | "founder";

/** Each office's title and pixel icon ([x, y, w, h] on an 8×8 grid). */
const BADGES: Record<BadgeKind, { title: string; color: string; pixels: number[][] }> = {
  // A crown: three points, a band.
  governor: { title: "governador", color: "var(--color-lime)", pixels: [[0, 2, 1, 4], [3, 1, 2, 5], [7, 2, 1, 4], [1, 4, 6, 2], [0, 6, 8, 1]] },
  // A star.
  president: { title: "presidente", color: "var(--color-lime)", pixels: [[3, 0, 2, 2], [0, 2, 8, 2], [1, 4, 6, 1], [1, 5, 2, 2], [5, 5, 2, 2]] },
  // A column with its capital and base.
  senator: { title: "senador", color: "var(--color-cream)", pixels: [[1, 0, 6, 1], [2, 1, 1, 6], [5, 1, 1, 6], [3.5, 1, 1, 6], [0, 7, 8, 1]] },
  // A house.
  mayor: { title: "prefeito", color: "var(--color-cream)", pixels: [[3, 0, 2, 1], [2, 1, 4, 1], [1, 2, 6, 1], [1, 3, 6, 5]] },
  // A flag on its pole.
  founder: { title: "fundador", color: "var(--color-cream)", pixels: [[1, 0, 1, 8], [2, 1, 5, 1], [2, 2, 4, 1], [2, 3, 5, 1], [2, 4, 4, 1], [0, 7, 3, 1]] },
};

/** Ease-out-back: past full size, then settles. */
function back(x: number) {
  const c = 1.7;
  return x <= 0 ? 0 : 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
}

/**
 * Moves balloon `index` of the overlay's balloons (stage percent) and shows its plate until the first
 * badge's moment, then each badge as its moment comes (popping in over
 * 0.4s), the next one replacing it. null hides it.
 */
export function placeBalloon(
  container: HTMLDivElement | null,
  index: number,
  at: { left: number; top: number; opacity: number; badges: number[]; t: number; roof?: { x: number; y: number } } | null,
) {
  if (!container) return;
  // One balloon at a time: the others hide.
  container.querySelectorAll<HTMLElement>("[data-balloon]").forEach((x) => {
    if (Number(x.dataset.balloon) !== index || !at) x.style.opacity = "0";
  });
  const el = container.querySelector<HTMLElement>(`[data-balloon="${index}"]`);
  if (!el || !at) return;
  el.style.opacity = String(at.opacity);
  // Where its building's roof is on screen (0–1), for the export's report.
  if (at.roof) {
    el.dataset.roofX = String(at.roof.x);
    el.dataset.roofY = String(at.roof.y);
  }
  el.style.left = `${at.left}%`;
  el.style.top = `${at.top}%`;
  const ks = at.badges.map((m) => back(Math.min(1, Math.max(0, (at.t - m) / 0.4))));
  const show = (key: string, k: number) => {
    const c = el.querySelector<HTMLElement>(`[data-tag="${key}"]`);
    if (!c) return;
    c.style.opacity = String(Math.min(1, Math.max(0, k * 2)));
    c.style.transform = `scale(${Math.max(0.001, k)})`;
  };
  show("plate", (ks[0] ?? 0) > 0 ? 0 : 1);
  ks.forEach((k, i) => show(String(i), (ks[i + 1] ?? 0) > 0 ? 0 : k));
}

/**
 * Where each overlay is on the stage this frame, in fractions (0–1): the
 * header (rule or call to action, whichever shows), the caption line's
 * spoken words and the balloon. The export records it per frame for the
 * safe-zone check (lib/reel/check), so nobody screenshots the 3D city.
 */
export function overlayBoxes(stage: HTMLElement): { name: string; x: number; y: number; w: number; h: number }[] {
  const s = stage.getBoundingClientRect();
  return [...stage.querySelectorAll<HTMLElement>("[data-reel-box]")].flatMap((el) => {
    if (Number(el.style.opacity || 1) < 0.5) return [];
    // A box inside a panel (the phone's screen) shows only while its panel does.
    const panel = el.closest<HTMLElement>("[data-panel]");
    if (panel && Number(panel.style.opacity || 1) < 0.5) return [];
    let r: DOMRect;
    // A balloon or a card is its box; a line of type is its words (a caption line's box is wider than its words).
    if (["balloon", "points", "comment", "contrib", "place", "phone"].includes(el.dataset.reelBox!)) r = el.getBoundingClientRect();
    else {
      const range = document.createRange();
      range.selectNodeContents(el);
      r = range.getBoundingClientRect();
    }
    if (!r.width || !r.height) return [];
    const box = { name: el.dataset.reelBox!, x: (r.left - s.left) / s.width, y: (r.top - s.top) / s.height, w: r.width / s.width, h: r.height / s.height };
    // A balloon's building: where its roof is (a point).
    const roof = el.dataset.roofY ? [{ name: "roof", x: Number(el.dataset.roofX), y: Number(el.dataset.roofY), w: 0, h: 0 }] : [];
    return [box, ...roof];
  });
}

/** "dia 1 · *0 devs*" → spans, the starred words lime. */
function Lit({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*[^*]+\*)/).map((part, i) =>
        part.startsWith("*") ? (
          <span key={i} className="text-lime">
            {part.slice(1, -1)}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

const SIZE = { huge: "11cqw", big: "7.4cqw", small: "4.6cqw" } as const;
/** The headline carries the story, so it reads bigger than the fixed header. */
const HEADLINE_SIZE = { huge: "15cqw", big: "11cqw", small: "5.6cqw" } as const;
const outline = (w: number) => ({
  WebkitTextStroke: `${w}cqw #000`,
  paintOrder: "stroke fill" as const,
  textShadow: `0 ${w / 2}cqw 0 #000`,
});

function HeaderLines({ lines, sizes = SIZE, plates = false }: { lines: NonNullable<ReelSpec["header"]>["rule"]; sizes?: Record<keyof typeof SIZE, string>; plates?: boolean }) {
  return (
    <>
      {lines.map((l, i) =>
        plates ? (
          <p key={i} data-size={l.size} style={{ ...PLATE, fontSize: PLATE_SIZE[l.size], color: l.size === "small" ? BRAND.muted : BRAND.ink, textTransform: l.plain ? "none" : undefined }}>
            {segments(l.text).map((s, j) => (
              <span key={j} style={s.lit ? { color: BRAND.green } : undefined}>
                {s.text}
              </span>
            ))}
          </p>
        ) : (
          <p key={i} data-size={l.size} style={{ fontSize: sizes[l.size], lineHeight: 1, marginTop: i ? (sizes === SIZE ? "1.8cqw" : "1cqw") : 0, textTransform: l.plain ? "none" : undefined }}>
            <Lit text={l.text} />
          </p>
        ),
      )}
    </>
  );
}

// The channel's tokens (video-editor brand.json): one font, ink on near-black, green for the key word.
const BRAND = { bg: "#0c0d0b", ink: "#eceee6", muted: "#8d9288", green: "#5ce483", onGreen: "#0b1f12", dot: "#22241e" };
const HARD = "1.1cqw 1.1cqw 0 rgba(0,0,0,.85)";
const PLATE: CSSProperties = { display: "table", margin: "0 auto", background: BRAND.bg, color: BRAND.ink, boxShadow: HARD, padding: "1.4cqw 2.8cqw 1.8cqw", lineHeight: 1.1 };
const PLATE_SIZE = { huge: "10cqw", big: "7.4cqw", small: "4.2cqw" } as const;
const CAPTION_YELLOW = "#ffd84a";
const CAPTION_SHADOW = [[-0.4, 0], [0.4, 0], [0, -0.4], [0, 0.4], [-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]].map(([x, y]) => `${x}cqw ${y}cqw 0 ${BRAND.bg}`).join(", ") + `, 0.8cqw 0.8cqw 0 ${BRAND.bg}`;
/** Characters a second the headline types (his Terminal piece: two frames a character at 30 fps). */
const HEAD_CPS = 15;

const segments = (text: string) => text.split(/(\*[^*]+\*)/).filter(Boolean).map((s) => (s.startsWith("*") ? { text: s.slice(1, -1), lit: true } : { text: s, lit: false }));

/**
 * A headline beat on plates: each line on its own plate, the first behind a green `>`, the small
 * ones muted and hung under it. Every character is drawn hidden and the draw loop shows them in
 * order: a plate appears when its line starts typing and grows with it, the cursor right behind
 * (his Terminal line, the one box that grows).
 */
function PlateLines({ lines }: { lines: NonNullable<ReelSpec["headline"]>[number]["lines"] }) {
  let k = 0;
  return (
    <>
      {lines.map((l, i) => (
        <p key={i} data-size={l.size} data-fs={PLATE_SIZE[l.size]} style={{ ...PLATE, fontSize: PLATE_SIZE[l.size], color: l.size === "small" ? BRAND.muted : BRAND.ink, textTransform: l.plain ? "none" : undefined }}>
          {i === 0 && <span style={{ color: BRAND.green, marginRight: "0.6em" }}>&gt;</span>}
          {segments(l.text).flatMap((s, j) =>
            [...s.text].map((c, n) => (
              <span key={`${j}-${n}`} data-ch={k++} style={{ display: "none", color: s.lit ? BRAND.green : undefined }}>
                {c}
              </span>
            )),
          )}
          <span data-cursor style={{ display: "inline-block", width: "0.5em", height: "0.85em", marginLeft: "0.3em", verticalAlign: "-0.08em", background: BRAND.green, visibility: "hidden" }} />
        </p>
      ))}
    </>
  );
}

/** Brazil as a grid of dots (the channel's dot style), each dot's place in the order it lights. */
const BRAZIL_DOTS = (() => {
  const cols = 46;
  const { minX, maxX, minZ, maxZ } = MAP_BOUNDS;
  const step = (maxX - minX) / cols;
  const dots: { x: number; y: number; order: number }[] = [];
  for (let z = minZ + step / 2; z < maxZ; z += step) for (let x = minX + step / 2; x < maxX; x += step) if (onLand(x, z)) dots.push({ x: (x - minX) / step, y: (z - minZ) / step, order: 0 });
  // A fixed shuffle, so the country fills everywhere at once, the same way every render.
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  dots.forEach((d) => (d.order = rand()));
  const rank = [...dots].sort((p, q) => p.order - q.order);
  rank.forEach((d, i) => (d.order = i / rank.length));
  return { dots, w: cols, h: Math.ceil((maxZ - minZ) / step) };
})();

/** A card's spacing scale: between the lines of its words, and between its groups (words, drawing, points). */
const CARD_GAP = { line: "2cqw", group: "7cqw" };
/** The card's contribution graph: weeks across. */
const GRAPH_WEEKS = 12;

/** The card's typing and counting speed: characters a second, and the number's steps over the card. */
const CARD_CPS = 20;
const COUNT_STEPS = 14;
const NUMBER = /\d[\d.,]*/;
const numberOf = (s: string) => Number((NUMBER.exec(s)?.[0] ?? "0").replace(/\./g, "").replace(",", "."));

/**
 * A full-frame card on the dotted background. Every line types in (a block arrives whole when its
 * turn comes), a block's number counts up from 0 in hard steps over the card, and the map's dots
 * light with the count: the hook moves from its first frame.
 */
function CardPanel({ index, panel }: { index: number; panel: Extract<ReelPanel, { kind: "card" }> }) {
  const size = { huge: "10cqw", big: "8.6cqw", small: "4.6cqw" } as const;
  let k = 0;
  return (
    <div
      data-panel={index}
      className="absolute inset-0 font-pixel uppercase"
      style={{ zIndex: 5, opacity: 0, color: BRAND.ink, backgroundColor: BRAND.bg, backgroundImage: `radial-gradient(${BRAND.dot} 0.28cqw, transparent 0.3cqw)`, backgroundSize: "3cqw 3cqw" }}
    >
      {/* One column from 16% down, on one spacing scale: the words, then the drawing, then the points. */}
      <div className="absolute inset-x-0 flex flex-col items-center" style={{ top: "16%", gap: CARD_GAP.group }}>
        <div data-reel-box="card" className="flex flex-col items-center text-center" style={{ gap: CARD_GAP.line, maxWidth: "72%" }}>
          {panel.lines.map((l, i) => (
            // Every character keeps its place while it types in, so the centred line never shifts.
            <p key={i} style={{ fontSize: size[l.size], lineHeight: 1.5, color: l.size === "small" ? BRAND.muted : BRAND.ink, textTransform: l.plain ? "none" : undefined }}>
              {segments(l.text).map((s, j) =>
                s.lit ? (
                  <span key={j} data-ch={k++} data-count={NUMBER.test(s.text) ? s.text : undefined} style={{ visibility: "hidden", background: BRAND.green, color: BRAND.onGreen, padding: "0.1em 0.3em", boxShadow: HARD }}>
                    {s.text}
                  </span>
                ) : (
                  [...s.text].map((c, n) => (
                    <span key={`${j}-${n}`} data-ch={k++} style={{ visibility: "hidden" }}>
                      {c}
                    </span>
                  ))
                ),
              )}
            </p>
          ))}
        </div>
        {panel.draw?.kind === "map" && (
          <svg viewBox={`-1 -1 ${BRAZIL_DOTS.w + 2} ${BRAZIL_DOTS.h + 2}`} style={{ width: "80%" }}>
            {BRAZIL_DOTS.dots.map((d, i) => (
              <rect key={i} data-dot={d.order} x={d.x - 0.4} y={d.y - 0.4} width={0.8} height={0.8} fill={BRAND.dot} />
            ))}
          </svg>
        )}
        {panel.draw?.kind === "comment" && (
          // The brand's ink speech bubble with dark pixel text, a pixel tail under its left side.
          <div className="relative" style={{ background: BRAND.ink, color: BRAND.bg, boxShadow: HARD, padding: "5cqw", width: "86cqw", boxSizing: "border-box", fontSize: "6.4cqw", lineHeight: 1, textTransform: "none", whiteSpace: "nowrap" }}>
            <span data-typed />
            <span data-caret style={{ display: "inline-block", width: "0.5em", height: "1em", marginLeft: "0.15em", verticalAlign: "-0.1em", background: BRAND.bg }} />
            <span className="absolute" style={{ left: "8%", top: "100%", width: "6cqw", height: "6cqw", background: BRAND.ink, clipPath: "polygon(0 0, 100% 0, 0 100%)" }} />
          </div>
        )}
        {panel.draw?.kind === "graph" && (
          <div style={{ background: BRAND.bg, boxShadow: HARD, border: `0.4cqw solid ${BRAND.dot}`, padding: "3cqw", display: "grid", gridTemplateColumns: `repeat(${GRAPH_WEEKS}, 5cqw)`, gridAutoFlow: "column", gridTemplateRows: "repeat(7, 5cqw)", gap: "1.2cqw" }}>
            {Array.from({ length: GRAPH_WEEKS * 7 }, (_, i) => {
              const today = i === GRAPH_WEEKS * 7 - 7 + CONTRIB_TODAY;
              return <i key={i} data-today={today || undefined} style={{ background: i > GRAPH_WEEKS * 7 - 7 + CONTRIB_TODAY ? "transparent" : today ? CONTRIB[0] : CONTRIB[contribLevel(Math.floor(i / 7), i % 7)] }} />;
            })}
          </div>
        )}
        {panel.draw?.kind === "reel" && (
          // This reel in a window, the rail beside it (the comment button lights when it's tapped). The picture may run
          // on into the bottom band; only words keep out of it.
          <div className="flex items-center" style={{ gap: CARD_GAP.group }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- a frame of the reel, from the reels folder */}
            <img alt="" src={`/api/reels/file/${panel.draw.image}`} style={{ width: "52cqw", height: "92cqw", objectFit: "cover", border: `0.8cqw solid ${BRAND.ink}`, boxShadow: HARD }} />
            <div className="flex flex-col items-center" style={{ gap: CARD_GAP.group }}>
              <Heart style={{ width: "11cqw", height: "11cqw", color: BRAND.ink }} strokeWidth={2.5} />
              <span data-tap style={{ display: "grid", placeItems: "center", width: "17cqw", height: "17cqw", boxShadow: HARD }}>
                <MessageCircle style={{ width: "11cqw", height: "11cqw" }} strokeWidth={2.5} />
              </span>
              <Send style={{ width: "11cqw", height: "11cqw", color: BRAND.ink }} strokeWidth={2.5} />
            </div>
          </div>
        )}
        {panel.points && (
          <div data-points style={{ fontSize: "14cqw", lineHeight: 1, background: BRAND.green, color: BRAND.onGreen, padding: "2cqw 4cqw", boxShadow: HARD, visibility: "hidden" }}>
            {panel.points.value}
          </div>
        )}
        {panel.image && (
          // eslint-disable-next-line @next/next/no-img-element -- an image from the reels folder, drawn as it is
          <img alt="" src={`/api/reels/file/${panel.image}`} style={{ width: "72%", maxHeight: "40%", objectFit: "contain", imageRendering: "pixelated" }} />
        )}
      </div>
    </div>
  );
}

/** Each frame of a card: the typing, the count and the lit dots. */
function drawCard(el: HTMLElement, p: Extract<ReelPanel, { kind: "card" }>, t: number) {
  const local = t - p.from;
  const n = Math.floor(local * CARD_CPS);
  el.querySelectorAll<HTMLElement>("[data-ch]").forEach((c) => (c.style.visibility = Number(c.dataset.ch) < n ? "" : "hidden"));
  // The count runs over the card, ending a beat before it cuts away.
  const span = Math.max(0.3, p.to - p.from - 0.3);
  const u = Math.floor(clamp(local / span) * COUNT_STEPS) / COUNT_STEPS;
  el.querySelectorAll<HTMLElement>("[data-count]").forEach((c) => {
    const text = c.dataset.count!;
    const v = Math.round(numberOf(text) * u).toLocaleString("pt-BR");
    const next = text.replace(NUMBER, v);
    if (c.textContent !== next) c.textContent = next;
  });
  el.querySelectorAll<SVGRectElement>("[data-dot]").forEach((d) => d.setAttribute("fill", Number(d.dataset.dot) < u ? BRAND.green : BRAND.dot));
  const draw = p.draw;
  if (draw?.kind === "comment") {
    const typed = draw.text.slice(0, Math.max(0, Math.floor((t - draw.at) * TYPE_CPS)));
    const box = el.querySelector<HTMLElement>("[data-typed]");
    if (box && box.textContent !== typed) box.textContent = typed;
    const caret = el.querySelector<HTMLElement>("[data-caret]");
    if (caret) caret.style.visibility = typed.length < draw.text.length || Math.floor(t * 2.5) % 2 === 0 ? "" : "hidden";
  }
  if (draw?.kind === "graph") {
    // Today's square lights in two hard steps: dim, then the brightest green.
    const sq = el.querySelector<HTMLElement>("[data-today]");
    if (sq) sq.style.background = t < draw.at ? CONTRIB[0] : t < draw.at + 0.1 ? CONTRIB[2] : CONTRIB[4];
  }
  if (draw?.kind === "reel") {
    // The comment button: ink on the dark, then tapped (a frame bigger) and green from `at` on.
    const tap = el.querySelector<HTMLElement>("[data-tap]");
    if (tap) {
      const on = t >= draw.at;
      tap.style.background = on ? BRAND.green : BRAND.bg;
      tap.style.color = on ? BRAND.onGreen : BRAND.ink;
      tap.style.transform = on && t < draw.at + 0.08 ? "scale(1.2)" : "";
    }
  }
  const pts = el.querySelector<HTMLElement>("[data-points]");
  if (pts && p.points) {
    // The block lands at its word: one frame a little big, then its size.
    pts.style.visibility = t >= p.points.at ? "" : "hidden";
    pts.style.transform = t < p.points.at + 0.08 ? "scale(1.15)" : "";
  }
}

const clamp = (u: number) => Math.min(1, Math.max(0, u));
const ease = (u: number) => 1 - Math.pow(1 - clamp(u), 3);

/**
 * Animates the panels each frame: a panel fades in from its moment and out
 * 0.3s after its end; bars grow to their value one after another; a roster
 * shows its rows a page at a time, each row sliding in after the one above.
 */
function drawPanels(root: HTMLElement, panels: readonly ReelPanel[], t: number) {
  panels.forEach((p, i) => {
    const el = root.querySelector<HTMLElement>(`[data-panel="${i}"]`);
    if (!el) return;
    // A card cuts in and out, no fade.
    if (p.kind === "card") {
      const up = t >= p.from && t < p.to;
      el.style.opacity = up ? "1" : "0";
      if (up) drawCard(el, p, t);
      return;
    }
    const on = t >= p.from && t < p.to + 0.3;
    el.style.opacity = on ? String(Math.min(1, (t - p.from) / FADE, (p.to + 0.3 - t) / 0.3)) : "0";
    if (!on) return;
    const local = t - p.from;
    if (p.kind === "comment") {
      // Slides up into place, then types each part at its moment, a caret blinking while it types.
      const k = ease(local / 0.25);
      el.style.transform = `translate(-50%, ${(1 - k) * 6}cqw)`;
      const typed = p.parts.map((x) => x.text.slice(0, Math.max(0, Math.floor((t - x.at) * TYPE_CPS)))).join("");
      const text = el.querySelector<HTMLElement>("[data-typed]");
      if (text && text.dataset.typed !== typed) {
        text.dataset.typed = typed;
        text.replaceChildren(
          ...typed.split(/(@[\w.]+)/).map((part) => {
            const span = document.createElement("span");
            span.textContent = part;
            if (part.startsWith("@")) span.style.color = "var(--color-lime)";
            return span;
          }),
        );
      }
      const typing = p.parts.some((x) => t >= x.at && (t - x.at) * TYPE_CPS < x.text.length);
      const caret = el.querySelector<HTMLElement>("[data-caret]");
      if (caret) caret.style.opacity = typing || Math.floor(t * 2.5) % 2 === 0 ? "1" : "0";
      return;
    }
    if (p.kind === "phone") {
      drawPhone(el, p, t, local);
      return;
    }
    if (p.kind === "score") {
      // The tile pops in, then its points pop under the icon.
      const tile = el.querySelector<HTMLElement>("[data-tile]");
      const n = el.querySelector<HTMLElement>("[data-n]");
      const k = back(clamp(local / 0.3));
      if (tile) tile.style.transform = `scale(${Math.max(0.001, k)})`;
      if (n) {
        const pop = back(clamp((local - 0.2) / 0.3));
        n.style.opacity = String(clamp(pop * 2));
        n.style.transform = `scale(${Math.max(0.001, pop)})`;
      }
      return;
    }
    if (p.kind === "points") {
      // Each row as it's said: the thing rises in, then its points pop beside it (a GitHub row's today square lights first).
      p.rows.forEach((r, k) => {
        const since = t - r.at;
        const thing = el.querySelector<HTMLElement>(`[data-thing="${k}"]`);
        const n = el.querySelector<HTMLElement>(`[data-n="${k}"]`);
        if (thing) {
          thing.style.opacity = String(clamp(since / 0.12));
          thing.style.transform = `translateY(${(1 - ease(since / 0.25)) * 3}cqw)`;
          const today = thing.querySelector<HTMLElement>("[data-today]");
          if (today) {
            const on = since >= 0.2;
            today.style.background = on ? CONTRIB[4] : CONTRIB[0];
            today.style.boxShadow = on ? `0 0 ${2.6 * Math.max(0.3, 1 - (since - 0.2) / 0.8)}cqw ${CONTRIB[4]}` : "none";
          }
        }
        if (n) {
          const pop = back(clamp((since - 0.25) / 0.3));
          n.style.opacity = String(clamp(pop * 2));
          n.style.transform = `scale(${Math.max(0.001, pop)})`;
        }
      });
      return;
    }
    if (p.kind === "place") {
      // The photo pops, then the lines come in under it one after another (in the channel's look, cut in, no easing).
      if (el.dataset.hard !== undefined) {
        el.querySelectorAll<HTMLElement>("[data-step]").forEach((x) => (x.style.visibility = local >= Number(x.dataset.step) * 0.12 ? "" : "hidden"));
        return;
      }
      el.querySelectorAll<HTMLElement>("[data-step]").forEach((x) => {
        const k = back(clamp((local - Number(x.dataset.step) * 0.12) / 0.3));
        x.style.opacity = String(clamp(k * 2));
        x.style.transform = `scale(${Math.max(0.001, k)})`;
      });
      return;
    }
    if (p.kind === "contrib") {
      const k = ease(local / 0.25);
      el.style.transform = `translate(-50%, ${(1 - k) * 6}cqw)`;
      // Today's square: empty, then lit with a pop and a glow.
      const today = el.querySelector<HTMLElement>("[data-today]");
      if (today) {
        const on = t >= p.at;
        const pop = back(clamp((t - p.at) / 0.35));
        today.style.background = on ? CONTRIB[4] : CONTRIB[0];
        today.style.transform = `scale(${on ? 0.6 + 0.4 * pop + 0.25 * Math.max(0, 1 - (t - p.at) / 0.5) : 1})`;
        today.style.boxShadow = on ? `0 0 ${3 * Math.max(0.3, 1 - (t - p.at) / 0.8)}cqw ${CONTRIB[4]}` : "none";
      }
      return;
    }
    if (p.kind === "counter") {
      const n = Math.max(1, Math.min(p.value, Math.round(1 + ((t - p.from) / Math.max(0.001, p.reach - p.from)) * (p.value - 1))));
      const num = el.querySelector<HTMLElement>("[data-n]");
      const text = n.toLocaleString("pt-BR");
      if (num && num.textContent !== text) num.textContent = text;
      return;
    }
    if (p.kind === "profile") {
      // Slides up into place, as the app's card does on a click.
      const k = ease(local / 0.25);
      el.style.transform = `translate(-50%, ${(1 - k) * 8}cqw)`;
      return;
    }
    if (p.kind === "poster") {
      // Slammed in from big and tilted, then still.
      const k = clamp(local / 0.16);
      el.style.transform = `translate(-50%, 0) scale(${1.5 - 0.5 * k * k}) rotate(${-3 - 5 * (1 - k)}deg)`;
      return;
    }
    if (p.kind === "follow") {
      // Popped in, settling just under full size (in the channel's look it cuts in); its button tapped at `done`.
      const hard = el.dataset.hard !== undefined;
      const k = clamp(local / 0.18);
      if (!hard) el.style.transform = `translate(-50%, 0) scale(${0.88 * (0.6 + 0.4 * (1 - (1 - k) ** 3) + 0.06 * Math.sin(Math.PI * k))})`;
      const done = t >= p.done;
      const btn = el.querySelector<HTMLElement>("[data-follow]");
      if (btn && btn.dataset.done !== String(done)) {
        btn.dataset.done = String(done);
        btn.textContent = done ? "Seguindo" : "Seguir";
        btn.style.background = done ? (hard ? BRAND.bg : "#262626") : hard ? BRAND.green : "#0095f6";
        if (hard) {
          btn.style.color = done ? BRAND.ink : BRAND.onGreen;
          btn.style.outline = done ? `0.4cqw solid ${BRAND.muted}` : "";
        }
        const f = el.querySelector<HTMLElement>("[data-followers]");
        if (f) f.textContent = done ? (f.dataset.after ?? f.textContent) : (f.dataset.before ?? f.textContent);
      }
      return;
    }
    if (p.kind === "bars") {
      el.querySelectorAll<HTMLElement>("[data-bar]").forEach((bar, k) => {
        bar.style.transform = `scaleX(${ease((local - k * 0.08) / 0.5)})`;
      });
      return;
    }
    const pages = Math.ceil(p.rows.length / p.perPage);
    const page = Math.min(pages - 1, Math.floor((local / Math.max(0.001, p.to - p.from)) * pages));
    const since = local - (page * (p.to - p.from)) / pages;
    el.querySelectorAll<HTMLElement>("[data-row]").forEach((row) => {
      const n = Number(row.dataset.row);
      const k = n - page * p.perPage;
      const shown = k >= 0 && k < p.perPage;
      row.style.display = shown ? "" : "none";
      if (!shown) return;
      const e = ease((since - k * 0.07) / 0.3);
      row.style.opacity = String(e);
      row.style.transform = `translateY(${(1 - e) * 1.5}cqw)`;
    });
  });
}

/** Characters typed a second in a comment card. */
const TYPE_CPS = 14;
/** GitHub's dark contribution greens, none to most. */
const CONTRIB = ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"];
const CONTRIB_WEEKS = 14;
/** Today's weekday row in the last week (the rows after it aren't drawn yet). */
const CONTRIB_TODAY = 4;
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** A steady made-up graph (the same every render): mostly coded days, a few gaps. */
function contribLevel(week: number, day: number) {
  const h = Math.sin(week * 12.9898 + day * 78.233) * 43758.5453;
  const r = h - Math.floor(h);
  return r < 0.18 ? 0 : r < 0.42 ? 1 : r < 0.68 ? 2 : r < 0.88 ? 3 : 4;
}

function CommentPanel({ index, handle }: { index: number; handle: string }) {
  return (
    <div
      data-panel={index}
      data-reel-box="comment"
      style={{ position: "absolute", left: "50%", top: "31%", width: "72cqw", opacity: 0, background: "#000", color: "#f5f5f5", border: "0.3cqw solid #262626", borderRadius: "3cqw", padding: "4.4cqw 4.4cqw", fontFamily: SANS, boxShadow: "0 2cqw 6cqw rgba(0,0,0,0.6)" }}
    >
      <div style={{ display: "flex", gap: "3cqw", alignItems: "flex-start" }}>
        <div style={{ width: "11cqw", height: "11cqw", borderRadius: "50%", background: "#363636", flexShrink: 0, overflow: "hidden", position: "relative" }}>
          <div style={{ position: "absolute", left: "50%", top: "22%", width: "4.4cqw", height: "4.4cqw", borderRadius: "50%", background: "#8e8e8e", transform: "translateX(-50%)" }} />
          <div style={{ position: "absolute", left: "50%", top: "62%", width: "8cqw", height: "7.4cqw", borderRadius: "50%", background: "#8e8e8e", transform: "translateX(-50%)" }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: "4cqw", lineHeight: 1.2 }}>
            <span style={{ fontWeight: 700 }}>{handle}</span> <span style={{ color: "#a8a8a8" }}>agora</span>
          </p>
          <p style={{ fontSize: "6.4cqw", lineHeight: 1.25, marginTop: "1cqw", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            <span data-typed="" />
            <span data-caret style={{ display: "inline-block", width: "0.6cqw", height: "6.6cqw", marginLeft: "0.3cqw", verticalAlign: "-1cqw", background: "#f5f5f5" }} />
          </p>
          <p style={{ fontSize: "3.6cqw", color: "#a8a8a8", fontWeight: 600, marginTop: "1.6cqw" }}>Responder</p>
        </div>
        {/* The like heart, outlined, as Instagram draws it. */}
        <svg viewBox="0 0 24 24" style={{ width: "5.4cqw", height: "5.4cqw", flexShrink: 0, marginTop: "5cqw" }} fill="none" stroke="#a8a8a8" strokeWidth="2">
          <path d="M12 21s-7.5-4.6-9.5-9.2C1.2 8.6 3.2 5 6.6 5c2.1 0 3.5 1.2 4.4 2.6h2c.9-1.4 2.3-2.6 4.4-2.6 3.4 0 5.4 3.6 4.1 6.8C19.5 16.4 12 21 12 21z" />
        </svg>
      </div>
    </div>
  );
}

const IG_BLUE = "#0095f6";

type PhoneScreen = Extract<ReelPanel, { kind: "phone" }>["screens"][number];
/** Each typed character's moment, in order across a screen's parts. */
const typedAt = (x: PhoneScreen) => x.parts.flatMap((y) => [...y.text].map((c, i) => ({ c, at: y.at + i / TYPE_CPS })));

/** The phone each frame: which screen shows, what's typed, the key pressed, the send, today's square, the points. */
function drawPhone(el: HTMLElement, p: Extract<ReelPanel, { kind: "phone" }>, t: number, local: number) {
  el.style.transform = `translate(-50%, ${(1 - ease(local / 0.3)) * 10}cqw)`;
  p.screens.forEach((x, k) => {
    const sc = el.querySelector<HTMLElement>(`[data-screen="${k}"]`);
    if (!sc) return;
    // The last screen stays up while the phone fades out.
    const on = t >= x.at && (t < x.until || k === p.screens.length - 1);
    sc.style.opacity = on ? "1" : "0";
    const pts = el.querySelector<HTMLElement>(`[data-points="${k}"]`);
    if (pts) {
      const pop = on && x.points ? back(clamp((t - x.points.at) / 0.3)) : 0;
      pts.style.opacity = String(clamp(pop * 2));
      pts.style.transform = `scale(${Math.max(0.001, pop)})`;
    }
    if (!on) return;
    const sent = x.send !== null && t >= x.send;
    if (x.kind === "reel") {
      // The comment button tapped: it dips, a touch ripple spreads from it.
      const since = x.send === null ? -1 : t - x.send;
      const btn = sc.querySelector<HTMLElement>("[data-tap]");
      if (btn) btn.style.transform = `scale(${since >= 0 && since < 0.18 ? 0.8 : 1})`;
      const ripple = sc.querySelector<HTMLElement>("[data-ripple]");
      if (ripple) {
        const k = since >= 0 ? clamp(since / 0.45) : 0;
        ripple.style.opacity = since >= 0 ? String(0.7 * (1 - k)) : "0";
        ripple.style.transform = `translate(-50%, -50%) scale(${0.5 + 0.8 * k})`;
      }
      return;
    }
    if (x.kind === "graph") {
      const today = sc.querySelector<HTMLElement>("[data-today]");
      if (today) {
        today.style.background = sent ? CONTRIB[4] : CONTRIB[0];
        today.style.transform = `scale(${sent ? 1 + 0.4 * Math.max(0, 1 - (t - x.send!) / 0.35) : 1})`;
        today.style.boxShadow = sent ? `0 0 ${3 * Math.max(0.3, 1 - (t - x.send!) / 0.8)}cqw ${CONTRIB[4]}` : "none";
      }
      return;
    }
    const chars = typedAt(x);
    const typed = chars.filter((c) => c.at <= t).map((c) => c.c).join("");
    const lit = (text: string) =>
      text.split(/(@[\w.]+)/).map((part) => {
        const span = document.createElement("span");
        span.textContent = part;
        if (part.startsWith("@")) span.style.color = "#e0f1ff";
        return span;
      });
    const input = sc.querySelector<HTMLElement>("[data-input]");
    if (input && input.dataset.v !== (sent ? "" : typed)) {
      input.dataset.v = sent ? "" : typed;
      input.replaceChildren(...(sent || !typed ? [] : lit(typed)));
    }
    const scroll = sc.querySelector<HTMLElement>("[data-scroll]");
    const field = scroll?.parentElement;
    if (scroll && field) {
      const room = field.clientWidth - parseFloat(getComputedStyle(field).paddingLeft) - parseFloat(getComputedStyle(field).paddingRight);
      scroll.style.transform = `translateX(${-Math.max(0, scroll.scrollWidth - room)}px)`;
    }
    const ph = sc.querySelector<HTMLElement>("[data-placeholder]");
    if (ph) ph.style.display = sent || !typed ? "" : "none";
    const caret = sc.querySelector<HTMLElement>("[data-caret]");
    if (caret) caret.style.opacity = !sent && Math.floor(t * 2.5) % 2 === 0 ? "1" : "0";
    const send = sc.querySelector<HTMLElement>("[data-send]");
    if (send) {
      send.style.color = typed && !sent ? IG_BLUE : "#3b3b3b";
      send.style.transform = `scale(${x.send !== null && t >= x.send && t < x.send + 0.15 ? 0.82 : 1})`;
    }
    // The key of the last character typed, pressed for a moment.
    const last = [...chars].reverse().find((c) => c.at <= t);
    sc.querySelectorAll<HTMLElement>("[data-key]").forEach((key) => {
      const down = !sent && !!last && t - last.at < 0.09 && key.dataset.key === last.c.toLowerCase();
      key.style.background = down ? "#6b6b6b" : "#3a3a3c";
    });
    const suggest = sc.querySelector<HTMLElement>("[data-suggest]");
    if (suggest) suggest.style.opacity = !sent && typed.includes("@") ? "1" : "0";
    const posted = sc.querySelector<HTMLElement>("[data-posted]");
    if (posted) {
      const k2 = sent ? ease((t - x.send!) / 0.25) : 0;
      posted.style.opacity = String(k2);
      posted.style.transform = `translateY(${(1 - k2) * 4}cqw)`;
      const text = posted.querySelector<HTMLElement>("[data-posted-text]");
      const full = chars.map((c) => c.c).join("");
      if (text && text.dataset.v !== full) {
        text.dataset.v = full;
        text.replaceChildren(...lit(full));
      }
    }
  });
}

/** A phone in dark mode, its screens stacked (one shows at a time), the points popping over its top right. */
function PhonePanel({ index, panel }: { index: number; panel: Extract<ReelPanel, { kind: "phone" }> }) {
  const gray = "#a8a8a8";
  const avatar = (w: string) => <span style={{ width: w, height: w, borderRadius: "50%", background: "#363636", flexShrink: 0, display: "inline-block" }} />;
  // iOS proportions: the sheet's header, the list taking what's left, the input on one line docked over a full-width keyboard.
  const key = (c: string, flex = 1) => (
    <span key={c} data-key={c} style={{ flex, height: "8.4cqw", borderRadius: "1.2cqw", background: "#3a3a3c", fontSize: "3.6cqw", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0.3cqw 0 #111" }}>
      {c === " " ? "" : c}
    </span>
  );
  const comments = (earlier: string[]) => (
    <>
      <div style={{ display: "flex", justifyContent: "center", paddingTop: "1.6cqw" }}>
        <span style={{ width: "8cqw", height: "0.9cqw", borderRadius: "1cqw", background: "#555" }} />
      </div>
      <p style={{ textAlign: "center", fontSize: "3.6cqw", fontWeight: 700, padding: "2.4cqw 0", borderBottom: "0.25cqw solid #262626" }}>Comentários</p>
      <div style={{ flex: 1, padding: "3.6cqw 4cqw", position: "relative", display: "flex", flexDirection: "column", gap: "3.4cqw" }}>
        {earlier.map((text, i) => (
          <div key={i} style={{ display: "flex", gap: "2.6cqw" }}>
            {avatar("7.4cqw")}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: "2.9cqw", lineHeight: 1.3 }}>
                <span style={{ fontWeight: 700 }}>voce</span> <span style={{ color: gray }}>agora</span>
              </p>
              <p style={{ fontSize: "4.2cqw", lineHeight: 1.3 }}>{text}</p>
            </div>
          </div>
        ))}
        <div data-posted style={{ display: "flex", gap: "2.6cqw", opacity: 0 }}>
          {avatar("7.4cqw")}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: "2.9cqw", lineHeight: 1.3 }}>
              <span style={{ fontWeight: 700 }}>voce</span> <span style={{ color: gray }}>agora</span>
            </p>
            <p data-posted-text style={{ fontSize: "4.2cqw", lineHeight: 1.3 }} />
            <p style={{ fontSize: "2.7cqw", color: gray, fontWeight: 600, marginTop: "0.8cqw" }}>Responder</p>
          </div>
        </div>
        <div data-suggest style={{ position: "absolute", left: "4cqw", right: "4cqw", bottom: "2cqw", display: "flex", alignItems: "center", gap: "2.6cqw", background: "#262626", borderRadius: "2.6cqw", padding: "2.2cqw 3cqw", opacity: 0 }}>
          {avatar("6.6cqw")}
          <span style={{ fontSize: "3.8cqw", fontWeight: 700 }}>amigo</span>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "2.4cqw", padding: "2.4cqw 3.4cqw", borderTop: "0.25cqw solid #262626" }}>
        {avatar("7.4cqw")}
        <div style={{ flex: 1, minWidth: 0, height: "9.6cqw", display: "flex", alignItems: "center", border: "0.3cqw solid #363636", borderRadius: "5cqw", padding: "0 3.2cqw", fontSize: "3.9cqw", whiteSpace: "nowrap", overflow: "hidden" }}>
          {/* The typed text and caret slide left once they run past the field, as iOS scrolls a long line. */}
          <span data-scroll style={{ display: "inline-flex", alignItems: "center", flexShrink: 0 }}>
            <span data-input />
            <span data-caret style={{ display: "inline-block", width: "0.45cqw", height: "4.6cqw", margin: "0 0.4cqw", background: IG_BLUE, flexShrink: 0 }} />
          </span>
          <span data-placeholder style={{ color: "#737373", fontSize: "3.6cqw", overflow: "hidden", textOverflow: "ellipsis" }}>Adicione um comentário…</span>
        </div>
        <svg data-send viewBox="0 0 24 24" style={{ width: "8cqw", height: "8cqw", color: "#3b3b3b", flexShrink: 0 }} aria-hidden>
          <circle cx="12" cy="12" r="12" fill="currentColor" />
          <path d="M12 17V7M7.5 11.5 12 7l4.5 4.5" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div style={{ background: "#1c1c1e", padding: "2.6cqw 1.2cqw 1.6cqw", display: "flex", flexDirection: "column", gap: "2.4cqw" }}>
        <div style={{ display: "flex", gap: "1.2cqw" }}>{[..."qwertyuiop"].map((c) => key(c))}</div>
        <div style={{ display: "flex", gap: "1.2cqw", padding: "0 2.6cqw" }}>{[..."asdfghjkl"].map((c) => key(c))}</div>
        <div style={{ display: "flex", gap: "1.2cqw" }}>
          {key("⇧", 1.5)}
          <span style={{ width: "1.4cqw" }} />
          {[..."zxcvbnm"].map((c) => key(c))}
          <span style={{ width: "1.4cqw" }} />
          {key("⌫", 1.5)}
        </div>
        <div style={{ display: "flex", gap: "1.2cqw" }}>
          {key("123", 2.4)}
          {key(" ", 6)}
          {key("@", 1.2)}
        </div>
        <div style={{ display: "flex", justifyContent: "center", paddingTop: "1.6cqw" }}>
          <span style={{ width: "22cqw", height: "1cqw", borderRadius: "1cqw", background: "#f5f5f5" }} />
        </div>
      </div>
    </>
  );
  // This reel on Instagram as the app lays it out: its video (a frame of it), the right rail, the account and caption, the tab bar.
  const nav = "#f5f5f5";
  const reelScreen = (image: string | null) => (
    <div style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ position: "relative", flex: 1, overflow: "hidden", background: "#000" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a frame of this reel, from REELS_HOME */}
        {image && <img alt="" src={`/api/reels/file/${image}`} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.35), rgba(0,0,0,0) 18%, rgba(0,0,0,0) 62%, rgba(0,0,0,0.7))" }} />
        <p style={{ position: "absolute", left: 0, right: 0, top: "3cqw", textAlign: "center", fontSize: "4cqw", fontWeight: 700 }}>Reels</p>
        <div style={{ position: "absolute", right: "3.6cqw", bottom: "6cqw", display: "flex", flexDirection: "column", alignItems: "center", gap: "5.4cqw" }}>
          <Heart style={{ width: "7cqw", height: "7cqw" }} strokeWidth={2} aria-hidden />
          <div data-tap style={{ position: "relative", display: "flex" }}>
            <MessageCircle style={{ width: "7cqw", height: "7cqw" }} strokeWidth={2} aria-hidden />
            <span data-ripple style={{ position: "absolute", left: "50%", top: "50%", width: "11cqw", height: "11cqw", borderRadius: "50%", background: "#fff", opacity: 0 }} />
          </div>
          <Send style={{ width: "7cqw", height: "7cqw" }} strokeWidth={2} aria-hidden />
        </div>
        <div style={{ position: "absolute", left: "4cqw", right: "15cqw", bottom: "3.4cqw" }}>
          <p style={{ display: "flex", alignItems: "center", gap: "2cqw", fontSize: "3.4cqw", fontWeight: 700, whiteSpace: "nowrap" }}>
            {avatar("6.4cqw")}
            samuelrizzondev
          </p>
          <p style={{ fontSize: "3.2cqw", marginTop: "1.6cqw" }}>Brasil, Dia 2</p>
          <p style={{ fontSize: "2.8cqw", marginTop: "1.2cqw", color: "#d6d6d6" }}>♫ Áudio original</p>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-around", alignItems: "center", height: "11cqw", background: "#000", borderTop: "0.25cqw solid #262626" }}>
        {[House, Search, SquarePlus, Clapperboard, CircleUser].map((I, i) => (
          <I key={i} style={{ width: "5.6cqw", height: "5.6cqw", color: nav }} strokeWidth={i === 3 ? 2.6 : 2} aria-hidden />
        ))}
      </div>
    </div>
  );
  const graph = (
    <div style={{ background: "#0d1117", height: "100%", padding: "6cqw 4cqw" }}>
      <p style={{ fontSize: "4cqw", fontWeight: 700 }}>Contribuições</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(9, 4.4cqw)", gridTemplateRows: "repeat(7, 4.4cqw)", gridAutoFlow: "column", gap: "1cqw", marginTop: "4cqw", padding: "3cqw", border: "0.3cqw solid #30363d", borderRadius: "2cqw", justifyContent: "center" }}>
        {Array.from({ length: 9 * 7 }, (_, i) => {
          const week = Math.floor(i / 7);
          const day = i % 7;
          const last = week === 8;
          if (last && day > CONTRIB_TODAY) return <span key={i} />;
          const today = last && day === CONTRIB_TODAY;
          return <span key={i} data-today={today || undefined} style={{ borderRadius: "0.8cqw", background: today ? CONTRIB[0] : CONTRIB[contribLevel(week, day)], outline: today ? "0.3cqw solid #8b949e" : undefined }} />;
        })}
      </div>
    </div>
  );
  return (
    <div data-panel={index} className="absolute" style={{ left: "50%", top: "17%", width: "60cqw", opacity: 0 }}>
      <div data-body style={{ position: "relative", height: "118cqw", borderRadius: "8cqw", background: "#000", border: "1.4cqw solid #2a2a2c", boxShadow: "0 3cqw 10cqw rgba(0,0,0,0.7)", overflow: "hidden", color: "#f5f5f5", fontFamily: SANS }}>
        {/* What the safe-zone check measures: the screen down to the keyboard (the keyboard may run under Instagram's bar). */}
        <div data-reel-box="phone" style={{ position: "absolute", left: 0, right: 0, top: 0, height: "80cqw" }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2.4cqw 6cqw 0", fontSize: "3cqw", fontWeight: 600, height: "7cqw" }}>
          <span>9:41</span>
          <span style={{ width: "16cqw", height: "4.4cqw", borderRadius: "3cqw", background: "#111" }} />
          {/* The right corner stays free for the points badge. */}
          <span style={{ width: "8cqw" }} />
        </div>
        {panel.screens.map((x, k) => (
          <div key={k} data-screen={k} style={{ position: "absolute", left: 0, right: 0, top: "7cqw", bottom: 0, display: "flex", flexDirection: "column", opacity: 0 }}>
            {x.kind === "graph" ? graph : x.kind === "reel" ? reelScreen(x.image) : comments(x.posted)}
          </div>
        ))}
      </div>
      {panel.screens.map((x, k) => (
        // A badge on the phone's top right corner, poking out of its edge like a notification: over nothing on the screen.
        <p key={k} data-points={k} className="font-pixel" style={{ position: "absolute", right: "-5cqw", top: "-3.4cqw", fontSize: "7.6cqw", lineHeight: 1, padding: "1.6cqw 2.8cqw", background: "var(--color-lime)", color: "#0b0f0a", border: "0.8cqw solid #000", boxShadow: "0 1.2cqw 0 #000", opacity: 0, transformOrigin: "70% 30%" }}>
          {x.points?.value}
        </p>
      ))}
    </div>
  );
}

/** The app's icons for the ways to score (BrasilPanels' "How to score"). */
const SCORE_ICONS: Record<string, LucideIcon> = { comment: MessageCircle, code: Code2, friend: UserPlus, story: Instagram, join: MapPin };

/** One way to score, big: the app's icon on its tile (the panel's border and dark glass), the points under it in lime. */
function ScorePanel({ index, panel }: { index: number; panel: Extract<ReelPanel, { kind: "score" }> }) {
  const Icon = SCORE_ICONS[panel.icon] ?? MessageCircle;
  return (
    <div data-panel={index} data-reel-box="place" className="absolute flex flex-col items-center font-pixel uppercase" style={{ left: "50%", top: "17%", transform: "translateX(-50%)", opacity: 0 }}>
      <div data-tile className="flex items-center justify-center border-border bg-bg/85" style={{ width: "24cqw", height: "24cqw", borderWidth: "0.8cqw", borderStyle: "solid" }}>
        <Icon className="text-cream" style={{ width: "13cqw", height: "13cqw" }} strokeWidth={1.6} aria-hidden />
      </div>
      <p data-n className="text-lime" style={{ fontSize: "13cqw", lineHeight: 1, marginTop: "2.6cqw", opacity: 0, ...outline(1.6) }}>
        {panel.value}
      </p>
    </div>
  );
}

/**
 * The points table: a row per way to score, each in as it's said. A row is
 * the real thing the viewer already knows, cut out of its app (an Instagram
 * comment, a GitHub contribution row, an Instagram @mention), with the
 * points big beside it: no icon to decode, no word to read.
 */
function PointsPanel({ index, panel }: { index: number; panel: Extract<ReelPanel, { kind: "points" }> }) {
  const sans = { fontFamily: SANS, textTransform: "none" as const, WebkitTextStroke: 0, textShadow: "none" };
  const thing = (icon: string) => {
    if (icon === "comment")
      return (
        <div className="flex items-center" style={{ ...sans, gap: "1.8cqw", background: "#000", border: "0.3cqw solid #363636", borderRadius: "3cqw", padding: "1.8cqw 2.6cqw" }}>
          <span style={{ width: "5.6cqw", height: "5.6cqw", borderRadius: "50%", background: "#363636", flexShrink: 0 }} />
          <span style={{ fontSize: "4.4cqw", color: "#f5f5f5", whiteSpace: "nowrap" }}>seuuser SP</span>
          <svg viewBox="0 0 24 24" style={{ width: "3.8cqw", height: "3.8cqw", marginLeft: "1cqw" }} fill="none" stroke="#a8a8a8" strokeWidth="2">
            <path d="M12 21s-7.5-4.6-9.5-9.2C1.2 8.6 3.2 5 6.6 5c2.1 0 3.5 1.2 4.4 2.6h2c.9-1.4 2.3-2.6 4.4-2.6 3.4 0 5.4 3.6 4.1 6.8C19.5 16.4 12 21 12 21z" />
          </svg>
        </div>
      );
    if (icon === "code")
      return (
        <div className="flex" style={{ gap: "1.1cqw", background: "#0d1117", border: "0.3cqw solid #30363d", borderRadius: "2cqw", padding: "2.4cqw" }}>
          {[2, 3, 1, 4, 2, 3].map((l, i) => (
            <span key={i} style={{ width: "4.2cqw", height: "4.2cqw", borderRadius: "0.8cqw", background: CONTRIB[l] }} />
          ))}
          <span data-today style={{ width: "4.2cqw", height: "4.2cqw", borderRadius: "0.8cqw", background: CONTRIB[0], outline: "0.3cqw solid #8b949e" }} />
        </div>
      );
    return (
      <span style={{ ...sans, fontSize: "6.4cqw", fontWeight: 700, color: "#4cb5f9", background: "#000", border: "0.3cqw solid #363636", borderRadius: "3cqw", padding: "1.6cqw 3.4cqw", whiteSpace: "nowrap" }}>@amigo</span>
    );
  };
  return (
    <div data-panel={index} data-reel-box="points" className="absolute font-pixel uppercase text-white" style={{ left: "50%", top: "25%", transform: "translateX(-50%)", display: "grid", gridTemplateColumns: "auto auto", alignItems: "center", columnGap: "4cqw", rowGap: "4.6cqw", opacity: 0, ...outline(1.4) }}>
      {panel.rows.map((r, k) => (
        <div key={k} data-row={k} style={{ display: "contents" }}>
          <div data-thing={k} style={{ justifySelf: "end", opacity: 0 }}>
            {thing(r.icon)}
          </div>
          <span data-n={k} className="text-lime" style={{ fontSize: "9cqw", lineHeight: 1, opacity: 0, transformOrigin: "0 50%" }}>
            {r.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/** The place card: a photo (the crown over it for an office), the @login, the number big. Outlined pixel type, no box. */
function PlacePanel({ index, panel, photo }: { index: number; panel: Extract<ReelPanel, { kind: "place" }>; photo: string | null }) {
  const crown = BADGES.governor;
  return (
    <div data-panel={index} data-reel-box="place" className="absolute flex flex-col items-center text-center font-pixel uppercase text-white" style={{ left: "50%", top: "24%", width: "72%", transform: "translateX(-50%)", opacity: 0, ...outline(1.4) }}>
      {panel.crown && (
        <svg data-step="1" viewBox="0 0 8 8" style={{ width: "11cqw", height: "11cqw", color: crown.color, marginBottom: "-1.6cqw", position: "relative", zIndex: 1 }} aria-hidden>
          {crown.pixels.map(([x, y, w, h], i) => (
            <rect key={i} x={x} y={y} width={w} height={h} fill="currentColor" stroke="#000" strokeWidth={0.3} paintOrder="stroke" />
          ))}
        </svg>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element -- a GitHub avatar, drawn as it is */}
      <img data-step="0" alt="" src={photo ?? `https://avatars.githubusercontent.com/${panel.login}?s=240`} style={{ width: "20cqw", height: "20cqw", border: "1cqw solid #000", outline: "0.7cqw solid var(--color-lime)" }} />
      <p data-step="2" style={{ fontSize: "6.6cqw", lineHeight: 1, marginTop: "3.4cqw", textTransform: "none" }}>
        @{panel.login}
      </p>
      <p data-step="3" className="text-lime" style={{ fontSize: "11cqw", lineHeight: 1, marginTop: "2.6cqw" }}>
        <Lit text={panel.value} />
      </p>
    </div>
  );
}

/** The place card in the channel's look: the crown, the photo framed in ink with a hard shadow, the login on its terminal plate, the value in the green block. */
function PlatesPlace({ index, panel, photo }: { index: number; panel: Extract<ReelPanel, { kind: "place" }>; photo: string | null }) {
  const crown = BADGES.governor;
  return (
    <div data-panel={index} data-hard data-reel-box="place" className="absolute flex flex-col items-center text-center font-pixel uppercase" style={{ left: "50%", top: "17%", width: "72%", transform: "translateX(-50%)", opacity: 0 }}>
      {panel.crown && (
        <svg data-step="1" viewBox="0 0 8 8" style={{ width: "9cqw", height: "9cqw", color: crown.color, marginBottom: "-1.2cqw", position: "relative", zIndex: 1 }} aria-hidden>
          {crown.pixels.map(([x, y, w, h], i) => (
            <rect key={i} x={x} y={y} width={w} height={h} fill="currentColor" stroke={BRAND.bg} strokeWidth={0.3} paintOrder="stroke" />
          ))}
        </svg>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element -- a GitHub avatar, drawn as it is */}
      <img data-step="0" alt="" src={photo ?? `https://avatars.githubusercontent.com/${panel.login}?s=240`} style={{ width: "18cqw", height: "18cqw", border: `0.8cqw solid ${BRAND.ink}`, boxShadow: HARD }} />
      <p data-step="2" style={{ ...PLATE, marginTop: "3.4cqw", fontSize: "5.4cqw", textTransform: "none", whiteSpace: "nowrap" }}>
        <span style={{ color: BRAND.green, marginRight: "0.6em" }}>&gt;</span>@{panel.login}
      </p>
      <p data-step="3" style={{ marginTop: "2.6cqw", fontSize: "6cqw", lineHeight: 1.1, background: BRAND.green, color: BRAND.onGreen, padding: "0.6cqw 2.6cqw", boxShadow: HARD }}>
        {panel.value.replace(/\*/g, "")}
      </p>
    </div>
  );
}

function ContribPanel({ index }: { index: number }) {
  const cell = "3.6cqw";
  return (
    <div
      data-panel={index}
      data-reel-box="contrib"
      style={{ position: "absolute", left: "50%", top: "31%", width: "72cqw", opacity: 0, background: "#0d1117", border: "0.3cqw solid #30363d", borderRadius: "2.4cqw", padding: "3.6cqw", fontFamily: SANS, boxShadow: "0 2cqw 6cqw rgba(0,0,0,0.6)" }}
    >
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${CONTRIB_WEEKS}, ${cell})`, gridTemplateRows: `repeat(7, ${cell})`, gridAutoFlow: "column", gap: "0.9cqw", justifyContent: "center" }}>
        {Array.from({ length: CONTRIB_WEEKS * 7 }, (_, i) => {
          const week = Math.floor(i / 7);
          const day = i % 7;
          const last = week === CONTRIB_WEEKS - 1;
          if (last && day > CONTRIB_TODAY) return <span key={i} />;
          const today = last && day === CONTRIB_TODAY;
          return <span key={i} data-today={today || undefined} style={{ borderRadius: "0.6cqw", background: today ? CONTRIB[0] : CONTRIB[contribLevel(week, day)], outline: today ? "0.3cqw solid #8b949e" : undefined }} />;
        })}
      </div>
      <p style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "0.9cqw", marginTop: "2.4cqw", fontSize: "2.6cqw", color: "#8b949e" }}>
        Less
        {CONTRIB.map((c) => (
          <span key={c} style={{ width: "2.6cqw", height: "2.6cqw", borderRadius: "0.5cqw", background: c }} />
        ))}
        More
      </p>
    </div>
  );
}

/** A building's card, laid out as the app's (home-client's building card), in container units. */
function ProfilePanel({ index, b }: { index: number; b: CityBuilding }) {
  const level = b.xp_level ?? 1;
  const tier = tierFromLevel(level);
  const rank = rankFromLevel(level);
  const progress = levelProgress(b.xp_total ?? 0);
  const xpNow = (b.xp_total ?? 0) - xpForLevel(level);
  const xpNeed = xpForLevel(level + 1) - xpForLevel(level);
  const stats = [
    ["Rank", `#${b.rank}`],
    ["Contribs", b.contributions.toLocaleString("en-US")],
    ["Repos", b.public_repos.toLocaleString("en-US")],
    ["Stars", b.total_stars.toLocaleString("en-US")],
    ["+1s", (b.kudos_count ?? 0).toLocaleString("en-US")],
    ["Visits", (b.visit_count ?? 0).toLocaleString("en-US")],
  ];
  return (
    <div
      data-panel={index}
      data-reel-box="profile"
      className="absolute border-border bg-bg-raised font-pixel"
      style={{ left: "50%", top: "24%", width: "72cqw", borderWidth: "0.8cqw", opacity: 0, transform: "translate(-50%, 0)" }}
    >
      <div style={{ padding: "3.4cqw 3.8cqw 2.6cqw", background: `linear-gradient(135deg, ${tier.color}1c 0%, ${tier.color}06 55%, transparent 100%)` }}>
        <div className="flex items-center" style={{ gap: "3cqw" }}>
          {b.avatar_url && (
            <div className="shrink-0" style={{ border: `0.5cqw solid ${tier.color}`, padding: "0.4cqw", background: `${tier.color}14` }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a GitHub avatar, drawn as it is */}
              <img src={b.avatar_url} alt="" className="border-border" style={{ width: "11cqw", height: "11cqw", borderWidth: "0.25cqw", imageRendering: "pixelated", display: "block" }} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            {b.name && (
              <p className="truncate text-cream" style={{ fontSize: "3.8cqw", lineHeight: 1.2 }}>
                {b.name}
              </p>
            )}
            <p className="truncate text-muted" style={{ fontSize: "2.8cqw", lineHeight: 1.4 }}>
              @{b.login}
            </p>
          </div>
        </div>
      </div>
      <div className="flex items-center" style={{ gap: "2.6cqw", margin: "0.4cqw 3.8cqw 2.6cqw" }}>
        <span className="flex shrink-0 items-center justify-center font-bold" style={{ width: "8cqw", height: "8cqw", border: `0.5cqw solid ${tier.color}`, color: tier.color, background: `${tier.color}10`, fontSize: "3.2cqw" }}>
          {level}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline" style={{ gap: "1.4cqw" }}>
            <span className="truncate font-bold text-cream" style={{ fontSize: "2.8cqw" }}>
              Lv {level} · {rank.title}
            </span>
            <span className="shrink-0 font-bold" style={{ fontSize: "2cqw", padding: "0.2cqw 1cqw", background: `${tier.color}22`, color: tier.color, letterSpacing: "0.1em" }}>
              {tier.name.toUpperCase()}
            </span>
          </div>
          <div className="bg-border" style={{ marginTop: "1cqw", height: "1.4cqw" }}>
            <div className="h-full" style={{ width: `${Math.max(2, Math.round(progress * 100))}%`, background: tier.color }} />
          </div>
          <p className="text-dim" style={{ marginTop: "0.6cqw", fontSize: "2cqw" }}>
            {xpNow.toLocaleString("en-US")} / {xpNeed.toLocaleString("en-US")} XP
          </p>
        </div>
      </div>
      <div className="grid grid-cols-3 border-border/50" style={{ gap: "0.25cqw", margin: "0 3.8cqw 3.8cqw", borderWidth: "0.25cqw", background: "color-mix(in srgb, var(--color-border) 30%, transparent)" }}>
        {stats.map(([k, v]) => (
          <div key={k} className="bg-bg-card text-center" style={{ padding: "2cqw" }}>
            <div className="text-lime" style={{ fontSize: "3.4cqw" }}>
              {v}
            </div>
            <div className="text-muted" style={{ fontSize: "2.2cqw", marginTop: "0.6cqw" }}>
              {k}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** A panel by kind: a list (bars, roster), a counter, a poster, a building's card or the profile card. */
function Panel({
  panel,
  index,
  photoOf,
  buildingOf,
  big,
  plates,
}: {
  panel: ReelPanel;
  index: number;
  /** Under a headline: lists read bigger. */
  big: boolean;
  /** The channel's look: a counter is its terminal line. */
  plates: boolean;
  photoOf: (login: string) => string | null;
  buildingOf: (login: string) => CityBuilding | null;
}) {
  if (panel.kind === "bars" || panel.kind === "roster") return <ListPanel panel={panel} index={index} photoOf={photoOf} big={big} />;
  if (panel.kind === "comment") return <CommentPanel index={index} handle={panel.handle} />;
  if (panel.kind === "contrib") return <ContribPanel index={index} />;
  if (panel.kind === "points") return <PointsPanel index={index} panel={panel} />;
  if (panel.kind === "score") return <ScorePanel index={index} panel={panel} />;
  if (panel.kind === "phone") return <PhonePanel index={index} panel={panel} />;
  if (panel.kind === "card") return <CardPanel index={index} panel={panel} />;
  if (panel.kind === "counter" && plates)
    return (
      <div data-panel={index} data-reel-box="counter" className="absolute font-pixel uppercase" style={{ left: "50%", transform: "translateX(-50%)", top: "17%", opacity: 0 }}>
        <p style={{ ...PLATE, fontSize: "7.4cqw", whiteSpace: "nowrap" }}>
          <span style={{ color: BRAND.green, marginRight: "0.6em" }}>&gt;</span>
          <span data-n style={{ color: BRAND.green }}>1</span>
          {` ${panel.label}`}
          <span style={{ display: "inline-block", width: "0.5em", height: "0.85em", marginLeft: "0.3em", verticalAlign: "-0.08em", background: BRAND.green }} />
        </p>
      </div>
    );
  if (panel.kind === "place" && plates) return <PlatesPlace index={index} panel={panel} photo={photoOf(panel.login)} />;
  if (panel.kind === "place") return <PlacePanel index={index} panel={panel} photo={photoOf(panel.login)} />;
  if (panel.kind === "profile") {
    const b = buildingOf(panel.login);
    return b ? <ProfilePanel index={index} b={b} /> : null;
  }
  if (panel.kind === "counter")
    return (
      <div data-panel={index} data-reel-box="counter" className="absolute text-center font-pixel uppercase text-white" style={{ left: "50%", transform: "translateX(-50%)", top: "15%", opacity: 0, ...outline(1.4) }}>
        <p className="text-lime" style={{ fontSize: "16cqw", lineHeight: 1 }}>
          <span data-n>1</span>
        </p>
        <p style={{ fontSize: "4.4cqw", lineHeight: 1, marginTop: "1.6cqw" }}>{panel.label}</p>
      </div>
    );
  const avatar = (login: string, size: number) => `https://avatars.githubusercontent.com/${login}?s=${size}`;
  if (panel.kind === "poster")
    return (
      <div
        data-panel={index}
        data-reel-box="poster"
        className="absolute font-pixel uppercase"
        style={{ left: "50%", top: "15%", width: "50cqw", opacity: 0, background: "#e8dcc8", color: "#2a1d12", border: "1.2cqw solid #2a1d12", boxShadow: "0 0 0 0.8cqw #e8dcc8", padding: "2.8cqw 2.6cqw 2.6cqw", textAlign: "center", transformOrigin: "50% 40%" }}
      >
        <p style={{ fontSize: "6cqw", lineHeight: 1 }}>{panel.title}</p>
        {/* eslint-disable-next-line @next/next/no-img-element -- a GitHub avatar, drawn as it is */}
        <img alt="" src={avatar(panel.login, 300)} style={{ display: "block", width: "26cqw", height: "26cqw", margin: "2.2cqw auto", border: "0.8cqw solid #2a1d12", filter: "sepia(0.9) contrast(1.15)" }} />
        <p style={{ fontSize: "4.8cqw", lineHeight: 1, textTransform: "none" }}>{panel.login}</p>
        <p style={{ fontSize: "4.4cqw", lineHeight: 1, marginTop: "2.6cqw", padding: "1.4cqw 0", background: "#2a1d12", color: "#e8dcc8" }}>{panel.when}</p>
        <p style={{ fontSize: "3cqw", lineHeight: 1, marginTop: "1.6cqw" }}>{panel.where}</p>
      </div>
    );
  if (panel.kind === "follow" && plates)
    return (
      <div
        data-panel={index}
        data-hard
        data-reel-box="follow"
        className="font-pixel uppercase"
        style={{ position: "absolute", left: "50%", top: big ? "27%" : "17%", width: "70cqw", boxSizing: "border-box", transform: "translateX(-50%)", opacity: 0, background: BRAND.bg, color: BRAND.ink, boxShadow: HARD, border: `0.4cqw solid ${BRAND.dot}`, padding: "4cqw" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "3cqw" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- the account's photo */}
          <img alt="" src={panel.avatar.includes("/") ? `/api/reels/file/${panel.avatar}` : `https://avatars.githubusercontent.com/${panel.avatar}?s=300`} style={{ width: "14cqw", height: "14cqw", border: `0.6cqw solid ${BRAND.green}`, flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: "3.4cqw", lineHeight: 1.1, textTransform: "none", whiteSpace: "nowrap" }}>
              <span style={{ color: BRAND.green, marginRight: "0.4em" }}>&gt;</span>@{panel.handle}
            </p>
            <p style={{ fontSize: "3.4cqw", lineHeight: 1.2, marginTop: "2cqw", color: BRAND.muted }}>
              <span data-followers data-before={panel.followers} data-after={(() => { const v = Number(panel.followers.replace(/\D/g, "")); return Number.isFinite(v) ? (v + 1).toLocaleString("pt-BR") : panel.followers; })()} style={{ color: BRAND.ink }}>
                {panel.followers}
              </span>{" "}
              seguidores
            </p>
          </div>
        </div>
        <p style={{ fontSize: "3.2cqw", lineHeight: 1.35, marginTop: "3cqw", color: BRAND.muted }}>{panel.bio.join(" ")}</p>
        <p data-follow style={{ marginTop: "3.4cqw", textAlign: "center", fontSize: "5cqw", padding: "1.6cqw 0", background: BRAND.green, color: BRAND.onGreen, boxShadow: HARD }}>
          Seguir
        </p>
      </div>
    );
  // The account's own Instagram profile, as the app draws it in dark mode.
  const sans = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  const plusOne = (n: string) => {
    const v = Number(n.replace(/\D/g, ""));
    return Number.isFinite(v) ? (v + 1).toLocaleString("pt-BR") : n;
  };
  return (
    <div
      data-panel={index}
      data-reel-box="follow"
      // Under a headline (it asks for the follow), the card sits lower.
      style={{ position: "absolute", left: "50%", top: big ? "27%" : "15%", width: "72cqw", transformOrigin: "50% 0", opacity: 0, background: "#000", color: "#f5f5f5", border: "0.3cqw solid #262626", borderRadius: "3cqw", padding: "4cqw", fontFamily: sans, boxShadow: "0 2cqw 6cqw rgba(0,0,0,0.6)" }}
    >
      <p style={{ fontSize: "4.6cqw", fontWeight: 700, lineHeight: 1 }}>{panel.handle}</p>
      <div style={{ display: "flex", alignItems: "center", gap: "4cqw", marginTop: "3.4cqw" }}>
        <div style={{ width: "19cqw", height: "19cqw", borderRadius: "50%", background: "#5dd67a", overflow: "hidden", flexShrink: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- the account's GitHub photo */}
          <img alt="" src={panel.avatar.includes("/") ? `/api/reels/file/${panel.avatar}` : avatar(panel.avatar, 300)} style={{ display: "block", width: "100%", height: "100%" }} />
        </div>
        <div style={{ display: "flex", flex: 1, justifyContent: "space-between", textAlign: "center" }}>
          {(
            [
              [panel.posts, "posts", false],
              [panel.followers, "seguidores", true],
              [panel.following, "seguindo", false],
            ] as const
          ).map(([n, label, live]) => (
            <div key={label}>
              <p data-followers={live || undefined} data-before={live ? n : undefined} data-after={live ? plusOne(n) : undefined} style={{ fontSize: "4.2cqw", fontWeight: 700, lineHeight: 1 }}>
                {n}
              </p>
              <p style={{ fontSize: "2.8cqw", lineHeight: 1, marginTop: "1cqw" }}>{label}</p>
            </div>
          ))}
        </div>
      </div>
      <p style={{ fontSize: "3.2cqw", fontWeight: 600, marginTop: "3cqw", lineHeight: 1.2 }}>{panel.name}</p>
      <p style={{ fontSize: "3cqw", lineHeight: 1.35, marginTop: "0.8cqw" }}>
        {panel.bio.map((l, i) => (
          <span key={i} style={{ display: "block" }}>
            {l}
          </span>
        ))}
      </p>
      <p style={{ fontSize: "3cqw", fontWeight: 600, marginTop: "0.8cqw", color: "#e0f1ff" }}>🔗 {panel.link}</p>
      <div style={{ display: "flex", gap: "1.6cqw", marginTop: "3cqw" }}>
        <span data-follow style={{ flex: 1, textAlign: "center", padding: "2.2cqw 0", borderRadius: "2cqw", fontSize: "3.4cqw", fontWeight: 600, background: "#0095f6", color: "#fff" }}>
          Seguir
        </span>
        <span style={{ flex: 1, textAlign: "center", padding: "2.2cqw 0", borderRadius: "2cqw", fontSize: "3.4cqw", fontWeight: 600, background: "#262626", color: "#f5f5f5" }}>Mensagem</span>
      </div>
    </div>
  );
}

/** The list panels' markup: white outlined type and solid bars, no box (dark bands were rejected). */
function ListPanel({ panel, index, photoOf, big = false }: { panel: Extract<ReelPanel, { kind: "bars" | "roster" }>; index: number; photoOf: (login: string) => string | null; big?: boolean }) {
  const type = "font-pixel uppercase text-white whitespace-nowrap";
  // Under a headline a short list is the beat's subject: it reads bigger, lower, on the dimmed scene.
  const k = big ? 1.45 : 1;
  const u = (n: number) => `${n * k}cqw`;
  const max = panel.kind === "bars" ? Math.max(...panel.rows.map((r) => (typeof r.value === "number" ? r.value : Number(String(r.value).replace(/\D/g, "")) || 0)), 1) : 1;
  return (
    <div
      data-panel={index}
      data-reel-box={panel.kind}
      className="absolute flex flex-col"
      style={{ left: "50%", transform: "translateX(-50%)", top: big ? "29%" : "26%", width: "72%", gap: u(1.2), opacity: 0, ...outline(1.2 * k) }}
    >
      {panel.title && (
        <p className={`${type} text-center`} style={{ fontSize: u(4.2), lineHeight: 1, marginBottom: u(0.8) }}>
          <Lit text={panel.title} />
        </p>
      )}
      {panel.kind === "bars"
        ? panel.rows.map((r, k) => {
            const v = typeof r.value === "number" ? r.value : Number(String(r.value).replace(/\D/g, "")) || 0;
            return (
              <div key={k} className="flex items-center" style={{ gap: u(2), height: u(5.6) }}>
                <span className={type} style={{ fontSize: u(4.4), width: u(10), color: r.lit ? "var(--color-lime)" : undefined }}>
                  {r.label}
                </span>
                <div className="relative h-full flex-1">
                  <div
                    data-bar
                    className="absolute inset-y-0 left-0"
                    style={{ width: `${(v / max) * 100}%`, background: r.lit ? "var(--color-lime)" : "var(--color-cream)", transformOrigin: "0 50%", transform: "scaleX(0)", boxShadow: `0 0 0 ${u(0.5)} #000` }}
                  />
                </div>
                <span className={type} style={{ fontSize: u(4.4), width: u(12), textAlign: "right", color: r.lit ? "var(--color-lime)" : undefined }}>
                  {typeof r.value === "number" ? r.value.toLocaleString("pt-BR") : r.value}
                </span>
              </div>
            );
          })
        : panel.rows.map((r, n) => {
            const photo = photoOf(r.login);
            return (
              <div key={n} data-row={n} className="flex items-center" style={{ gap: u(2.4), height: u(4.6), display: "none" }}>
                <span className={type} style={{ fontSize: u(4.4), width: u(9), color: r.lit ? "var(--color-lime)" : undefined }}>
                  {r.tag}
                </span>
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo} alt="" style={{ width: u(4.6), height: u(4.6), border: "0.5cqw solid #000", flexShrink: 0 }} />
                ) : (
                  <span style={{ width: u(4.6), height: u(4.6), flexShrink: 0 }} />
                )}
                <span className={`${type} min-w-0 truncate`} style={{ fontSize: u(4.4), textTransform: "none", color: r.lit ? "var(--color-lime)" : undefined }}>
                  {r.login}
                </span>
              </div>
            );
          })}
    </div>
  );
}

/** A silhouette with a "?" on its head: the balloon over an empty lot, the viewer's building to be. */
const GHOST_PIXELS: [number, number, number][] = [
  [3, 0, 4],
  [2, 1, 6],
  [2, 2, 6],
  [2, 3, 6],
  [3, 4, 4],
  [2, 6, 6],
  [1, 7, 8],
  [0, 8, 10],
  [0, 9, 10],
];

/** One balloon: a GitHub photo, a plate, or (an example with no plate) the "?" silhouette; then its office badges. */
function Balloon({ b, index, photoOf }: { b: ReelBalloon; index: number; photoOf: (login: string) => string | null }) {
  const photo = b.target !== "example" && !b.plate ? photoOf(b.target.login) : null;
  const ghost = b.target === "example" && !b.plate;
  return (
      <div data-balloon={index} data-reel-box="balloon" className="absolute font-pixel uppercase" style={{ opacity: 0, transform: "translate(-50%, -100%)", paddingBottom: "2.4cqw" }}>
        <div style={{ display: "grid", justifyItems: "center", alignItems: "end" }}>
          <div
            data-tag="plate"
            className="bg-bg text-cream"
            style={{
              gridArea: "1 / 1",
              border: `0.6cqw solid ${ghost ? "var(--color-lime)" : "var(--color-border)"}`,
              padding: photo ? "0.6cqw" : "1.6cqw 2.6cqw",
              fontSize: "4.6cqw",
              lineHeight: 1,
              textTransform: "none",
              whiteSpace: "nowrap",
            }}
          >
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt="" style={{ width: "13cqw", height: "13cqw", display: "block", imageRendering: "pixelated" }} />
            ) : ghost ? (
              <svg viewBox="0 0 10 10" shapeRendering="crispEdges" style={{ width: "13cqw", height: "13cqw", display: "block" }}>
                {GHOST_PIXELS.map(([x, y, w]) => (
                  <rect key={`${x}-${y}`} x={x} y={y} width={w} height={1} fill="var(--color-lime-dark)" />
                ))}
                <text x="5" y="4.1" textAnchor="middle" fontFamily="Silkscreen, monospace" fontSize="3.6" fill="var(--color-bg)">
                  ?
                </text>
              </svg>
            ) : (
              (b.plate ?? "")
            )}
          </div>
          {b.badges.map((b, i) => {
            const look = BADGES[b.kind as BadgeKind];
            return (
              <div
                key={i}
                data-tag={String(i)}
                className="bg-bg"
                style={{
                  gridArea: "1 / 1",
                  display: "flex",
                  alignItems: "center",
                  gap: "2.2cqw",
                  border: `0.7cqw solid ${look.color}`,
                  padding: "2cqw 2.8cqw 2cqw 2.2cqw",
                  opacity: 0,
                  transformOrigin: "50% 100%",
                  whiteSpace: "nowrap",
                }}
              >
                <svg viewBox="0 0 8 8" shapeRendering="crispEdges" style={{ width: "9cqw", height: "9cqw", flexShrink: 0 }}>
                  {look.pixels.map(([x, y, w, h]) => (
                    <rect key={`${x}-${y}`} x={x} y={y} width={w} height={h} fill={look.color} />
                  ))}
                </svg>
                <div>
                  <p style={{ fontSize: "6.4cqw", lineHeight: 1, color: look.color }}>{look.title}</p>
                  <p className="text-muted" style={{ fontSize: "3cqw", lineHeight: 1, marginTop: "1.6cqw", textTransform: "none" }}>
                    {b.sub}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
        {/* The tail, pointing at the roof. */}
        <span
          className="absolute bg-border"
          style={{ left: "50%", transform: "translateX(-50%)", bottom: "0.4cqw", width: "2.6cqw", height: "2.2cqw", clipPath: "polygon(0 0, 100% 0, 50% 100%)" }}
        />
      </div>
  );
}

export default function ReelOverlay({
  clock,
  reel,
  header,
  balloon,
  photoOf,
  buildingOf = () => null,
}: {
  clock: FilmClock;
  reel: Reel;
  header: ReelSpec["header"] | undefined;
  balloon: RefObject<HTMLDivElement | null>;
  /** A login's GitHub photo, for a balloon with no plate. */
  photoOf: (login: string) => string | null;
  /** A login's building, for its card (null where the world has no such building). */
  buildingOf?: (login: string) => CityBuilding | null;
}) {
  const line = useRef<HTMLParagraphElement>(null);
  const rule = useRef<HTMLDivElement>(null);
  const cta = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);

  // A headline line wider than the safe zone shrinks to fit it (66%, so its pop-in stays inside 72%): a long word never runs into the rail.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const fit = () => {
      const max = el.clientWidth * 0.66;
      el.querySelectorAll<HTMLElement>("[data-headline] p").forEach((p) => {
        const size = p.dataset.fs ?? HEADLINE_SIZE[p.dataset.size as keyof typeof HEADLINE_SIZE];
        p.style.fontSize = size;
        // A typed plate is measured whole: a copy with every character shown.
        const full = p.cloneNode(true) as HTMLElement;
        full.querySelectorAll<HTMLElement>("[data-ch]").forEach((c) => (c.style.display = ""));
        Object.assign(full.style, { position: "absolute", visibility: "hidden", left: "0", top: "0" });
        p.parentElement!.appendChild(full);
        const w = full.scrollWidth;
        full.remove();
        if (w > max) p.style.fontSize = `${(parseFloat(size) * max) / w}cqw`;
      });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    void document.fonts?.ready.then(fit);
    return () => ro.disconnect();
  }, [reel]);

  useEffect(() => {
    let raf = 0;
    let shown = -1;
    const plates = reel.look === "plates";
    const draw = () => {
      const t = beatOf(clock);
      const i = reel.lines.findIndex((l) => t >= l.from && t < l.to);
      // While a card is up it is the frame: the captions, the header and the headline step aside.
      const card = reel.panels.some((p) => p.kind === "card" && t >= p.from && t < p.to);
      const el = line.current;
      if (el) {
        if (i !== shown) {
          shown = i;
          el.replaceChildren(
            ...(i < 0
              ? []
              : reel.lines[i].words.map((w) => {
                  const s = document.createElement("span");
                  s.textContent = w.text;
                  if (w.lit) s.style.color = plates ? BRAND.green : "var(--color-lime)";
                  return s;
                })),
          );
        }
        if (i >= 0) {
          [...el.children].forEach((s, k) => {
            (s as HTMLElement).style.display = t >= reel.lines[i].words[k].at ? "" : "none";
          });
        }
        // A line with nothing captioned yet (a hidden line, or before its first word) shows no empty plate.
        const none = i < 0 || card || !reel.lines[i].words.some((w) => t >= w.at);
        el.style.opacity = none ? "0" : "1";
      }
      const c = Math.min(1, Math.max(0, (t - reel.ctaAt) / FADE));
      if (rule.current) rule.current.style.opacity = String(card ? 0 : 1 - c);
      if (cta.current) cta.current.style.opacity = String(card ? 0 : c);
      if (root.current) {
        drawPanels(root.current, reel.panels, t);
        // Behind a card or a list, the scene dims so it and the words over it read.
        const dim = root.current.querySelector<HTMLElement>("[data-dim]");
        if (dim) {
          const k = Math.max(0, ...reel.panels.map((p) => (p.kind === "comment" || p.kind === "contrib" || p.kind === "roster" || p.kind === "bars" || p.kind === "place" || p.kind === "points" || p.kind === "phone" ? clamp(Math.min((t - p.from) / 0.25, (p.to + 0.3 - t) / 0.3)) : 0)));
          dim.style.opacity = String(k * DIM);
        }
        // Each beat pops in at its moment (a little big, then settles) and gives way to the next.
        reel.headline.forEach((h, k) => {
          const b = root.current!.querySelector<HTMLElement>(`[data-headline="${k}"]`);
          if (!b) return;
          const on = t >= h.from && t < h.to && !card;
          b.style.opacity = on ? "1" : "0";
          if (!on) return;
          if (!plates) {
            b.style.transform = `translateX(-50%) scale(${1 + 0.06 * (1 - ease((t - h.from) / 0.18))})`;
            return;
          }
          // Typed in hard steps, the cursor solid while it types and blinking after.
          const n = Math.floor((t - h.from) * HEAD_CPS);
          const total = b.querySelectorAll("[data-ch]").length;
          const blink = n < total || Math.floor((t - h.from - total / HEAD_CPS) * 2.5) % 2 === 0;
          const rows = [...b.querySelectorAll<HTMLElement>("p")];
          rows.forEach((pl, q) => {
            const chars = [...pl.querySelectorAll<HTMLElement>("[data-ch]")];
            const first = Number(chars[0]?.dataset.ch ?? 0);
            const last = first + chars.length;
            pl.style.visibility = q === 0 || n > first ? "" : "hidden";
            chars.forEach((ch) => (ch.style.display = Number(ch.dataset.ch) < n ? "" : "none"));
            // The cursor sits on the line being typed, and stays on the last one once done.
            const here = (n >= first && n < last) || (q === rows.length - 1 && n >= last);
            const cursor = pl.querySelector<HTMLElement>("[data-cursor]");
            if (cursor) cursor.style.visibility = here && blink ? "" : "hidden";
          });
        });
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [clock, reel]);

  const type = "absolute text-center font-pixel uppercase text-white whitespace-nowrap";
  const plates = reel.look === "plates";
  const safe = { left: "50%", transform: "translateX(-50%)" } as const;

  return (
    <div ref={root} className="pointer-events-none absolute inset-0">
      <div data-dim className="absolute inset-0" style={{ background: "#000", opacity: 0 }} />
      {reel.panels.map((p, i) => (
        <Panel key={i} panel={p} index={i} photoOf={photoOf} buildingOf={buildingOf} big={reel.headline.length > 0} plates={plates} />
      ))}
      {reel.headline.map((h, k) =>
        plates ? (
          <div key={k} data-headline={k} data-reel-box="header" className={type} style={{ ...safe, top: "17%", opacity: 0 }}>
            <PlateLines lines={h.lines} />
          </div>
        ) : (
          <div key={k} data-headline={k} data-reel-box="header" className={type} style={{ ...safe, top: "16%", opacity: 0, transformOrigin: "50% 0", ...outline(1.4) }}>
            <HeaderLines lines={h.lines} sizes={HEADLINE_SIZE} />
          </div>
        ),
      )}
      {header && (
        <div className={type} style={{ ...safe, top: "15%", ...(plates ? {} : outline(1.4)) }}>
          <div ref={rule} data-reel-box="header">
            <HeaderLines lines={header.rule} plates={plates} />
          </div>
          <div ref={cta} data-reel-box="header" className="absolute inset-0 flex flex-col items-center justify-center" style={{ opacity: 0 }}>
            <HeaderLines lines={header.cta} plates={plates} />
          </div>
        </div>
      )}

      <div ref={balloon}>
        {reel.balloons.map((b, i) => (
          <Balloon key={i} b={b} index={i} photoOf={photoOf} />
        ))}
        {/* Photos the rig pins over capitals on the map (it moves and pops them each frame). */}
        {reel.pins.flatMap((g, i) =>
          g.rows.map((r, k) => (
            // eslint-disable-next-line @next/next/no-img-element -- a GitHub avatar, drawn as it is
            <img
              key={`${i}-${k}`}
              data-pin={`${i}-${k}`}
              alt=""
              src={photoOf(r.login) ?? `https://avatars.githubusercontent.com/${r.login}?s=96`}
              className="absolute"
              style={{ width: "5.6cqw", height: "5.6cqw", border: "0.5cqw solid #000", outline: "0.35cqw solid var(--color-lime)", opacity: 0, transform: "translate(-50%, -100%)" }}
            />
          )),
        )}
      </div>

      <p
        ref={line}
        data-reel-box="captions"
        className={`${type} flex flex-wrap justify-center`}
        // Under a headline the captions are the small spoken line; alone they carry the reel.
        style={
          plates
            ? // His Captions piece: yellow, no plate, a dark outline and the kit's hard shadow.
              { ...safe, top: "54%", width: "72%", whiteSpace: "normal", gap: "0 2cqw", fontSize: "6cqw", lineHeight: 1.3, opacity: 0, color: CAPTION_YELLOW, textShadow: CAPTION_SHADOW }
            : { ...safe, top: "55%", width: "72%", whiteSpace: "normal", gap: reel.headline.length ? "0 2cqw" : "0 3cqw", fontSize: reel.headline.length ? "6cqw" : "7cqw", lineHeight: 1.3, opacity: 0, ...outline(1.8) }
        }
      />
    </div>
  );
}
