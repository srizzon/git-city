"use client";

import { useEffect, useState } from "react";
import { CROWN, type CrownState } from "@/lib/league-city/drive/crown";
import type { DriverInfo } from "@/lib/league-city/drive/net";
import { HUD_BOX } from "../shared";

// Crown Rush HUD: a Start button when 2+ people drive here, the 3-2-1, then
// everyone's time left (the holder's counting down live), who holds the
// crown, and the winner.

function Crown({ className = "" }: { className?: string }) {
  // 9×6 pixel crown.
  const rows = ["1.1.1.1.1", "111111111", "121212121", "111111111", ".........", "........."];
  return (
    <svg viewBox="0 0 9 4" className={className} shapeRendering="crispEdges" aria-hidden>
      {rows.slice(0, 4).flatMap((r, y) =>
        [...r].map((ch, x) => (ch === "." ? null : <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={ch === "2" ? "#ff4f7a" : "#ffcf33"} />)),
      )}
    </svg>
  );
}

const secs = (ms: number) => Math.max(0, Math.ceil(ms / 1000));
const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export default function CrownPanel({
  crown,
  offset,
  you,
  drivers,
  onStart,
}: {
  crown: CrownState | null;
  offset: number;
  you: string | null;
  drivers: DriverInfo[];
  onStart: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, []);
  const serverNow = now + offset;
  const name = (id: string) => (id === you ? "You" : (drivers.find((d) => d.id === id)?.name.replace(/^guest-.*/, "guest") ?? "someone"));
  const at = (id: string) => (id === you ? "you" : `@${name(id)}`);

  const phase = crown?.phase ?? "idle";
  const canStart = drivers.length >= 1 && (phase === "idle" || (phase === "over" && serverNow >= (crown?.endsAt ?? 0) + CROWN.over));

  if (phase === "countdown" && crown) {
    const n = Math.max(1, Math.ceil((crown.startsAt - serverNow) / 1000));
    return (
      <div className="absolute inset-x-0 top-[28%] flex flex-col items-center gap-3 text-cream">
        <Crown className="h-8 w-[72px]" />
        <p className="text-6xl tabular-nums">{n}</p>
        <p className="text-[10px] text-muted">Hold the crown {CROWN.goal / 1000} s to win</p>
      </div>
    );
  }

  if (phase === "live" && crown) {
    const left = (id: string) => {
      const base = crown.left[id] ?? CROWN.goal;
      return crown.holder === id ? base - Math.max(0, Math.min(serverNow, crown.endsAt) - crown.counted) : base;
    };
    const ids = Object.keys(crown.left).sort((a, b) => left(a) - left(b));
    const mine = crown.holder === you;
    return (
      <>
        <div className={`${HUD_BOX} absolute left-1/2 top-4 flex -translate-x-1/2 flex-col gap-1.5 px-3 py-2 text-[9px]`}>
          <p className="flex items-center justify-between gap-6 text-cream">
            <span className="flex items-center gap-1.5">
              <Crown className="h-2.5 w-[22px]" /> Crown rush
            </span>
            <span className="tabular-nums text-muted">{clock(crown.endsAt - serverNow)}</span>
          </p>
          <ul className="flex flex-col gap-1">
            {ids.slice(0, 6).map((id) => (
              <li key={id} className={`flex items-center justify-between gap-6 ${crown.holder === id ? "text-[#ffcf33]" : id === you ? "text-cream" : "text-muted"}`}>
                <span className="flex items-center gap-1.5">
                  {crown.holder === id ? <Crown className="h-2 w-[18px]" /> : <span className="w-[18px]" />}
                  {name(id)}
                </span>
                <span className="tabular-nums">{secs(left(id))}s</span>
              </li>
            ))}
          </ul>
        </div>
        <p
          className={`absolute left-1/2 top-[22%] -translate-x-1/2 whitespace-nowrap px-3 py-1 text-[11px] ${
            mine ? "animate-pulse bg-[#ffcf33] text-bg" : "text-cream [text-shadow:0_2px_0_#000]"
          }`}
        >
          {mine
            ? "You have the crown! Don't get hit"
            : crown.holder
              ? `${at(crown.holder)} has the crown. Bump them (boost to steal)`
              : "The crown is loose! Grab it"}
        </p>
      </>
    );
  }

  if (phase === "over" && crown && serverNow < crown.endsAt + CROWN.over) {
    const ranked = Object.entries(crown.left).sort((a, b) => a[1] - b[1]);
    return (
      <div className="absolute inset-x-0 top-[20%] flex flex-col items-center gap-4 text-cream">
        <Crown className="h-10 w-[90px]" />
        <p className="text-2xl tracking-[0.15em]">
          {crown.winner ? (crown.winner === you ? "You win!" : `${at(crown.winner)} wins!`) : "Nobody wins"}
        </p>
        <ul className={`${HUD_BOX} flex flex-col gap-1 px-4 py-2 text-[10px]`}>
          {ranked.slice(0, 6).map(([id, ms], i) => (
            <li key={id} className="flex justify-between gap-8">
              <span className={id === crown.winner ? "text-[#ffcf33]" : "text-muted"}>
                {i + 1}. {name(id)}
              </span>
              <span className="tabular-nums text-muted">{((CROWN.goal - ms) / 1000).toFixed(1)}s held</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="pointer-events-auto absolute left-1/2 top-4 -translate-x-1/2">
      {canStart ? (
        <button type="button" onClick={onStart} className={`${HUD_BOX} btn-press flex items-center gap-2 px-3 py-2 text-[10px] text-[#ffcf33] hover:text-cream`}>
          <Crown className="h-2.5 w-[22px]" />
          Start crown rush
        </button>
      ) : (
        <p className={`${HUD_BOX} flex items-center gap-2 px-3 py-2 text-[9px] text-dim normal-case`}>
          <Crown className="h-2.5 w-[22px] opacity-50" />
          Crown rush needs 2 drivers. Share the link.
        </p>
      )}
    </div>
  );
}
