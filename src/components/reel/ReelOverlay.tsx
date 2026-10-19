"use client";

import { useEffect, useRef, type RefObject } from "react";
import { beatOf, type FilmClock } from "@trailer-kit/clock";
import type { Reel } from "@/lib/reel/film";
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
 * Moves the balloon (stage percent) and shows its plate until the first
 * badge's moment, then each badge as its moment comes (popping in over
 * 0.4s), the next one replacing it. null hides it.
 */
export function placeBalloon(
  el: HTMLDivElement | null,
  at: { left: number; top: number; opacity: number; badges: number[]; t: number } | null,
) {
  if (!el) return;
  el.style.opacity = at ? String(at.opacity) : "0";
  if (!at) return;
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
  // The film's balloons share one element: its badges are the first balloon's that has any.
  const first = reel.balloons[0] ?? null;

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
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [clock, reel]);

  const type = "absolute text-center font-pixel uppercase text-white whitespace-nowrap";
  const safe = { left: "50%", transform: "translateX(-50%)" } as const;
  const photo = first && first.target !== "example" && !first.plate ? photoOf(first.target.login) : null;

  return (
    <div className="pointer-events-none absolute inset-0">
      <div className={type} style={{ ...safe, top: "15%", ...outline(1.4) }}>
        <div ref={rule}>
          <HeaderLines lines={header.rule} />
        </div>
        <div ref={cta} className="absolute inset-0 flex flex-col items-center justify-center" style={{ opacity: 0 }}>
          <HeaderLines lines={header.cta} />
        </div>
      </div>

      {first && (
        <div ref={balloon} className="absolute font-pixel uppercase" style={{ opacity: 0, transform: "translate(-50%, -100%)", paddingBottom: "2.4cqw" }}>
          <div style={{ display: "grid", justifyItems: "center", alignItems: "end" }}>
            <div
              data-tag="plate"
              className="border-border bg-bg text-cream"
              style={{
                gridArea: "1 / 1",
                borderWidth: "0.6cqw",
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
              ) : (
                (first.plate ?? "")
              )}
            </div>
            {first.badges.map((b, i) => {
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
      )}

      <p
        ref={line}
        className={`${type} flex flex-wrap justify-center`}
        style={{ ...safe, top: "55%", width: "76%", whiteSpace: "normal", gap: "0 3cqw", fontSize: "7cqw", lineHeight: 1.3, opacity: 0, ...outline(1.8) }}
      />
    </div>
  );
}
