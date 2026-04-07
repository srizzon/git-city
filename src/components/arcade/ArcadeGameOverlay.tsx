"use client";

import { useState, useEffect, useRef } from "react";
import { sendGameStart, sendGameStop } from "@/lib/arcade/network/client";
import type { GameResult } from "@/lib/arcade/types";

type GameState = "attract" | "playing" | "result";

interface LeaderboardEntry {
  rank: number;
  login: string;
  best_ms: number;
  attempts: number;
}

const MILESTONE_LABELS: Record<string, string> = {
  first_try: "First Try",
  close_enough: "Close Enough",
  sharp: "Sharp",
  sniper: "Sniper",
  inhuman: "Inhuman",
  perfection: "Perfection",
};

const MILESTONE_PX: Record<string, number> = {
  first_try: 5, close_enough: 10, sharp: 25, sniper: 50, inhuman: 100, perfection: 250,
};

function fmtTime(ms: number): string {
  return (ms / 1000).toFixed(3);
}

function fmtDiff(ms: number): string {
  if (ms === 0) return "PERFECT";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Precision label based on diff */
function precisionLabel(ms: number): { text: string; color: string } {
  if (ms === 0) return { text: "PERFECT", color: "var(--color-lime)" };
  if (ms <= 5) return { text: "INHUMAN", color: "var(--color-lime)" };
  if (ms <= 10) return { text: "INSANE", color: "var(--color-lime)" };
  if (ms <= 25) return { text: "INCREDIBLE", color: "var(--color-lime)" };
  if (ms <= 50) return { text: "AMAZING", color: "var(--color-lime-dark)" };
  if (ms <= 100) return { text: "GREAT", color: "var(--color-cream)" };
  if (ms <= 250) return { text: "GOOD", color: "var(--color-cream-dark)" };
  if (ms <= 500) return { text: "OK", color: "var(--color-muted)" };
  if (ms <= 1000) return { text: "MEH", color: "var(--color-dim)" };
  return { text: "TRY AGAIN", color: "var(--color-dim)" };
}

/**
 * Fixed-width digit rendering to prevent Silkscreen jitter.
 * Each character gets an equal-width slot.
 */
function FixedDigits({ value, size, color }: { value: string; size: number; color?: string }) {
  const charW = size * 0.72;
  const dotW = size * 0.4;

  return (
    <span className="inline-flex justify-center" style={{ lineHeight: 1, color }}>
      {value.split("").map((ch, i) => (
        <span
          key={i}
          className="inline-block text-center font-bold"
          style={{ width: ch === "." ? dotW : charW, fontSize: size }}
        >
          {ch}
        </span>
      ))}
    </span>
  );
}

/** Visual precision bar — shows how close to 10s */
function PrecisionBar({ diffMs }: { diffMs: number }) {
  // Map diff to 0-100%. 0ms = 100%, 1000ms+ = 0%
  const pct = Math.max(0, Math.min(100, 100 - (diffMs / 10)));
  const barColor =
    pct >= 95 ? "var(--color-lime)"
    : pct >= 75 ? "var(--color-lime-dark)"
    : pct >= 50 ? "var(--color-cream-dark)"
    : "var(--color-dim)";

  return (
    <div className="w-full max-w-[240px]">
      <div className="w-full h-[6px]" style={{ background: "var(--color-border)" }}>
        <div
          className="h-full transition-all duration-300"
          style={{ width: `${pct}%`, background: barColor }}
        />
      </div>
      <div className="flex justify-between mt-1 text-[8px] text-dim">
        <span>1s off</span>
        <span>PERFECT</span>
      </div>
    </div>
  );
}

export default function ArcadeGameOverlay({
  onClose,
  isMobile,
}: {
  onClose: () => void;
  isMobile: boolean;
}) {
  const [state, setState] = useState<GameState>("attract");
  const [displayMs, setDisplayMs] = useState(0);
  const [stoppedMs, setStoppedMs] = useState(0);
  const [serverResult, setServerResult] = useState<GameResult | null>(null);
  const [serverTimeout, setServerTimeout] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);
  // Track personal best locally for instant feedback
  const bestRef = useRef<number | null>(null);

  const stateRef = useRef<GameState>("attract");
  const onCloseRef = useRef(onClose);
  const rafRef = useRef<number>(0);
  const startRef = useRef(0);
  onCloseRef.current = onClose;

  const fetchLeaderboard = () => {
    fetch("/api/arcade/leaderboard?game=10s_classic&limit=5")
      .then((r) => r.json())
      .then((data: { leaderboard?: LeaderboardEntry[] }) => setLeaderboard(data.leaderboard ?? []))
      .catch(() => {})
      .finally(() => setLeaderboardLoading(false));
  };
  useEffect(() => { fetchLeaderboard(); }, []);

  useEffect(() => {
    (window as unknown as Record<string, unknown>).__arcadeGameResult = (_game: string, r: GameResult) => {
      setServerResult(r);
      bestRef.current = r.best_ms;
    };
    (window as unknown as Record<string, unknown>).__arcadeGameAck = () => {};
    return () => {
      delete (window as unknown as Record<string, unknown>).__arcadeGameResult;
      delete (window as unknown as Record<string, unknown>).__arcadeGameAck;
    };
  }, []);

  const tickTimer = () => {
    if (stateRef.current !== "playing") return;
    setDisplayMs(performance.now() - startRef.current);
    rafRef.current = requestAnimationFrame(tickTimer);
  };
  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const doStart = () => {
    stateRef.current = "playing";
    setState("playing");
    setDisplayMs(0);
    setStoppedMs(0);
    setServerResult(null);
    setServerTimeout(false);
    startRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tickTimer);
    sendGameStart("10s_classic");
  };

  const doStop = () => {
    if (stateRef.current !== "playing") return;
    cancelAnimationFrame(rafRef.current);
    const elapsed = Math.round(performance.now() - startRef.current);
    const diff = Math.round(Math.abs(elapsed - 10_000));
    setDisplayMs(elapsed);
    setStoppedMs(elapsed);

    // Update local best immediately
    if (bestRef.current === null || diff < bestRef.current) {
      bestRef.current = diff;
    }

    stateRef.current = "result";
    setState("result");
    setServerResult(null);
    setServerTimeout(false);
    sendGameStop("10s_classic");
    setTimeout(fetchLeaderboard, 2000);
    setTimeout(() => setServerTimeout(true), 5000);
  };

  const doClose = () => {
    if (stateRef.current === "playing") return;
    cancelAnimationFrame(rafRef.current);
    onCloseRef.current();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { doClose(); return; }
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        const s = stateRef.current;
        if (s === "attract" || s === "result") doStart();
        else if (s === "playing") doStop();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clientDiffMs = Math.round(Math.abs(stoppedMs - 10_000));
  const diffMs = serverResult?.diff_ms ?? clientDiffMs;
  const precision = precisionLabel(diffMs);
  const isNewBest = bestRef.current !== null && clientDiffMs <= bestRef.current;

  return (
    <div className="absolute inset-0 z-[59] flex items-center justify-center bg-black/90">
      <div className="flex flex-col items-center justify-center w-full h-full px-6 py-8">

        {/* ═══ ATTRACT ═══ */}
        {state === "attract" && (
          <div className="flex flex-col items-center">
            <p className="text-[9px] tracking-[0.35em] uppercase mb-5 text-dim">
              E.ARCADE
            </p>

            <h1 className="text-[40px] sm:text-[56px] font-bold text-cream text-center leading-none mb-1">
              10 SECOND
            </h1>
            <h2 className="text-[22px] sm:text-[30px] font-bold tracking-[0.15em] text-lime mb-10">
              CHALLENGE
            </h2>

            {/* Leaderboard */}
            <div className="w-full max-w-[300px] mb-10">
              <p className="text-[9px] tracking-[0.2em] uppercase text-center mb-3 text-dim">
                HIGH SCORES
              </p>
              {leaderboardLoading ? (
                <p className="text-[11px] text-center text-dim">...</p>
              ) : leaderboard.length === 0 ? (
                <p className="text-[12px] text-center text-dim">No scores yet</p>
              ) : (
                <div className="space-y-2">
                  {leaderboard.map((entry) => (
                    <div key={entry.rank} className="flex items-baseline justify-between text-[14px]">
                      <span className="flex items-baseline gap-2">
                        <span className="text-[11px] text-dim">{entry.rank}.</span>
                        <span style={{ color: entry.rank === 1 ? "var(--color-lime)" : "var(--color-warm)" }}>
                          {entry.login}
                        </span>
                      </span>
                      <span className="font-bold" style={{ color: entry.rank === 1 ? "var(--color-lime)" : "var(--color-cream-dark)" }}>
                        {fmtDiff(entry.best_ms)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button onClick={doStart} className="cursor-pointer animate-pulse" style={{ background: "none", border: "none" }}>
              <span className="text-[16px] tracking-[0.1em] text-lime font-bold">
                {isMobile ? "TAP TO START" : "PRESS SPACE"}
              </span>
            </button>
          </div>
        )}

        {/* ═══ PLAYING ═══ */}
        {state === "playing" && (
          <div className="flex flex-col items-center">
            <div className="text-center mb-12">
              <div className="text-cream mb-3">
                <FixedDigits value={fmtTime(displayMs)} size={isMobile ? 56 : 72} />
              </div>
              <p className="text-[10px] tracking-[0.25em] uppercase text-dim">
                SECONDS
              </p>
            </div>

            <button onClick={doStop} className="cursor-pointer" style={{ background: "none", border: "none" }}>
              <span className="text-[16px] tracking-[0.1em] font-bold" style={{ color: "#c06050" }}>
                {isMobile ? "TAP TO STOP" : "PRESS SPACE"}
              </span>
            </button>
          </div>
        )}

        {/* ═══ RESULT ═══ */}
        {state === "result" && (
          <div className="flex flex-col items-center w-full">

            {/* Precision label — the emotional hit */}
            <p className="text-[14px] sm:text-[16px] font-bold tracking-[0.2em] uppercase mb-3" style={{ color: precision.color }}>
              {precision.text}
            </p>

            {/* THE DIFF — hero number */}
            <div className="mb-2" style={{ color: precision.color }}>
              <FixedDigits value={diffMs === 0 ? "0" : String(diffMs)} size={isMobile ? 56 : 72} />
            </div>
            <p className="text-[11px] tracking-[0.15em] uppercase mb-5" style={{ color: precision.color, opacity: 0.6 }}>
              {diffMs === 0 ? "PERFECT SCORE" : "MILLISECONDS OFF"}
            </p>

            {/* Precision bar */}
            <div className="mb-5 w-full flex justify-center">
              <PrecisionBar diffMs={diffMs} />
            </div>

            {/* Time + personal best row */}
            <div className="flex items-center gap-4 text-[11px] mb-5">
              <span className="text-dim">
                Time <span className="text-cream-dark font-bold">{fmtTime(stoppedMs)}s</span>
              </span>
              <span className="text-border">·</span>
              <span className="text-dim">
                Best <span className="text-cream-dark font-bold">{bestRef.current !== null ? fmtDiff(bestRef.current) : "—"}</span>
              </span>
              {serverResult && (
                <>
                  <span className="text-border">·</span>
                  <span className="text-dim">
                    Plays <span className="text-cream-dark font-bold">{serverResult.attempts}</span>
                  </span>
                </>
              )}
            </div>

            {/* NEW BEST badge */}
            {isNewBest && (
              <div className="mb-4">
                <span className="text-[11px] font-bold tracking-[0.12em] uppercase px-3 py-1 bg-lime text-bg">
                  NEW BEST!
                </span>
              </div>
            )}

            {/* Server extras (rank, milestones) — appears when ready, no blocking */}
            {serverResult && serverResult.rank !== null && serverResult.rank <= 10 && (
              <p className="text-[12px] font-bold tracking-[0.1em] uppercase mb-3" style={{
                color: serverResult.rank <= 3 ? "var(--color-lime)" : "var(--color-cream-dark)",
              }}>
                LEADERBOARD #{serverResult.rank}
              </p>
            )}

            {serverResult && serverResult.milestones_earned.length > 0 && (
              <div className="w-full max-w-[280px] mb-4 py-3 px-4 bg-bg-raised border border-border">
                <p className="text-[8px] tracking-[0.2em] uppercase text-center mb-2 text-lime-dark">
                  MILESTONES UNLOCKED
                </p>
                {serverResult.milestones_earned.map((m) => (
                  <div key={m} className="flex items-center justify-between text-[11px] py-0.5">
                    <span className="text-lime">{MILESTONE_LABELS[m] ?? m}</span>
                    <span className="text-lime-dark">+{MILESTONE_PX[m] ?? 0} PX</span>
                  </div>
                ))}
              </div>
            )}

            {/* RETRY — big, prominent, pulsing. The near-miss effect drives retention. */}
            <div className="flex flex-col items-center gap-3 mt-3">
              <button onClick={doStart} className="cursor-pointer animate-pulse" style={{ background: "none", border: "none" }}>
                <span className="text-[16px] tracking-[0.1em] text-lime font-bold">
                  {isMobile ? "TAP TO RETRY" : "SPACE  RETRY"}
                </span>
              </button>
              <button onClick={doClose} className="cursor-pointer" style={{ background: "none", border: "none" }}>
                <span className="text-[11px] tracking-[0.1em] text-dim">
                  {isMobile ? "CLOSE" : "ESC  EXIT"}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
