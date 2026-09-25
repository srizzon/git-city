"use client";

import { useEffect, useRef } from "react";

// Everything over the town intro, shot by shot:
//   0–0.6s     fade in from black, letterbox bars already in (this is a cutscene)
//   approach   nothing: the arch carries the name
//   crossing   the title lands in the bottom bar: a lime rule draws out from
//              the center, the label, the name letter by letter, then the
//              stats line counting up. It holds over the reveal of the city.
//   outro      the title fades, the bars pull back, and the HUD comes in
// Driven by the intro's own clock (not wall time) while it plays, so a slow
// frame rate can't separate the text from the car; the outro runs on wall
// time once the scene is done.

export const OUTRO_MS = 900;

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const out3 = (v: number) => 1 - (1 - v) ** 3;
/** 0 → 1 between a and b seconds, eased. */
const ramp = (t: number, a: number, b: number) => out3(clamp((t - a) / (b - a)));

export interface IntroOverlayProps {
  /** Seconds into the intro, written by the scene every frame. */
  clock: React.MutableRefObject<number>;
  /** When the car passes under the arch (seconds): the title's beat. */
  crossAt: number;
  /** The scene is done: fade the title, pull the bars back. */
  outro: boolean;
  label: string;
  name: string;
  buildings: number;
  /** After the building count: "#3 THIS WEEK", "@DEV3 LEADS THIS WEEK", or null. */
  race: string | null;
  onSkip: () => void;
}

export default function IntroOverlay({ clock, crossAt, outro, label, name, buildings, race, onSkip }: IntroOverlayProps) {
  const black = useRef<HTMLDivElement>(null);
  const top = useRef<HTMLDivElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLDivElement>(null);
  const ruleL = useRef<HTMLSpanElement>(null);
  const ruleR = useRef<HTMLSpanElement>(null);
  const labelEl = useRef<HTMLSpanElement>(null);
  const letters = useRef<(HTMLSpanElement | null)[]>([]);
  const stats = useRef<HTMLSpanElement>(null);
  const count = useRef<HTMLSpanElement>(null);
  const skip = useRef<HTMLButtonElement>(null);
  const outroAt = useRef<number | null>(null);

  useEffect(() => {
    if (outro && outroAt.current === null) outroAt.current = performance.now();
  }, [outro]);

  useEffect(() => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const chars = letters.current;
    let raf = 0;
    const tick = () => {
      const t = clock.current;
      const o = outroAt.current === null ? 0 : (performance.now() - outroAt.current) / OUTRO_MS;
      const c = t - crossAt; // seconds since the crossing

      if (black.current) black.current.style.opacity = String(1 - ramp(t, 0, 0.6));

      // Bars: in from the start, back out during the outro's second half.
      const bars = 1 - ramp(o, 0.35, 1);
      if (top.current) top.current.style.transform = `translateY(${-(1 - bars) * 100}%)`;
      if (bottom.current) bottom.current.style.transform = `translateY(${(1 - bars) * 100}%)`;

      // Title, from the crossing; gone in the outro's first half.
      const fade = 1 - ramp(o, 0, 0.45);
      if (title.current) title.current.style.opacity = String(fade);
      const rule = ramp(c, 0, 0.5);
      if (ruleL.current) ruleL.current.style.transform = `scaleX(${rule})`;
      if (ruleR.current) ruleR.current.style.transform = `scaleX(${rule})`;
      if (labelEl.current) labelEl.current.style.opacity = String(ramp(c, 0.2, 0.6));
      const n = Math.max(1, chars.length);
      chars.forEach((el, i) => {
        if (!el) return;
        const k = ramp(c, 0.4 + (0.7 * i) / n, 0.65 + (0.7 * i) / n);
        el.style.opacity = String(k);
        el.style.transform = still ? "none" : `translateY(${(1 - k) * 6}px)`;
      });
      const s = ramp(c, 1.1, 1.5);
      if (stats.current) stats.current.style.opacity = String(s);
      if (count.current) count.current.textContent = String(Math.round(buildings * ramp(c, 1.1, 1.9)));
      if (skip.current) skip.current.style.opacity = String(0.7 * (1 - ramp(o, 0, 0.3)));

      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [clock, crossAt, buildings]);

  return (
    <div className="pointer-events-none fixed inset-0 z-40 font-pixel uppercase">
      <div ref={black} className="absolute inset-0 bg-black" />
      <div ref={top} className="absolute inset-x-0 top-0 h-[13vh] bg-black sm:h-[12vh]">
        <button
          ref={skip}
          type="button"
          onClick={onSkip}
          className="pointer-events-auto absolute bottom-3 right-4 flex items-center gap-2 text-[9px] text-muted opacity-70 transition-colors hover:text-cream sm:right-6"
        >
          <span className="border border-muted/60 px-1 py-px">Esc</span> Skip
        </button>
      </div>
      <div ref={bottom} className="absolute inset-x-0 bottom-0 flex h-[13vh] items-center justify-center bg-black px-4 sm:h-[12vh]">
        <div ref={title} className="flex w-full max-w-3xl flex-col items-center" aria-live="polite" aria-label={`${label}: ${name}`}>
          <div className="flex w-full items-center gap-3 sm:gap-4">
            <span ref={ruleL} className="h-0.5 flex-1 origin-right scale-x-0 bg-lime" />
            <span ref={labelEl} className="shrink-0 text-[10px] tracking-[0.35em] text-lime opacity-0 sm:text-[11px]">
              {label}
            </span>
            <span ref={ruleR} className="h-0.5 flex-1 origin-left scale-x-0 bg-lime" />
          </div>
          <span className="mt-2 max-w-full truncate text-2xl leading-tight text-cream normal-case sm:mt-2.5 sm:text-4xl" aria-hidden>
            {[...name].map((ch, i) => (
              <span
                key={i}
                ref={(el) => {
                  letters.current[i] = el;
                }}
                className="inline-block whitespace-pre opacity-0"
              >
                {ch}
              </span>
            ))}
          </span>
          <span ref={stats} className="mt-2 flex flex-wrap justify-center gap-x-2 text-center text-[9px] tracking-[0.2em] text-muted opacity-0 sm:text-[11px] sm:tracking-[0.25em]" aria-hidden>
            <span>
              <span ref={count} className="tabular-nums text-cream">
                0
              </span>{" "}
              {buildings === 1 ? "building" : "buildings"}
            </span>
            {race && (
              <>
                <span className="max-sm:hidden">·</span>
                <span className="max-sm:basis-full">{race}</span>
              </>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
