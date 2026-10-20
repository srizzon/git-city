"use client";

import { useEffect, useState } from "react";
import { PaintRoller } from "lucide-react";
import { Band } from "@/components/games/ui";
import { T } from "@/components/games/kit";
import { stateOf, type UF } from "@/lib/towns/brasil-map";
import type { PaintNews } from "./usePaint";

// The first goal in the car (picked in the 2026-10-19 phone prototype): a
// lime mission band under the top bar, "Paint 1 lot for SP 0/1", and how to
// do it under it, until your first loop paints. Done once, remembered in
// this browser. The State War's own HUD (PaintHud) takes its place after.

const KEY = "gc:paint-mission";

export function paintMissionDone(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export default function PaintMission({ uf, news, onDone }: { uf: UF; news: PaintNews | null; onDone: () => void }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (news?.k !== "got" || done) return;
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      // storage blocked: the mission comes back next time, no harm
    }
    const t = setTimeout(() => {
      setDone(true);
      onDone();
    }, 1800);
    return () => clearTimeout(t);
  }, [news, done, onDone]);
  if (done) return null;
  const got = news?.k === "got";
  return (
    <div className="pointer-events-none absolute left-1/2 top-4 flex w-[min(380px,calc(100vw-2rem))] -translate-x-1/2 flex-col gap-0.5 max-sm:top-[calc(max(1rem,env(safe-area-inset-top))+3.5rem)]">
      <Band tone="lime" className="justify-between gap-3 px-4 py-2.5" style={{ fontSize: T.body }}>
        <span className="flex items-center gap-2">
          <PaintRoller size={14} aria-hidden /> Paint 1 lot for {uf}
        </span>
        <span className="tabular-nums">{got ? "1" : "0"}/1</span>
      </Band>
      <Band delay={60} className="px-4 py-2 normal-case text-muted" style={{ fontSize: T.small }}>
        {got ? `Done. That's ${stateOf(uf).name}'s now.` : `Drive a circle and close it. Everything inside turns ${uf}.`}
      </Band>
    </div>
  );
}
