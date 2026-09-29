"use client";

import { useEffect, useState } from "react";
import { Crown } from "lucide-react";
import TrophyIcon from "@/components/towns/TrophyIcon";
import { beatOf, type FilmClock } from "@trailer-kit/clock";
import { DAY_COLORS, DAY_LETTERS, dayLevel } from "@/lib/towns/race-view";
import {
  BLUE,
  COUNT_FROM,
  FREEZE,
  ORANGE,
  TYPED,
  UI,
  WEEK,
  daysAt,
  keyBeat,
  perDev,
  type Side,
} from "@/lib/trailer/towns/launch";
import type { TownFacts } from "@/app/trailer/towns/towns-film";

// The launch trailer's DOM layer (lib/trailer/towns/launch), on the film's
// clock: the terminal the hook types in, the pickers popping in over the
// split, the town ranking board, and Sunday's clock over the last cuts.
// It copies the game's HUD language (pixel type, 2px borders, solid ground,
// team colours) at trailer size, in the stage's container units.

const NAMES: Record<Side, string> = { claude: "Claude Code", codex: "Codex" };
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
  if (UI.panel.some((s) => inside(b, s))) return <Board b={b} towns={towns} panel />;
  if (inside(b, UI.midnight)) return <Board b={b} towns={towns} />;
  if (b >= UI.sunday[0] && b < UI.sunday[1]) return <SundayClock b={b} />;
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

// ─── The board ──────────────────────────────────────────────

function Squares({ side, days, size, today }: { side: Side; days: number; size: string; today: number }) {
  return (
    <span className="flex" style={{ gap: `calc(${size} / 5)` }}>
      {WEEK[side].map((n, d) => {
        const lit = days - d;
        const future = lit <= 0;
        return (
          <span
            key={d}
            className={`flex items-center justify-center ${future ? "border-2 border-dashed border-border text-dim" : "text-bg"}`}
            style={{
              width: size,
              height: size,
              fontSize: `calc(${size} / 2)`,
              background: future ? "transparent" : DAY_COLORS[dayLevel(n * Math.min(1, lit))],
              outline: d === today ? "2px solid rgba(232,220,200,0.6)" : undefined,
              outlineOffset: 2,
            }}
          >
            {DAY_LETTERS[d]}
          </span>
        );
      })}
    </span>
  );
}

/**
 * The town ranking: the two sides' lanes, their bars against the leader,
 * their week in day squares, per dev. Full screen at midnight; as a panel on
 * the right beside a day's take (`panel`), counting that day in.
 */
function Board({ b, towns, panel = false }: { b: number; towns: [TownFacts, TownFacts]; panel?: boolean }) {
  const days = daysAt(b);
  const final = b >= FREEZE;
  const score: Record<Side, number> = { claude: perDev("claude", days), codex: perDev("codex", days) };
  const order: Side[] = score.codex > score.claude ? ["codex", "claude"] : ["claude", "codex"];
  const max = Math.max(score.claude, score.codex, 1);
  const today = Math.min(6, Math.max(0, Math.ceil(days) - 1));
  const lead = towns[0].tallest[0];
  const k = panel ? 0.72 : 1;
  const u = (n: number) => `${n * k}cqw`;
  return (
    <div
      className={`absolute font-pixel text-cream ${panel ? "inset-y-0 right-0 flex items-center border-l-2 border-border bg-bg" : "inset-0 flex items-center justify-center bg-bg"}`}
      style={panel ? { width: "40cqw", padding: "0 2.6cqw" } : undefined}
    >
      <div className="flex w-full flex-col" style={{ gap: u(2.2), width: panel ? "100%" : "64cqw" }}>
        <div className="flex items-center justify-between" style={{ fontSize: u(1.9) }}>
          <span className="text-muted">{final ? "FINAL" : "THIS WEEK"}</span>
          <span className="flex items-center" style={{ gap: u(0.8) }}>
            <TrophyIcon size={panel ? 14 : 22} className="text-lime" />
            {b >= COUNT_FROM ? <span className="tabular-nums text-lime">SUN {midnight(b)}</span> : <span>#1 WINS</span>}
          </span>
        </div>
        <ol className="flex flex-col" style={{ gap: u(2.4) }}>
          {order.map((side, rank) => {
            const won = final && rank === 0;
            return (
              <li key={side} className="flex flex-col" style={{ gap: u(0.9) }}>
                <div className="flex items-center" style={{ gap: u(1.4), fontSize: u(2.6) }}>
                  <span className={`text-right tabular-nums ${rank === 0 ? "text-lime" : "text-muted"}`} style={{ width: u(2.4) }}>
                    {rank + 1}
                  </span>
                  <div
                    className="relative min-w-0 flex-1 border-2 bg-bg-card"
                    style={{ height: u(5.6), borderColor: won ? "#c8e64a" : rank === 0 ? COLOR[side] : "#2a2a33" }}
                  >
                    <div className="h-full" style={{ width: `${Math.max(3, (score[side] / max) * 100)}%`, background: `${COLOR[side]}55` }} />
                    <span className="absolute inset-y-0 flex items-center whitespace-nowrap normal-case" style={{ left: u(1.2), color: COLOR[side] }}>
                      {NAMES[side]}
                    </span>
                    <span className="absolute inset-y-0 flex items-center tabular-nums" style={{ right: u(1.2), fontSize: u(3) }}>
                      {Math.round(score[side])}
                    </span>
                  </div>
                </div>
                <div className="flex items-center" style={{ gap: u(1.4), paddingLeft: u(3.8) }}>
                  <Squares side={side} days={days} size={u(2.4)} today={today} />
                </div>
              </li>
            );
          })}
        </ol>
        <div className="flex items-center justify-between text-muted" style={{ fontSize: u(1.6), paddingLeft: u(3.8) }}>
          <span className="flex items-center whitespace-nowrap normal-case" style={{ gap: u(0.8) }}>
            <Crown size={panel ? 12 : 18} strokeWidth={2.5} className="text-lime" />@{lead} leads {NAMES.claude}
          </span>
          <span className="whitespace-nowrap">per dev</span>
        </div>
      </div>
    </div>
  );
}

// ─── Sunday ─────────────────────────────────────────────────

/** Over Sunday's cuts: the clock, and the two numbers racing. */
function SundayClock({ b }: { b: number }) {
  const days = daysAt(b);
  const late = b >= COUNT_FROM;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[3cqw] flex justify-center font-pixel">
      <div className="flex items-center gap-[2cqw] border-2 border-border bg-bg px-[2cqw] py-[1cqw]" style={{ fontSize: "2.2cqw" }}>
        <span className="tabular-nums" style={{ color: ORANGE }}>
          {Math.round(perDev("claude", days))}
        </span>
        <span className={`tabular-nums ${late ? "text-lime" : "text-muted"}`}>
          SUN {midnight(b)}
        </span>
        <span className="tabular-nums" style={{ color: BLUE }}>
          {Math.round(perDev("codex", days))}
        </span>
      </div>
    </div>
  );
}
