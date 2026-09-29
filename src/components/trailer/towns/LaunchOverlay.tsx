"use client";

import { useEffect, useState } from "react";
import { beatOf, type FilmClock } from "@trailer-kit/clock";
import {
  ASK,
  BLUE,
  CLICK,
  CMD,
  COUNT_FROM,
  FREEZE,
  KEY_EVERY,
  LIME,
  ORANGE,
  SUIT,
  UI,
  dayName,
  daysAt,
  perDev,
  type Side,
} from "@/lib/trailer/towns/launch";
import type { TownFacts } from "@/app/trailer/towns/towns-film";

// The launch trailer's DOM layer (lib/trailer/towns/launch), on the film's
// clock: the game's own UI is the only caption. The "knocked your building
// down" email and its "Hit back" button, the terminal where `claude` starts,
// Claude Code's rank, each town's number over the week, Sunday's clock,
// WINNER, and the same email on the other side after the name.

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

/** The email's hero image, drawn on the server (app/town/[slug]/demolished-image). */
const heroSrc = (town: string, attacker: string, victim: string) =>
  `/town/${town}/demolished-image?attacker=${encodeURIComponent(attacker)}&victim=${encodeURIComponent(victim)}&v=trailer`;

export default function LaunchOverlay({ clock, towns }: { clock: FilmClock; towns: [TownFacts, TownFacts] }) {
  const b = useBeat(clock);
  const [claude, codex] = towns;
  const hero = claude.tallest[0] ?? "you";
  // Both images load with the page (they take a moment to draw), so they're there when their email lands.
  const preload = (
    <div className="hidden" aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={heroSrc(claude.side.slug, ATTACKER, hero)} alt="" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={heroSrc(codex.side.slug, hero, ATTACKER)} alt="" />
    </div>
  );
  return (
    <>
      {preload}
      <Layer b={b} claude={claude} codex={codex} towns={towns} hero={hero} />
    </>
  );
}

function Layer({ b, claude, codex, towns, hero }: { b: number; claude: TownFacts; codex: TownFacts; towns: [TownFacts, TownFacts]; hero: string }) {
  if (inside(b, UI.email))
    return (
      <Email
        b={b - UI.email.start}
        attacker={ATTACKER}
        victim={hero}
        town={claude.side.slug}
        rival={codex.side.name}
        click={CLICK}
      />
    );
  if (inside(b, UI.suit)) return <SuitUp b={b - UI.suit.start} />;
  if (inside(b, UI.rank)) return <Rank b={b - UI.rank.start} claude={claude} codex={codex} />;
  if (inside(b, UI.week)) return <WeekBars b={b} towns={towns} />;
  if (b >= UI.sunday[0] && b < UI.sunday[1]) return <ScoreChip b={b} />;
  if (inside(b, UI.winner)) return <Winner b={b - UI.winner.start} town={claude.side.name} />;
  if (inside(b, UI.button))
    return (
      <Email
        b={b - UI.button.start}
        attacker={hero}
        victim={ATTACKER}
        town={codex.side.slug}
        rival={claude.side.name}
      />
    );
  return null;
}

// ─── The email ──────────────────────────────────────────────

/**
 * The real "knocked your building down" email (lib/notification-senders/
 * town-demolished) as it lands: its hero image, the line, the button. It
 * drops in stepped; with `click`, a cursor comes in and presses the button.
 */
function Email({
  b,
  attacker,
  victim,
  town,
  rival,
  click,
}: {
  b: number;
  attacker: string;
  victim: string;
  town: string;
  rival: string;
  click?: number;
}) {
  const drop = b < 0.12 ? -3 : 0;
  const pressed = click !== undefined && b >= click && b < click + 0.3;
  // The cursor travels in over the beat before the click (stepped, a frame a sixteenth).
  const k = click === undefined ? 0 : Math.max(0, Math.min(1, Math.floor((b - (click - 1)) * 4) / 4));
  const src = heroSrc(town, attacker, victim);
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black font-pixel">
      <div
        className="relative flex flex-col items-center border-2 border-border bg-bg"
        style={{ width: "50cqw", padding: "2cqw", gap: "1.4cqw", transform: `translateY(${drop}cqw)` }}
      >
        <div className="flex w-full items-center justify-between text-muted" style={{ fontSize: "1.4cqw" }}>
          <span>
            <span className="text-cream">GIT</span> <span className="text-lime">CITY</span>
          </span>
          <span>now</span>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" className="block w-full" style={{ imageRendering: "pixelated" }} />
        <div className="w-full text-center text-cream normal-case" style={{ fontSize: "2.6cqw" }}>
          <span className="text-lime">@{attacker}</span> knocked you down
        </div>
        <span
          className="inline-block text-bg"
          style={{
            background: LIME,
            fontSize: "2cqw",
            padding: "1cqw 2.6cqw",
            transform: pressed ? "scale(0.94)" : undefined,
            filter: pressed ? "brightness(0.85)" : undefined,
          }}
        >
          Hit {rival} back
        </span>
        {click !== undefined && b >= click - 1 && (
          <svg
            viewBox="0 0 12 18"
            className="absolute"
            style={{ width: "2cqw", left: `${62 - 12 * k}%`, top: `${118 - 26 * k}%` }}
          >
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

// ─── Where Claude Code stands ───────────────────────────────

/** On the drop: Claude Code is #2 on Monday, Codex #1 above it. Claude's row lands first, Codex's a beat later. */
function Rank({ b, claude, codex }: { b: number; claude: TownFacts; codex: TownFacts }) {
  const pop = b < 0.1 ? 1.25 : 1;
  const rows: [string, string, string, boolean][] = [
    ["#1", codex.side.name, BLUE, false],
    ["#2", claude.side.name, ORANGE, true],
  ];
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black font-pixel">
      <div className="flex flex-col" style={{ gap: "1.6cqw", width: "52cqw" }}>
        <div className="text-muted" style={{ fontSize: "1.6cqw" }}>
          THIS WEEK · PER DEV
        </div>
        {rows.map(([rank, name, color, hero], i) => (
          <div
            key={rank}
            className="flex items-center border-2 bg-bg"
            style={{
              gap: "2cqw",
              padding: hero ? "1.4cqw 2cqw" : "0.9cqw 2cqw",
              borderColor: hero ? color : "#2a2a33",
              fontSize: hero ? "4.4cqw" : "2.4cqw",
              opacity: hero || b >= 1 ? 1 : 0,
              transform: hero ? `scale(${pop})` : undefined,
              transformOrigin: "left center",
            }}
          >
            <span className={hero ? "text-cream" : "text-muted"}>{rank}</span>
            <span style={{ color }}>{name}</span>
            {i === 0 && (
              <span className="ml-auto text-lime" style={{ fontSize: "1.8cqw" }}>
                LEADS
              </span>
            )}
          </div>
        ))}
      </div>
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
      <div className="absolute inset-x-0 flex justify-center" style={{ bottom: "6.6cqw" }}>
        <span className="border-2 border-border bg-bg px-[1.6cqw] py-[0.6cqw] text-cream" style={{ fontSize: "2.2cqw" }}>
          {dayName(b)}
        </span>
      </div>
    </div>
  );
}

// ─── Sunday ─────────────────────────────────────────────────

/** Over Sunday's cuts: the two numbers either side of the clock; on midnight it lights up. */
function ScoreChip({ b }: { b: number }) {
  const days = daysAt(b);
  const late = b >= COUNT_FROM;
  const done = b >= FREEZE;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[3cqw] flex justify-center font-pixel">
      <div
        className="flex items-center gap-[2cqw] border-2 bg-bg px-[2cqw] py-[1cqw]"
        style={{ fontSize: "2.4cqw", borderColor: done ? LIME : "#2a2a33" }}
      >
        <span className="tabular-nums" style={{ color: ORANGE }}>
          {Math.round(perDev("claude", days))}
        </span>
        <span className={`tabular-nums ${late ? "text-lime" : "text-muted"}`}>SUN {midnight(b)}</span>
        <span className="tabular-nums" style={{ color: BLUE }}>
          {Math.round(perDev("codex", days))}
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
