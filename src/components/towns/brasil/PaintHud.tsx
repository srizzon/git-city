"use client";

import { useEffect, useState } from "react";
import { HUD_BOX, fmt } from "@/components/league/hud/shared";
import { CELL_M2, PAINT, PAINT_MINE, type LostWhy, type PaintBoard } from "@/lib/towns/brasil-paint";
import { stateOf } from "@/lib/towns/brasil-map";
import type { PaintMe, PaintNews } from "./usePaint";

// The State War in the car: your state, your trail against its limit, your
// points today and where your state stands; a toast when a loop paints or a
// trail is lost. Top middle, under the Crown rush button; hidden while a
// Crown rush match runs (its panel takes that spot).

const LOST: Record<LostWhy, string> = {
  cut: "Trail cut by another car",
  long: "Trail lost: too long. Loop back sooner",
  jump: "Trail lost",
  gap: "Trail lost",
};
const NEWS_MS = 2600;

const pct = (n: number, land: number) => (land > 0 ? `${((n / land) * 100).toFixed(n / land < 0.01 ? 2 : 1)}%` : "0%");

export default function PaintHud({ board, me, news, self, signedIn, touch }: { board: PaintBoard; me: PaintMe | null; news: PaintNews | null; self: React.MutableRefObject<string | null>; signedIn: boolean; touch: boolean }) {
  // The board changes outside React: read it a few times a second.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 250);
    return () => clearInterval(t);
  }, []);
  // The toast goes away NEWS_MS after it came.
  const [gone, setGone] = useState<number | null>(null);
  useEffect(() => {
    if (!news) return;
    const t = setTimeout(() => setGone(news.at), NEWS_MS);
    return () => clearTimeout(t);
  }, [news]);

  // Under the Crown rush button (top middle: top-4, a phone's 4.25rem).
  const top = touch ? "top-[calc(max(1rem,env(safe-area-inset-top))+6.75rem)]" : "top-[4.25rem]";
  if (!me?.uf) {
    return (
      <div className={`pointer-events-none fixed inset-x-0 ${top} z-30 flex justify-center font-pixel uppercase`}>
        <p className={`${HUD_BOX} px-3 py-1.5 text-[9px] normal-case text-muted`}>{signedIn ? "Put your building in a state to paint the map" : "Sign in to paint the map for your state"}</p>
      </div>
    );
  }
  const uf = me.uf;
  const trail = self.current ? (board.trails.get(self.current)?.cells.length ?? 0) : 0;
  const shares = board.shares();
  const rank = shares.findIndex((s) => s.uf === uf);
  const held = rank >= 0 ? shares[rank].cells : 0;
  const fresh = news && gone !== news.at ? news : null;
  const warn = trail > PAINT.trailMax * 0.75;

  return (
    <div className={`pointer-events-none fixed inset-x-0 ${top} z-30 flex flex-col items-center gap-2 font-pixel uppercase`}>
      <div className={`${HUD_BOX} flex items-center gap-3 px-3 py-1.5 text-[9px]`}>
        <span className="flex items-center gap-1.5 text-cream">
          <span className="h-2.5 w-2.5" style={{ background: PAINT_MINE }} aria-hidden />
          {uf}
          <span className="tabular-nums text-muted">
            {pct(held, board.land)}
            {rank >= 0 && ` · #${rank + 1}`}
          </span>
        </span>
        <span className="flex items-center gap-1.5" aria-label={`Trail ${trail} of ${PAINT.trailMax}`}>
          <span className="text-muted">Trail</span>
          <span className="relative h-1.5 w-14 bg-border">
            <span className={`absolute inset-y-0 left-0 ${warn ? "bg-red-500" : "bg-lime"}`} style={{ width: `${Math.min(100, (trail / PAINT.trailMax) * 100)}%` }} />
          </span>
        </span>
        <span className="tabular-nums text-cream">
          {me.pts}/{me.cap} <span className="text-muted">pts</span>
        </span>
      </div>
      {fresh?.k === "got" && (
        <p className="text-sm text-lime [text-shadow:0_2px_0_rgba(0,0,0,0.6)]">
          +{fmt(Math.round((fresh.n + fresh.v) * CELL_M2))} m² for {stateOf(uf).name}
          {fresh.add > 0 && ` · +${fresh.add} pts`}
          {fresh.v > 0 && <span className="block text-center text-[10px] text-cream">{fmt(Math.round(fresh.v * CELL_M2))} m² taken from other states</span>}
        </p>
      )}
      {fresh?.k === "lost" && <p className="text-[11px] text-red-400 [text-shadow:0_2px_0_rgba(0,0,0,0.6)]">{LOST[fresh.why] ?? LOST.gap}</p>}
      {!fresh && trail === 0 && held === 0 && <p className="text-[9px] normal-case text-cream [text-shadow:0_2px_0_rgba(0,0,0,0.7)]">Drive a circle and close it to paint what is inside</p>}
    </div>
  );
}
