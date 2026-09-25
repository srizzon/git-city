"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// Everything over the town intro, in the home city intro's language (its
// letterbox bars, text in the lower bar, the accent word, the confetti):
//   approach   nothing but Skip: the car, the road and the arch have the frame
//   crossing   the bars grow in from the edges with "Welcome to <town>", the
//              name in the sky's accent, the logo beside it and this week's
//              race under it; confetti. Held over the reveal of the city.
//   outro      the text fades and the bars shrink back; then the HUD comes in
// The welcome lands on the intro's own clock (not wall time), so a slow frame
// rate can't separate it from the car; the fades are CSS, like the home's.

export const OUTRO_MS = 1000;

/** Small seeded PRNG (mulberry32): the same confetti every render. */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface IntroOverlayProps {
  /** Seconds into the intro, written by the scene every frame. */
  clock: React.MutableRefObject<number>;
  /** When the car passes under the arch (seconds): the welcome's beat. */
  crossAt: number;
  /** The scene is done: fade the text, shrink the bars. */
  outro: boolean;
  /** Town name as shown in the HUD. */
  name: string;
  /** "#3 among companies this week", "@dev3 leads this week", or null. */
  race: string | null;
  logoUrl: string | null;
  /** The sky's accent and shadow (see SKY_ACCENTS). */
  accent: string;
  shadow: string;
  onSkip: () => void;
}

export default function IntroOverlay({ clock, crossAt, outro, name, race, logoUrl, accent, shadow, onSkip }: IntroOverlayProps) {
  // -1 on the approach, 1 the welcome (from the crossing).
  const [phase, setPhase] = useState(-1);
  const [confetti, setConfetti] = useState(false);
  const phaseRef = useRef(-1);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const t = clock.current;
      const next = t >= crossAt ? 1 : -1;
      if (next !== phaseRef.current) {
        phaseRef.current = next;
        setPhase(next);
        if (next === 1) window.setTimeout(() => setConfetti(true), 450);
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [clock, crossAt]);

  const bars = phase === 1 && !outro;
  const text = outro ? -1 : phase;

  // Same burst as the home intro, in the sky's colors; fixed per mount.
  const pieces = useMemo(() => {
    const colors = [accent, "#fff", shadow, "#f0c060", "#e040c0", "#60c0f0"];
    const random = seeded(name.length * 7919 + 17);
    return Array.from({ length: 25 }, (_, i) => {
      const w = 3 + random() * 5;
      return {
        color: colors[i % colors.length],
        left: 10 + random() * 80,
        delay: random() * 0.6,
        duration: 2.5 + random() * 1.5,
        w,
        h: random() > 0.5 ? w : w * 0.35,
        drift: (random() - 0.5) * 80,
        rotation: random() * 720,
      };
    });
  }, [accent, shadow, name]);

  return (
    <div className="pointer-events-none fixed inset-0 z-50">
      {/* Letterbox bars, as in the home intro (scaleY: composited only). */}
      <div
        className="absolute inset-x-0 top-0 origin-top bg-black/80 transition-transform duration-1000"
        style={{ height: "12%", transform: bars ? "scaleY(1)" : "scaleY(0)" }}
      />
      <div
        className="absolute inset-x-0 bottom-0 origin-bottom bg-black/80 transition-transform duration-1000"
        style={{ height: "18%", transform: bars ? "scaleY(1)" : "scaleY(0)" }}
      />

      {/* Text in the lower bar */}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-center px-4" style={{ height: "18%" }}>
        <div
          className="absolute flex max-w-[calc(100vw-2rem)] items-center gap-3 sm:gap-5"
          style={{
            opacity: text === 1 ? 1 : 0,
            transform: text === 1 ? "scale(1)" : "scale(0.95)",
            transition: "opacity 0.8s ease-out, transform 0.8s ease-out",
          }}
        >
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt=""
              className="shrink-0 [image-rendering:pixelated]"
              style={{ width: "clamp(2.5rem, 7vw, 4.5rem)", height: "clamp(2.5rem, 7vw, 4.5rem)", boxShadow: `4px 4px 0 0 ${shadow}` }}
            />
          )}
          <div className="flex min-w-0 flex-col items-center gap-1.5 sm:items-start">
            <p className="font-pixel uppercase text-cream text-balance" style={{ fontSize: "clamp(1.1rem, 4.4vw, 2.6rem)", lineHeight: 1.1 }}>
              Welcome to <span style={{ color: accent }}>{name}</span>
            </p>
            {race && (
              <p className="font-pixel normal-case text-cream/70" style={{ fontSize: "clamp(0.7rem, 1.8vw, 1rem)", letterSpacing: "0.05em" }}>
                {race}
              </p>
            )}
          </div>
        </div>
      </div>

      {confetti && !outro && (
        <div className="absolute inset-0 overflow-hidden">
          {pieces.map((p, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                left: `${p.left}%`,
                top: "-8px",
                width: `${p.w}px`,
                height: `${p.h}px`,
                backgroundColor: p.color,
                animation: `introConfettiFall ${p.duration}s ${p.delay}s ease-in forwards`,
                transform: `rotate(${p.rotation}deg) translateX(${p.drift}px)`,
                opacity: 0,
              }}
            />
          ))}
        </div>
      )}

      {/* Skip, top right, outside the bars' text: as in the home intro. */}
      <button
        type="button"
        onClick={onSkip}
        className="pointer-events-auto absolute right-4 top-4 font-pixel text-[10px] uppercase text-cream/40 transition-colors hover:text-cream sm:text-xs"
        style={{ opacity: outro ? 0 : 1, transition: "opacity 0.3s" }}
      >
        Skip &gt;
      </button>
    </div>
  );
}
