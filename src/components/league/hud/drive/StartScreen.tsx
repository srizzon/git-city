"use client";

import { useEffect, useRef, useState } from "react";
import { Car } from "lucide-react";
import { Band } from "@/components/games/ui";
import { T } from "@/components/games/kit";

// Shown from the Drive click until the car is ready (picked in the
// 2026-10-19 phone prototype, "Live"): the scene stays sharp, and a lime
// band at the bottom loads ("Starting your car 76%") with what's going on
// over it ("4 driving · a race starts in 12s") when there is something. The
// bar eases toward 90% while Rapier and the car load, fills on ready, then
// (after at least MIN_MS) the band fades out. The controls are taught in the
// car (the drive prompts), not here.

/** Shown at least this long, so a fast load doesn't flash. */
const MIN_MS = 1200;

export default function StartScreen({
  ready,
  note = null,
  onGone,
}: {
  ready: boolean;
  touch?: boolean;
  /** What's going on here, over the band ("4 driving · a race starts in 12s"). */
  note?: string | null;
  /** The band has faded out: the controls can come up where it was. */
  onGone?: () => void;
}) {
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
      const t = setTimeout(() => {
        setGone(true);
        onGone?.();
      }, 450);
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
    // onGone is read once, when the band goes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  if (gone) return null;
  const shown = ready ? 1 : progress;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-none absolute inset-x-4 bottom-[max(2rem,env(safe-area-inset-bottom))] flex justify-center transition-opacity duration-300 ${done ? "opacity-0 delay-150" : "animate-[fade-in_0.2s_ease-out] opacity-100"}`}
    >
      <div className="flex w-[min(420px,100%)] flex-col gap-1">
        {note && (
          <Band className="gap-2 px-4 py-2 normal-case text-cream" style={{ fontSize: T.small }}>
            <span className="h-1.5 w-1.5 animate-pulse bg-red-500" aria-hidden /> {note}
          </Band>
        )}
        <Band tone="lime" delay={60} className="flex-col items-stretch gap-2 px-4 py-3" style={{ fontSize: T.body }}>
          <span className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Car size={16} aria-hidden /> {ready ? "Ready" : "Starting your car"}
            </span>
            <span className="tabular-nums">{Math.round(shown * 100)}%</span>
          </span>
          <span className="h-2 bg-bg/20" aria-hidden>
            <span className="block h-full bg-bg transition-[width] duration-150" style={{ width: `${shown * 100}%` }} />
          </span>
        </Band>
      </div>
    </div>
  );
}
