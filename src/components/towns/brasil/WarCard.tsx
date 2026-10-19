"use client";

import { useEffect, useState } from "react";
import { PaintRoller } from "lucide-react";
import { PAINT_MINE, stateColor, type PaintBoard } from "@/lib/towns/brasil-paint";
import type { UF } from "@/lib/towns/brasil-map";

// The State War on the map: the states holding the most land right now, yours
// pinned under them, last week's winner, and the way into the car to paint.

const SHOWN = 5;

const pct = (n: number, land: number) => (land > 0 ? `${((n / land) * 100).toFixed(n / land < 0.01 ? 2 : 1)}%` : "0%");

export default function WarCard({ board, slug, yours, onPaint, onPick }: { board: PaintBoard; slug: string; yours: UF | null; onPaint: () => void; onPick: (uf: UF) => void }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const [last, setLast] = useState<UF | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/towns/${slug}/paint?war=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { last?: { uf: UF }[] } | null) => {
        if (live) setLast(j?.last?.[0]?.uf ?? null);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [slug]);

  const shares = board.shares();
  const rank = yours ? shares.findIndex((s) => s.uf === yours) : -1;
  const row = (s: { uf: UF; cells: number }, i: number) => {
    const mine = s.uf === yours;
    return (
      <li key={s.uf}>
        <button type="button" onClick={() => onPick(s.uf)} className={`flex w-full items-center gap-2 px-2 py-1 text-left text-[10px] ${mine ? "text-lime" : "text-cream hover:text-lime"}`}>
          <span className="w-4 text-[9px] tabular-nums text-muted">{i + 1}</span>
          <span className="h-2 w-2" style={{ background: mine ? PAINT_MINE : stateColor(s.uf) }} aria-hidden />
          <span className="flex-1">{s.uf}</span>
          <span className="tabular-nums">{pct(s.cells, board.land)}</span>
        </button>
      </li>
    );
  };

  return (
    <div className="pointer-events-auto w-48 border-[3px] border-border bg-bg/90 font-pixel uppercase">
      <p className="flex items-baseline justify-between border-b-2 border-border px-2 py-1.5 text-[10px] text-cream">
        State War <span className="text-[8px] text-dim">this week</span>
      </p>
      {shares.length === 0 ? (
        <p className="px-2 py-2 text-[9px] normal-case text-muted">No state has painted yet.</p>
      ) : (
        <ul className="py-1">
          {shares.slice(0, SHOWN).map(row)}
          {rank >= SHOWN && row(shares[rank], rank)}
        </ul>
      )}
      {last && <p className="border-t-2 border-border px-2 py-1 text-[8px] text-dim">Last week: {last}</p>}
      <button type="button" onClick={onPaint} className="btn-press flex w-full items-center justify-center gap-2 bg-lime py-2 text-[10px] text-bg">
        <PaintRoller size={14} aria-hidden />
        {yours ? `Paint for ${yours}` : "Paint the map"}
      </button>
    </div>
  );
}
