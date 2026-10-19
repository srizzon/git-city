"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { HUD_BOX } from "@/components/league/hud/shared";
import { carColor } from "@/lib/league-city/drive/net";
import { formatLap } from "@/lib/league-city/race/laps";
import { Backdrop, Band, Chip, type Tone } from "./ui";

// The screens every car game shares, picked one by one in the 2026-10-19
// prototype: the Games menu (drift's column of bands on the left, over the
// blurred road), the invite (a card on the right with one lime button),
// the race clock (the race track's box top center: lights while the grid
// waits, then the time and the split), the order on the left, and the
// results (drift's timing tower, centered). A game fills them with its own
// rows; the look and the keys stay the same in all of them.

/** Type sizes for the bands, by the viewport (drift's). */
export const T = {
  hero: "clamp(30px, min(7vh, 9vw), 76px)",
  big: "clamp(16px, min(2.6vh, 4vw), 28px)",
  body: "clamp(11px, min(1.6vh, 3vw), 16px)",
  small: "clamp(9px, min(1.25vh, 2.4vw), 13px)",
};

export const who = (name: string) => (name.startsWith("guest-") ? "guest" : `@${name}`);

/** Hidden on a touch screen (no keyboard): key hints and key chips. */
export const KEYS_ONLY = "[@media(hover:none)]:hidden";

/** A row of key hints at the foot of a screen: "Enter pick · Esc back". Not on a phone. */
export function Keys({ keys, delay }: { keys: [string, string][]; delay?: number }) {
  return (
    <Band delay={delay} className={`flex-wrap gap-x-4 gap-y-1 px-4 py-2 text-muted ${KEYS_ONLY}`} style={{ fontSize: T.small }}>
      {keys.map(([k, label]) => (
        <span key={k}>
          <Chip>{k}</Chip> {label}
        </span>
      ))}
    </Band>
  );
}

// ─── Menu ────────────────────────────────────────────────────

export interface GameMode {
  id: string;
  icon: LucideIcon;
  name: string;
  line: string;
  /** "1+", "2+": how many it takes. */
  need: string;
  /** Can't start right now, and why (shown instead of the line). */
  blocked?: string | null;
}

/**
 * The Games menu: a column of bands on the left over the blurred road. Its
 * first step lists the modes (↑↓, Enter); a mode can bring its own step
 * (`children`), which takes the column's place until Esc.
 */
export function GameMenu({
  title,
  modes,
  onPick,
  onClose,
  children,
}: {
  title: string;
  modes: GameMode[];
  onPick: (id: string) => void;
  onClose: () => void;
  /** A mode's own step (the race's route), instead of the list. */
  children?: ReactNode;
}) {
  const [sel, setSel] = useState(0);
  const step = !!children;
  useEffect(() => {
    if (step) return;
    const on = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === "ArrowUp" || e.code === "KeyW") setSel((s) => (s - 1 + modes.length) % modes.length);
      else if (e.code === "ArrowDown" || e.code === "KeyS") setSel((s) => (s + 1) % modes.length);
      else if (e.code === "Enter") {
        const m = modes[sel];
        if (m && !m.blocked) onPick(m.id);
      } else if (e.code === "Escape" || e.code === "KeyG") onClose();
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener("keydown", on, true);
    return () => window.removeEventListener("keydown", on, true);
  }, [step, modes, sel, onPick, onClose]);
  return (
    <div className="pointer-events-auto absolute inset-0">
      <div className="absolute inset-0" onClick={onClose} aria-hidden>
        <Backdrop side="left" />
      </div>
      <div role="dialog" aria-label={title} className="absolute inset-y-0 left-[6vw] flex w-[min(520px,88vw)] flex-col justify-center gap-1.5 overflow-y-auto py-4 max-sm:left-4 max-sm:w-[calc(100vw-2rem)]">
        {children ?? (
          <>
            <button type="button" onClick={onClose} className="text-left outline-none active:translate-y-px">
              <Band className="w-full justify-between px-4 py-2 text-lime" style={{ fontSize: T.small }}>
                <span>{title}</span>
                <span className="text-muted">Close ✕</span>
              </Band>
            </button>
            {modes.map((m, i) => {
              const on = i === sel;
              return (
                <button
                  key={m.id}
                  type="button"
                  disabled={!!m.blocked}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => onPick(m.id)}
                  className="text-left outline-none disabled:cursor-not-allowed"
                >
                  <Band tone={on && !m.blocked ? "lime" : "dark"} delay={60 + i * 50} className="w-full items-center gap-4 px-5 py-3">
                    <m.icon size={22} strokeWidth={2.5} aria-hidden className={m.blocked ? "opacity-40" : undefined} />
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className={m.blocked ? "opacity-50" : undefined} style={{ fontSize: T.big }}>
                        {m.name}
                      </span>
                      <span className={`normal-case ${on && !m.blocked ? "text-bg/70" : "text-muted"}`} style={{ fontSize: T.small }}>
                        {m.blocked ?? m.line}
                      </span>
                    </span>
                    <span style={{ fontSize: T.small }}>{m.need}</span>
                  </Band>
                </button>
              );
            })}
            <Keys
              delay={60 + modes.length * 50}
              keys={[
                ["↑↓", "choose"],
                ["Enter", "pick"],
                ["Esc", "back to driving"],
              ]}
            />
          </>
        )}
      </div>
    </div>
  );
}

// ─── Invite ──────────────────────────────────────────────────

/**
 * Someone started a game you can join: a card on the right, its lines, and
 * one lime button that darkens as the time runs out. `onJoin` null: the
 * card only tells (you're in already, waiting for the others).
 */
export function GameInvite({
  kind,
  icon: Icon,
  title,
  lines,
  endsAt,
  serverNow,
  total,
  action,
  onJoin,
}: {
  kind: string;
  icon: LucideIcon;
  title: string;
  lines: string[];
  /** When the invite closes, and how long it ran (server ms). */
  endsAt: number;
  serverNow: number;
  total: number;
  action: string;
  onJoin: (() => void) | null;
}) {
  const leftMs = Math.max(0, endsAt - serverNow);
  const k = total > 0 ? leftMs / total : 0;
  const left = Math.ceil(leftMs / 1000);
  useEffect(() => {
    if (!onJoin) return;
    const on = (e: KeyboardEvent) => {
      if (e.code !== "KeyJ" || e.repeat) return;
      e.preventDefault();
      onJoin();
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [onJoin]);
  return (
    <div className="absolute right-4 top-20 flex w-[min(360px,calc(100vw-2rem))] flex-col gap-1 max-sm:top-[7.5rem]">
      <Band className="flex-col items-start gap-1.5 px-4 py-3" style={{ fontSize: T.small }}>
        <span className="flex items-center gap-2 text-lime">
          <Icon size={13} strokeWidth={2.5} aria-hidden /> {kind}
        </span>
        <span className="normal-case text-cream" style={{ fontSize: T.body }}>
          {title}
        </span>
        {lines.map((l) => (
          <span key={l} className="normal-case text-muted">
            {l}
          </span>
        ))}
      </Band>
      {onJoin ? (
        <button
          type="button"
          onClick={onJoin}
          className="drift-band pointer-events-auto relative overflow-hidden bg-lime text-bg shadow-[0_6px_0_rgba(0,0,0,0.35)] transition-[filter] hover:brightness-110 active:translate-y-px"
          style={{ fontSize: T.body, animationDelay: "60ms" }}
        >
          <span className="absolute inset-y-0 left-0 bg-black/15" style={{ width: `${(1 - k) * 100}%` }} aria-hidden />
          <span className="relative flex min-h-11 items-center justify-between gap-3 px-4 py-3">
            <span className="flex items-center gap-3">
              <span className={KEYS_ONLY}>
                <Chip tone="dark">J</Chip>
              </span>{" "}
              {action}
            </span>
            <span className="tabular-nums">{left}s</span>
          </span>
        </button>
      ) : (
        <Band delay={60} className="justify-between gap-3 px-4 py-3 text-cream" style={{ fontSize: T.body }}>
          <span>{action}</span>
          <span className="tabular-nums text-muted">{left}s</span>
        </Band>
      )}
    </div>
  );
}

// ─── Racing ──────────────────────────────────────────────────

export const LIGHTS = 5;

/**
 * The race clock, top center (the race track's box). Before the start the
 * lights sit where the time will be, one a second; at lights out the clock
 * runs. A split against the record shows under it for a moment at each gate.
 */
export function GameClock({
  label,
  lit,
  ms,
  split,
  go,
  note,
}: {
  /** "Gate 3/14 · P2/6", or the grid line before the start. */
  label: ReactNode;
  /** Lights on (0–5) while the grid waits; null once it runs. */
  lit: number | null;
  ms: number;
  /** Ahead (negative) or behind the record at the last gate (ms), or null. */
  split: number | null;
  /** GO, for a moment after lights out. */
  go: boolean;
  /** A line under it (a run that isn't timed). */
  note?: ReactNode;
}) {
  return (
    <div className="absolute left-1/2 top-4 flex -translate-x-1/2 flex-col items-center gap-1.5 max-sm:top-[4.25rem]">
      <div className={`${HUD_BOX} flex min-w-[240px] flex-col items-center px-5 py-2`}>
        <span className="text-[9px] text-muted">{label}</span>
        {lit !== null ? (
          <span className="flex h-9 items-center gap-1.5" role="img" aria-label={`${lit} of ${LIGHTS} lights on`}>
            {Array.from({ length: LIGHTS }, (_, i) => (
              <span key={i} className={`size-7 border-[3px] border-bg ${i < lit ? "bg-[#ff2a2a] shadow-[0_0_18px_#ff2a2a]" : "bg-[#2a1416]"}`} />
            ))}
          </span>
        ) : (
          <span className="text-3xl tabular-nums text-cream">{formatLap(ms)}</span>
        )}
      </div>
      {split !== null && (
        <span className={`border-[3px] border-bg px-3 py-1 text-base tabular-nums text-white ${split <= 0 ? "bg-[#1f9d55]" : "bg-[#e0323c]"}`}>
          {split <= 0 ? "-" : "+"}
          {(Math.abs(split) / 1000).toFixed(3)}
        </span>
      )}
      {go && <span className="text-4xl text-lime drop-shadow-[0_2px_0_#000]">Go</span>}
      {note}
    </div>
  );
}

export interface StandingRow {
  id: string;
  name: string;
  you: boolean;
  /** Right column: gates, a gap, "in". */
  value: string;
}

/** The order on the left, the race track's list: place, car color, name, a value. */
export function GameStandings({ rows }: { rows: StandingRow[] }) {
  return (
    <ol className={`${HUD_BOX} absolute left-4 top-4 w-[220px] space-y-1 px-3 py-2.5 max-sm:hidden`}>
      {rows.map((r, i) => (
        <li key={r.id} className={`flex items-center gap-2 text-[10px] ${r.you ? "text-lime" : "text-cream"}`}>
          <span className="w-4 text-right text-muted">{i + 1}</span>
          <span className="size-2.5 shrink-0" style={{ background: carColor(r.name) }} aria-hidden />
          <span className="min-w-0 flex-1 truncate normal-case">{who(r.name)}</span>
          <span className="tabular-nums text-muted">{r.value}</span>
        </li>
      ))}
    </ol>
  );
}

// ─── Results ─────────────────────────────────────────────────

export interface ResultRow {
  id: string;
  name: string;
  you: boolean;
  /** "P1", or "–" for one who didn't finish. */
  place: string;
  value: string;
}

/**
 * The results, drift's timing tower centered over the blurred road: what it
 * was, your place and time on cream, a lime band when there's news (a
 * record, points), everyone in order, then Enter (again) and Esc (drive on).
 */
export function GameResults({
  title,
  place,
  time,
  news,
  status,
  rows,
  again,
  onAgain,
  onClose,
}: {
  title: string;
  place: string;
  time: string | null;
  /** Lime bands: [left, right]. */
  news: [string, string][];
  /** A line while it isn't final yet ("The others have 21s"). */
  status?: string | null;
  rows: ResultRow[];
  again: string;
  onAgain: (() => void) | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === "Enter" && onAgain) onAgain();
      else if (e.code === "Escape") onClose();
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener("keydown", on, true);
    return () => window.removeEventListener("keydown", on, true);
  }, [onAgain, onClose]);
  const tone = (r: ResultRow): Tone => (r.you ? "lime" : "dark");
  return (
    <div className="pointer-events-auto absolute inset-0">
      <Backdrop />
      <div className="absolute inset-0 flex items-center justify-center overflow-y-auto px-4 py-6">
        <div role="dialog" aria-label={title} className="flex w-[min(480px,100%)] flex-col gap-1">
          <Band className="justify-center px-4 py-2 text-center normal-case text-lime" style={{ fontSize: T.small }}>
            {title}
          </Band>
          <Band tone="cream" delay={60} className="flex-col items-center gap-1 px-5 pb-3 pt-4">
            <span style={{ fontSize: T.small }}>{place}</span>
            {time && (
              <span className="leading-none tabular-nums" style={{ fontSize: T.hero }}>
                {time}
              </span>
            )}
          </Band>
          {news.map(([l, r], i) => (
            <Band key={l} tone="lime" delay={120 + i * 40} className="justify-between gap-4 px-4 py-2" style={{ fontSize: T.body }}>
              <span>{l}</span>
              <span>{r}</span>
            </Band>
          ))}
          {status && (
            <Band delay={140} className="justify-center px-4 py-2 normal-case text-muted" style={{ fontSize: T.small }}>
              {status}
            </Band>
          )}
          <div className="mt-2 flex flex-col gap-0.5">
            {rows.map((r, i) => (
              <Band key={r.id} tone={tone(r)} delay={180 + i * 50} className="gap-3 px-4 py-1.5" style={{ fontSize: T.small }}>
                <span className="w-6 opacity-60">{r.place}</span>
                <span className="size-2.5 shrink-0" style={{ background: carColor(r.name) }} aria-hidden />
                <span className="min-w-0 flex-1 truncate normal-case">{who(r.name)}</span>
                <span className="tabular-nums">{r.value}</span>
              </Band>
            ))}
          </div>
          <div className="mt-3 flex justify-center gap-1.5">
            {onAgain && (
              <button type="button" onClick={onAgain} className="active:translate-y-px">
                <Band tone="lime" delay={180 + rows.length * 50} className="min-h-11 gap-3 px-4 py-2" style={{ fontSize: T.small }}>
                  <span className={KEYS_ONLY}>
                    <Chip tone="dark">Enter</Chip>
                  </span>{" "}
                  {again}
                </Band>
              </button>
            )}
            <button type="button" onClick={onClose} className="active:translate-y-px">
              <Band delay={220 + rows.length * 50} className="min-h-11 gap-3 px-4 py-2 text-cream" style={{ fontSize: T.small }}>
                <span className={KEYS_ONLY}>
                  <Chip>Esc</Chip>
                </span>{" "}
                Drive on
              </Band>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** A small band top center while others play and you watch: "Race on: A → B · 3 racing". */
export function GameOnBand({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <div className="absolute left-1/2 top-16 max-w-[calc(100vw-2rem)] -translate-x-1/2 max-sm:top-[4.5rem]">
      <Band className="max-w-full gap-2 px-4 py-2 normal-case text-muted" style={{ fontSize: T.small }}>
        <Icon size={12} strokeWidth={2.5} className="shrink-0 text-lime" aria-hidden />
        <span className="min-w-0 truncate">{children}</span>
      </Band>
    </div>
  );
}
