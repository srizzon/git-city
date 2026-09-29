"use client";

import { useEffect, useState } from "react";
import { Crown } from "lucide-react";
import { DAY_COLORS, dayLevel } from "@/lib/towns/race-view";
import { beatOf, type FilmClock } from "@trailer-kit/clock";
import {
  ASK,
  BLUE,
  CMD,
  COUNT_FROM,
  FREEZE,
  KEY_EVERY,
  LIME,
  ORANGE,
  POPUP,
  SUIT,
  UI,
  crewPops,
  crewTotals,
  dayName,
  daysAt,
  perDev,
  type Side,
} from "@/lib/trailer/towns/launch";
import type { TownFacts } from "@/app/trailer/towns/towns-film";

// The launch trailer's DOM layer (lib/trailer/towns/launch), on the film's
// clock: the game's own UI is the only caption. The "knocked your building
// down" popup over the wreck and its "Hit back" button, the terminal where
// `claude` starts, each town's number over the week down to Sunday's clock, WINNER.

const COLOR: Record<Side, string> = { claude: ORANGE, codex: BLUE };
/** The rival who starts it (a made-up handle, like Clash's BigBuffetBoy85). */
const ATTACKER = "codexdev";
/** Claude's own orange, for the terminal. */
const CLAUDE_ORANGE = "#d97757";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

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
  const [claude, codex] = towns;
  if (inside(b, UI.popup)) return <Popup b={b - POPUP.start} attacker={ATTACKER} rival={codex.side.name} />;
  if (inside(b, UI.suit)) return <SuitUp b={b - UI.suit.start} />;
  if (inside(b, UI.crew)) return <CrewPanel b={b} town={claude} />;
  if (inside(b, UI.week)) return <WeekBars b={b} towns={towns} />;
  if (inside(b, UI.winner)) return <Winner b={b - UI.winner.start} town={claude.side.name} />;
  return null;
}

// ─── The popup ──────────────────────────────────────────────

/**
 * Over the held wreck, like Clash's "Your Defense Lost · Revenge": the
 * picture dims, a small game panel steps up with who did it and one button,
 * and a cursor comes in and presses it.
 */
function Popup({ b, attacker, rival }: { b: number; attacker: string; rival: string }) {
  const click = POPUP.click - POPUP.start;
  const up = b < 0.12 ? 2 : 0;
  const pressed = b >= click && b < click + 0.3;
  // The cursor travels in over the beat before the click, stepped a sixteenth at a time.
  const k = Math.max(0, Math.min(1, Math.floor((b - (click - 1)) * 4) / 4));
  return (
    <div className="absolute inset-0 flex items-end justify-center font-pixel" style={{ background: "rgba(0,0,0,0.45)", paddingBottom: "9cqw" }}>
      <div
        className="relative flex flex-col items-center border-2 bg-bg"
        style={{ borderColor: "#ef4444", padding: "1.8cqw 3cqw", gap: "1.2cqw", transform: `translateY(${up}cqw)` }}
      >
        <span style={{ color: "#ef4444", fontSize: "1.5cqw" }}>YOUR BUILDING WAS KNOCKED DOWN</span>
        <span className="text-cream normal-case" style={{ fontSize: "3cqw" }}>
          <span className="text-lime">@{attacker}</span>
        </span>
        <span
          className="text-bg"
          style={{
            background: LIME,
            fontSize: "2.2cqw",
            padding: "0.9cqw 3cqw",
            transform: pressed ? "scale(0.94)" : undefined,
            filter: pressed ? "brightness(0.85)" : undefined,
          }}
        >
          HIT {rival.toUpperCase()} BACK
        </span>
        {b >= click - 1 && (
          <svg viewBox="0 0 12 18" className="absolute" style={{ width: "2cqw", left: `${78 - 20 * k}%`, top: `${130 - 42 * k}%` }}>
            <path d="M0 0 L0 14 L4 10 L7 17 L9 16 L6 9 L11 9 Z" fill="#fff" stroke="#000" strokeWidth="1" />
          </svg>
        )}
      </div>
    </div>
  );
}

// ─── Suiting up ─────────────────────────────────────────────

/** In the dark: `claude` typed, its welcome box, "win the week" asked, and it starts working. */
function SuitUp({ b }: { b: number }) {
  const typed = (from: number, text: string) =>
    text.slice(0, Math.max(0, Math.min(text.length, Math.floor((b - from) / KEY_EVERY) + 1)));
  const cursor = Math.floor(b * 2) % 2 === 0;
  const caret = <span className="inline-block bg-cream align-middle" style={{ width: "0.6em", height: "1.05em", opacity: cursor ? 1 : 0 }} />;
  const sent = b >= SUIT.send;
  const dots = ".".repeat(1 + (Math.floor(b * 2) % 3));
  return (
    <div className="absolute inset-0 flex flex-col justify-center bg-black text-cream normal-case" style={{ fontFamily: MONO, fontSize: "2.1cqw", lineHeight: 1.55, padding: "0 12cqw" }}>
      <div>
        <span className="text-muted">~/app $ </span>
        {b >= SUIT.cmd ? typed(SUIT.cmd, CMD) : ""}
        {b < SUIT.enter && caret}
      </div>
      {b >= SUIT.welcome && (
        <>
          <div className="mt-[1.2cqw] border-2" style={{ borderColor: CLAUDE_ORANGE, padding: "1cqw 1.6cqw", width: "44cqw" }}>
            <div>
              <span style={{ color: CLAUDE_ORANGE }}>✻</span> Welcome to <span className="font-bold">Claude Code</span>!
            </div>
            <div className="mt-[0.8cqw] text-muted" style={{ fontSize: "1.6cqw" }}>
              /help for help, /status for your current setup
            </div>
            <div className="text-muted" style={{ fontSize: "1.6cqw" }}>
              cwd: ~/app
            </div>
          </div>
          <div className="mt-[1.4cqw] border-2 border-border" style={{ padding: "0.6cqw 1.2cqw", width: "44cqw" }}>
            <span className="text-muted">&gt; </span>
            {b >= SUIT.ask ? typed(SUIT.ask, ASK) : ""}
            {!sent && caret}
          </div>
          {sent && (
            <div className="mt-[1cqw]" style={{ color: CLAUDE_ORANGE }}>
              ✻ <span className="text-cream">Coding{dots}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── The crew ───────────────────────────────────────────────

/**
 * Beside the hero's building, the town's crew list as the game shows it
 * (components/league/hud/race, CrewRow): rank, avatar, @login, the week's
 * day squares, the total, the crown on #1. The hero's row climbs a place
 * with every pop of his building, from #4 to #1.
 */
function CrewPanel({ b, town }: { b: number; town: TownFacts }) {
  const [hero, ...rest] = town.tallest;
  const face = (login: string) => town.faces.find((f) => f.login.toLowerCase() === login)?.avatar_url ?? null;
  const { hero: mine, others } = crewTotals(b);
  const rows = [
    { login: hero, total: mine, me: true },
    ...rest.slice(0, 3).map((login, i) => ({ login, total: others[i], me: false })),
  ].sort((x, y) => y.total - x.total);
  const k = crewPops(b);
  const jump = (b - UI.crew.start - 1) % 2 < 0.25 && b - UI.crew.start >= 1;
  return (
    <div
      className="absolute inset-y-0 right-0 flex flex-col justify-center border-l-2 border-border bg-bg font-pixel"
      style={{ width: "40cqw", padding: "0 2.4cqw", gap: "1.6cqw" }}
    >
      <div className="flex items-center justify-between" style={{ fontSize: "1.5cqw" }}>
        <span style={{ color: ORANGE }}>{town.side.name}</span>
        <span className="text-muted">THIS WEEK</span>
      </div>
      <ol className="flex flex-col" style={{ gap: "0.8cqw" }}>
        {rows.map((r, i) => (
          <li
            key={r.login}
            className="flex items-center border-2"
            style={{
              gap: "1cqw",
              padding: "0.7cqw 0.9cqw",
              borderColor: r.me ? LIME : "transparent",
              background: r.me ? "rgba(200,230,74,0.06)" : undefined,
              transform: r.me && jump ? "translateX(-0.6cqw)" : undefined,
            }}
          >
            <span className={`text-right tabular-nums ${i === 0 ? "text-lime" : "text-muted"}`} style={{ width: "1.6cqw", fontSize: "1.5cqw" }}>
              {i + 1}
            </span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={face(r.login) ?? ""} alt="" className="shrink-0 border-2 border-border" style={{ width: "2.6cqw", height: "2.6cqw" }} />
            <span className="flex min-w-0 flex-1 items-center gap-[0.5cqw] truncate text-cream normal-case" style={{ fontSize: "1.5cqw" }}>
              @{r.login}
              {i === 0 && <Crown size={14} strokeWidth={2.5} className="shrink-0 text-lime" />}
            </span>
            <span className="flex" style={{ gap: "0.25cqw" }}>
              {Array.from({ length: 7 }, (_, d) => {
                const on = r.me ? d < Math.min(7, 1 + k) : d < 4;
                return (
                  <span
                    key={d}
                    className="block"
                    style={{ width: "1.1cqw", height: "1.1cqw", background: on ? DAY_COLORS[dayLevel(r.me ? 40 : 20)] : DAY_COLORS[0] }}
                  />
                );
              })}
            </span>
            <span className="text-right tabular-nums text-cream" style={{ width: "4cqw", fontSize: "1.6cqw" }}>
              {Math.round(r.total)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ─── The week ───────────────────────────────────────────────

/**
 * Over the week's split: each town's name and its number on a solid bar at
 * the bottom of its half, the leader marked #1, and the day in the middle.
 * The numbers tick on the beats the buildings grow on.
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
      {/* The day, and on Sunday the clock running down to midnight. */}
      <div className="absolute inset-x-0 flex justify-center" style={{ bottom: "6.6cqw" }}>
        <span
          className={`border-2 bg-bg px-[1.6cqw] py-[0.6cqw] tabular-nums ${b >= COUNT_FROM ? "text-lime" : "text-cream"}`}
          style={{ fontSize: "2.2cqw", borderColor: b >= FREEZE ? LIME : "#2a2a33" }}
        >
          {b >= COUNT_FROM ? `SUN ${midnight(b)}` : dayName(b)}
        </span>
      </div>
    </div>
  );
}

// ─── WINNER ─────────────────────────────────────────────────

/** The game's banner over the lit town, stamped in on the take's first beat. */
function Winner({ b, town }: { b: number; town: string }) {
  const pop = b < 0.12 ? 1.3 : 1;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[4cqw] flex flex-col items-center font-pixel" style={{ gap: "0.8cqw" }}>
      <span className="text-bg" style={{ background: LIME, fontSize: "4.6cqw", padding: "0.6cqw 3cqw", transform: `scale(${pop})` }}>
        WINNER
      </span>
      {b >= 1 && (
        <span className="border-2 bg-bg" style={{ color: ORANGE, borderColor: ORANGE, fontSize: "2cqw", padding: "0.4cqw 1.6cqw" }}>
          {town}
        </span>
      )}
    </div>
  );
}
