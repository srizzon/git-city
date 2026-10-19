"use client";

import { useEffect, useRef, type RefObject } from "react";
import { beatOf, type FilmClock } from "@trailer-kit/clock";
import type { Reel, ReelBalloon, ReelPanel } from "@/lib/reel/film";
import type { ReelSpec } from "@/lib/reel/spec";

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

const FADE = 0.15; // s

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
    let r: DOMRect;
    if (el.dataset.reelBox === "balloon") r = el.getBoundingClientRect();
    else {
      // The text itself, not its box: a caption line's box is wider than its words.
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

const SIZE = { big: "7.4cqw", small: "4.6cqw" } as const;
const outline = (w: number) => ({
  WebkitTextStroke: `${w}cqw #000`,
  paintOrder: "stroke fill" as const,
  textShadow: `0 ${w / 2}cqw 0 #000`,
});

function HeaderLines({ lines }: { lines: ReelSpec["header"]["rule"] }) {
  return (
    <>
      {lines.map((l, i) => (
        <p key={i} style={{ fontSize: SIZE[l.size], lineHeight: 1, marginTop: i ? "1.8cqw" : 0, textTransform: l.plain ? "none" : undefined }}>
          <Lit text={l.text} />
        </p>
      ))}
    </>
  );
}

const ease = (u: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, u)), 3);

/**
 * Animates the panels each frame: a panel fades in from its moment and out
 * 0.3s after its end; bars grow to their value one after another; a roster
 * shows its rows a page at a time, each row sliding in after the one above.
 */
function drawPanels(root: HTMLElement, panels: readonly ReelPanel[], t: number) {
  panels.forEach((p, i) => {
    const el = root.querySelector<HTMLElement>(`[data-panel="${i}"]`);
    if (!el) return;
    const on = t >= p.from && t < p.to + 0.3;
    el.style.opacity = on ? String(Math.min(1, (t - p.from) / FADE, (p.to + 0.3 - t) / 0.3)) : "0";
    if (!on) return;
    const local = t - p.from;
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

/** The panels' markup: white outlined type and solid bars, no box (dark bands were rejected). */
function Panel({ panel, index, photoOf }: { panel: ReelPanel; index: number; photoOf: (login: string) => string | null }) {
  const type = "font-pixel uppercase text-white whitespace-nowrap";
  const max = panel.kind === "bars" ? Math.max(...panel.rows.map((r) => (typeof r.value === "number" ? r.value : Number(String(r.value).replace(/\D/g, "")) || 0)), 1) : 1;
  return (
    <div
      data-panel={index}
      data-reel-box={panel.kind}
      className="absolute flex flex-col"
      style={{ left: "50%", transform: "translateX(-50%)", top: "26%", width: "72%", gap: "1.2cqw", opacity: 0, ...outline(1.2) }}
    >
      {panel.title && (
        <p className={`${type} text-center`} style={{ fontSize: "4.2cqw", lineHeight: 1, marginBottom: "0.8cqw" }}>
          <Lit text={panel.title} />
        </p>
      )}
      {panel.kind === "bars"
        ? panel.rows.map((r, k) => {
            const v = typeof r.value === "number" ? r.value : Number(String(r.value).replace(/\D/g, "")) || 0;
            return (
              <div key={k} className="flex items-center" style={{ gap: "2cqw", height: "5.6cqw" }}>
                <span className={type} style={{ fontSize: "4.4cqw", width: "10cqw", color: r.lit ? "var(--color-lime)" : undefined }}>
                  {r.label}
                </span>
                <div className="relative h-full flex-1">
                  <div
                    data-bar
                    className="absolute inset-y-0 left-0"
                    style={{ width: `${(v / max) * 100}%`, background: r.lit ? "var(--color-lime)" : "var(--color-cream)", transformOrigin: "0 50%", transform: "scaleX(0)", boxShadow: "0 0 0 0.5cqw #000" }}
                  />
                </div>
                <span className={type} style={{ fontSize: "4.4cqw", width: "12cqw", textAlign: "right", color: r.lit ? "var(--color-lime)" : undefined }}>
                  {typeof r.value === "number" ? r.value.toLocaleString("pt-BR") : r.value}
                </span>
              </div>
            );
          })
        : panel.rows.map((r, n) => {
            const photo = photoOf(r.login);
            return (
              <div key={n} data-row={n} className="flex items-center" style={{ gap: "2.4cqw", height: "4.6cqw", display: "none" }}>
                <span className={type} style={{ fontSize: "4.4cqw", width: "9cqw", color: r.lit ? "var(--color-lime)" : undefined }}>
                  {r.tag}
                </span>
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo} alt="" style={{ width: "4.6cqw", height: "4.6cqw", border: "0.5cqw solid #000", flexShrink: 0 }} />
                ) : (
                  <span style={{ width: "4.6cqw", height: "4.6cqw", flexShrink: 0 }} />
                )}
                <span className={`${type} min-w-0 truncate`} style={{ fontSize: "4.4cqw", textTransform: "none", color: r.lit ? "var(--color-lime)" : undefined }}>
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
}: {
  clock: FilmClock;
  reel: Reel;
  header: ReelSpec["header"];
  balloon: RefObject<HTMLDivElement | null>;
  /** A login's GitHub photo, for a balloon with no plate. */
  photoOf: (login: string) => string | null;
}) {
  const line = useRef<HTMLParagraphElement>(null);
  const rule = useRef<HTMLDivElement>(null);
  const cta = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    let shown = -1;
    const draw = () => {
      const t = beatOf(clock);
      const i = reel.lines.findIndex((l) => t >= l.from && t < l.to);
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
                  if (w.lit) s.style.color = "var(--color-lime)";
                  return s;
                })),
          );
        }
        if (i >= 0) {
          [...el.children].forEach((s, k) => {
            (s as HTMLElement).style.display = t >= reel.lines[i].words[k].at ? "" : "none";
          });
        }
        el.style.opacity = i < 0 ? "0" : "1";
      }
      const c = Math.min(1, Math.max(0, (t - reel.ctaAt) / FADE));
      if (rule.current) rule.current.style.opacity = String(1 - c);
      if (cta.current) cta.current.style.opacity = String(c);
      if (root.current) drawPanels(root.current, reel.panels, t);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [clock, reel]);

  const type = "absolute text-center font-pixel uppercase text-white whitespace-nowrap";
  const safe = { left: "50%", transform: "translateX(-50%)" } as const;

  return (
    <div ref={root} className="pointer-events-none absolute inset-0">
      {reel.panels.map((p, i) => (
        <Panel key={i} panel={p} index={i} photoOf={photoOf} />
      ))}
      <div className={type} style={{ ...safe, top: "15%", ...outline(1.4) }}>
        <div ref={rule} data-reel-box="header">
          <HeaderLines lines={header.rule} />
        </div>
        <div ref={cta} data-reel-box="header" className="absolute inset-0 flex flex-col items-center justify-center" style={{ opacity: 0 }}>
          <HeaderLines lines={header.cta} />
        </div>
      </div>

      <div ref={balloon}>
        {reel.balloons.map((b, i) => (
          <Balloon key={i} b={b} index={i} photoOf={photoOf} />
        ))}
      </div>

      <p
        ref={line}
        data-reel-box="captions"
        className={`${type} flex flex-wrap justify-center`}
        style={{ ...safe, top: "55%", width: "72%", whiteSpace: "normal", gap: "0 3cqw", fontSize: "7cqw", lineHeight: 1.3, opacity: 0, ...outline(1.8) }}
      />
    </div>
  );
}
