"use client";

import { useEffect, useState } from "react";

// Between two places (the town and its race track): the scene blurs behind a
// big title and a running block bar until the next page takes over, so a
// click never looks like nothing happened.

export default function TransitScreen({ title, line }: { title: string; line: string }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((n) => n + 1), 120);
    return () => clearInterval(id);
  }, []);
  const BLOCKS = 16;
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-auto fixed inset-0 z-50 flex animate-[fade-in_0.15s_ease-out] items-center justify-center bg-bg/70 font-pixel uppercase backdrop-blur-md"
    >
      <div className="flex flex-col gap-6 px-6">
        <h2 className="text-3xl tracking-[0.2em] text-cream sm:text-4xl">{title}</h2>
        <div className="flex gap-1" aria-hidden>
          {Array.from({ length: BLOCKS }, (_, i) => {
            // Four lit blocks running left to right.
            const on = (i - (step % (BLOCKS + 4)) + BLOCKS + 4) % (BLOCKS + 4) >= BLOCKS;
            return <span key={i} className={`h-4 w-5 border-2 ${on ? "border-lime bg-lime" : "border-border bg-bg"}`} />;
          })}
        </div>
        <p className="text-[11px] text-muted">{line}</p>
      </div>
    </div>
  );
}
