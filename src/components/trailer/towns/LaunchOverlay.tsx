"use client";

import { useEffect, useState } from "react";
import { beatOf, type FilmClock } from "@trailer-kit/clock";
import {
  BLUE,
  COUNT_FROM,
  FREEZE,
  ORANGE,
  TYPED,
  UI,
  dayName,
  daysAt,
  keyBeat,
  perDev,
  type Side,
} from "@/lib/trailer/towns/launch";
import type { TownFacts } from "@/app/trailer/towns/towns-film";

// The launch trailer's DOM layer (lib/trailer/towns/launch), on the film's
// clock: the terminal the hook types in, the pickers popping in over the
// split, each town's number counting over the week's split, and the score
// chip over Friday and Sunday's cuts.
// It copies the game's HUD language (pixel type, 2px borders, solid ground,
// team colours) at trailer size, in the stage's container units.

const COLOR: Record<Side, string> = { claude: ORANGE, codex: BLUE };
/** What each command printed, shown above the next prompt. */
const PRINTED = ["[main 3f2a1c9] ship it", "To github.com:you/app.git   main -> main"];

function useBeat(clock: FilmClock): number {
  const [b, setB] = useState(() => beatOf(clock));
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      setB(beatOf(clock));
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [clock]);
  return b;
}

const inside = (b: number, s: { start: number; end: number }) => b >= s.start && b < s.end;

/** Sunday night's clock: the seconds to midnight tick one a beat, midnight on the freeze. */
function midnight(b: number): string {
  if (b >= FREEZE) return "00:00:00";
  const s = Math.max(0, Math.min(59, Math.floor(60 - (FREEZE - b))));
  return `23:59:${String(s).padStart(2, "0")}`;
}

export default function LaunchOverlay({ clock, towns }: { clock: FilmClock; towns: [TownFacts, TownFacts] }) {
  const b = useBeat(clock);
  const typed = UI.terminal.findIndex((s) => inside(b, s));
  if (typed >= 0) return <Terminal b={b} i={typed} />;
  if (inside(b, UI.sides)) return <Pickers b={b - UI.sides.start} towns={towns} />;
  if (inside(b, UI.week)) return <WeekBars b={b} towns={towns} />;
  if (inside(b, UI.fri)) return <ScoreChip b={b} label="FRI" />;
  if (b >= UI.sunday[0] && b < UI.sunday[1]) return <ScoreChip b={b} label={`SUN ${midnight(b)}`} late={b >= COUNT_FROM} />;
  return null;
}

// ─── The terminal ───────────────────────────────────────────

function Terminal({ b, i }: { b: number; i: number }) {
  const s = UI.terminal[i];
  const text = TYPED[i];
  let n = 0;
  while (n < text.length && b >= keyBeat(s, i, n)) n++;
  const cursor = Math.floor(b * 2) % 2 === 0;
  const prompt = <span className="text-lime">~/app $ </span>;
  return (
    <div className="absolute inset-0 flex flex-col justify-center bg-black px-[10cqw] font-pixel normal-case text-cream" style={{ fontSize: "2.6cqw", lineHeight: 1.7 }}>
      {TYPED.slice(0, i).map((t, k) => (
        <div key={k} className="opacity-40">
          <div>
            {prompt}
            {t}
          </div>
          <div className="text-muted">{PRINTED[k]}</div>
        </div>
      ))}
      <div>
        {prompt}
        {text.slice(0, n)}
        <span className="inline-block bg-cream align-middle" style={{ width: "0.6em", height: "1em", opacity: cursor ? 1 : 0 }} />
      </div>
    </div>
  );
}

// ─── Pick a side ────────────────────────────────────────────

/** Faces that fit on one line of a half. */
const FACES = 8;

/** A face pops in every half beat on each side. */
function Pickers({ b, towns }: { b: number; towns: [TownFacts, TownFacts] }) {
  return (
    <div className="absolute inset-0 flex">
      {towns.map((town, side) => {
        const faces = town.faces.slice(0, FACES);
        const shown = Math.max(0, Math.min(faces.length, Math.floor((b - 0.5) * 2) + 1));
        return (
          <div key={side} className="relative flex-1">
            <div
              className="absolute inset-x-0 bottom-0 flex items-center gap-[1.4cqw] border-t-2 bg-bg px-[2cqw] py-[1.2cqw] font-pixel"
              style={{ borderColor: town.side.color }}
            >
              <span className="shrink-0" style={{ color: town.side.color, fontSize: "2.6cqw" }}>
                {town.side.name}
              </span>
              <span className="flex min-w-0 flex-1 flex-nowrap justify-end gap-[0.5cqw] overflow-hidden">
                {faces.slice(0, shown).map((f, k) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={f.login}
                    src={f.avatar_url ?? ""}
                    alt=""
                    className="shrink-0 border-2 border-border"
                    style={{
                      width: "3cqw",
                      height: "3cqw",
                      transform: k === shown - 1 && (b * 2) % 1 < 0.3 ? "scale(1.35)" : undefined,
                    }}
                  />
                ))}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── The week ───────────────────────────────────────────────

/**
 * Over the week's split: each town's name and its number on a solid bar at
 * the bottom of its half (the pickers' bar), the leader marked #1, and the
 * day in the middle. The numbers tick on the beats the buildings grow on.
 */
function WeekBars({ b, towns }: { b: number; towns: [TownFacts, TownFacts] }) {
  const days = daysAt(b);
  const score: Record<Side, number> = { claude: perDev("claude", days), codex: perDev("codex", days) };
  const leader: Side = score.codex > score.claude ? "codex" : "claude";
  const tick = b % 1 < 0.15;
  return (
    <div className="pointer-events-none absolute inset-0 font-pixel">
      <div className="absolute inset-x-0 bottom-0 flex">
        {(["claude", "codex"] as Side[]).map((side, i) => (
          <div
            key={side}
            className="flex flex-1 items-center justify-between border-t-2 bg-bg px-[2cqw] py-[1.2cqw]"
            style={{ borderColor: COLOR[side] }}
          >
            <span className="flex items-center gap-[1.2cqw]" style={{ color: COLOR[side], fontSize: "2.6cqw" }}>
              {towns[i].side.name}
              {leader === side && days > 0 && (
                <span className="border-2 border-lime px-[0.6cqw] text-lime" style={{ fontSize: "1.6cqw" }}>
                  #1
                </span>
              )}
            </span>
            <span className="tabular-nums text-cream" style={{ fontSize: "3.4cqw", transform: tick && days > 0 ? "scale(1.12)" : undefined }}>
              {Math.round(score[side])}
            </span>
          </div>
        ))}
      </div>
      <div className="absolute inset-x-0 flex flex-col items-center gap-[0.6cqw]" style={{ bottom: "6.6cqw" }}>
        <span className="border-2 border-border bg-bg px-[1.6cqw] py-[0.6cqw] text-cream" style={{ fontSize: "2.2cqw" }}>
          {dayName(b)}
        </span>
      </div>
    </div>
  );
}

// ─── Friday and Sunday ──────────────────────────────────────

/** The two numbers either side of the day (or Sunday's clock). */
function ScoreChip({ b, label, late = false }: { b: number; label: string; late?: boolean }) {
  const days = daysAt(b);
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[3cqw] flex justify-center font-pixel">
      <div className="flex items-center gap-[2cqw] border-2 border-border bg-bg px-[2cqw] py-[1cqw]" style={{ fontSize: "2.2cqw" }}>
        <span className="tabular-nums" style={{ color: ORANGE }}>
          {Math.round(perDev("claude", days))}
        </span>
        <span className={`tabular-nums ${late ? "text-lime" : "text-muted"}`}>{label}</span>
        <span className="tabular-nums" style={{ color: BLUE }}>
          {Math.round(perDev("codex", days))}
        </span>
      </div>
    </div>
  );
}
