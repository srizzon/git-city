"use client";

import { useEffect, useRef, useState } from "react";
import { CONTROLS } from "./PauseMenu";

// Shown from the Drive click until the car is ready: the city blurs behind a
// big STARTING ENGINE, a block progress bar and the controls, so the wait
// teaches them. The bar eases toward 90% while Rapier and the car load, fills
// on ready, then (after at least MIN_MS) the screen fades out.

const BLOCKS = 16;
const STEPS = ["Loading physics", "Loading the car", "Warming up the engine"];
/** Shown at least this long, so a fast load doesn't flash. */
const MIN_MS = 1200;

export default function StartScreen({ ready }: { ready: boolean }) {
  const [progress, setProgress] = useState(0);
  const [gone, setGone] = useState(false);
  const [minPassed, setMinPassed] = useState(false);
  const start = useRef(0);
  const done = ready && minPassed;

  useEffect(() => {
    const t = setTimeout(() => setMinPassed(true), MIN_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (done) {
      const t = setTimeout(() => setGone(true), 450);
      return () => clearTimeout(t);
    }
    let raf = 0;
    const tick = (now: number) => {
      if (!start.current) start.current = now;
      // Approaches 0.9 over ~3 s; never claims to be done before it is.
      const t = (now - start.current) / 1000;
      setProgress(0.9 * (1 - Math.exp(-t / 1.2)));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [done]);

  if (gone) return null;
  const shown = ready ? 1 : progress;
  const filled = Math.round(shown * BLOCKS);
  const step = ready ? "Ready" : STEPS[Math.min(STEPS.length - 1, Math.floor((progress / 0.9) * STEPS.length))];

  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-auto absolute inset-0 flex items-center justify-center bg-bg/60 backdrop-blur-md transition-opacity duration-300 ${done ? "opacity-0 delay-150" : "animate-[fade-in_0.2s_ease-out] opacity-100"}`}
    >
      <div className="flex flex-col gap-8 px-6">
        <h2 className="text-3xl tracking-[0.25em] text-cream sm:text-4xl">Starting engine</h2>

        <div className="flex flex-col gap-3">
          <div className="flex gap-1" aria-hidden>
            {Array.from({ length: BLOCKS }, (_, i) => (
              <span key={i} className={`h-4 w-5 border-2 ${i < filled ? "border-lime bg-lime" : "border-border bg-bg"}`} />
            ))}
          </div>
          <p className="text-[10px] text-muted">{step}…</p>
        </div>

        <dl className="grid grid-cols-[auto_auto] gap-x-8 gap-y-2 self-start text-[10px]">
          {CONTROLS.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-cream">{k}</dt>
              <dd className="text-muted">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
