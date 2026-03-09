"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useLeaderboardAuth } from "@/components/LeaderboardYouBadge";

const ACCENT = "#c8e64a";
const FIRST_SEED = "2026-1";

// ── Types ──────────────────────────────────────────────────────────────

interface FlyEntry {
  score: number;
  collected: number;
  max_combo: number;
  flight_ms: number;
  created_at: string;
  github_login: string;
  avatar_url: string | null;
}

export interface FlyHistory {
  seeds: Record<string, { bestScore: number; playCount: number }>;
  currentStreak: number;
  longestStreak: number;
  lastPlayedSeed: string;
}

// ── Seed utilities ─────────────────────────────────────────────────────

function getTodaySeed(): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  const dayOfYear = Math.floor(diff / 86400000);
  return `${now.getFullYear()}-${dayOfYear}`;
}

function seedToDate(seed: string): Date {
  const [year, day] = seed.split("-").map(Number);
  const d = new Date(year, 0);
  d.setDate(day);
  return d;
}

function formatSeedDate(seed: string): string {
  return seedToDate(seed)
    .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    .toUpperCase();
}

function prevSeed(seed: string): string | null {
  if (seed === FIRST_SEED) return null;
  const d = seedToDate(seed);
  d.setDate(d.getDate() - 1);
  const start = new Date(d.getFullYear(), 0, 0);
  const diff = d.getTime() - start.getTime();
  const dayOfYear = Math.floor(diff / 86400000);
  const result = `${d.getFullYear()}-${dayOfYear}`;
  // Don't go before the first seed
  if (seedToDate(result) < seedToDate(FIRST_SEED)) return null;
  return result;
}

function nextSeed(seed: string): string | null {
  const today = getTodaySeed();
  if (seed === today) return null;
  const d = seedToDate(seed);
  d.setDate(d.getDate() + 1);
  const start = new Date(d.getFullYear(), 0, 0);
  const diff = d.getTime() - start.getTime();
  const dayOfYear = Math.floor(diff / 86400000);
  const result = `${d.getFullYear()}-${dayOfYear}`;
  // Don't go past today
  if (seedToDate(result) > seedToDate(today)) return null;
  return result;
}

// ── localStorage helpers ───────────────────────────────────────────────

function loadFlyHistory(): FlyHistory | null {
  try {
    const raw = localStorage.getItem("gitcity_fly_history");
    if (!raw) return null;
    return JSON.parse(raw) as FlyHistory;
  } catch {
    return null;
  }
}

// ── Visual helpers ─────────────────────────────────────────────────────

function rankColor(rank: number): string {
  if (rank === 1) return "#ffd700";
  if (rank === 2) return "#c0c0c0";
  if (rank === 3) return "#cd7f32";
  return ACCENT;
}

// ── Component ──────────────────────────────────────────────────────────

export default function FlyLeaderboard() {
  const authLogin = useLeaderboardAuth();
  const [leaderboard, setLeaderboard] = useState<FlyEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [viewingSeed, setViewingSeed] = useState(getTodaySeed);
  const [loading, setLoading] = useState(true);
  const [personalBest, setPersonalBest] = useState<number | null>(null);
  const [history, setHistory] = useState<FlyHistory | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const todaySeed = getTodaySeed();
  const isToday = viewingSeed === todaySeed;

  // Fetch leaderboard for the viewing seed
  useEffect(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);

    fetch(`/api/fly-scores?seed=${viewingSeed}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((data) => {
        if (!ctrl.signal.aborted) {
          setLeaderboard(data.leaderboard ?? []);
          setTotal(data.total ?? 0);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });

    return () => ctrl.abort();
  }, [viewingSeed]);

  // Load personal best + history on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem("gitcity_fly_pb");
      if (stored) setPersonalBest(parseInt(stored, 10));
    } catch {}
    setHistory(loadFlyHistory());
  }, []);

  // Derived stats from history
  const daysPlayed = history ? Object.keys(history.seeds).length : 0;
  const bestAllTime = history
    ? Math.max(0, ...Object.values(history.seeds).map((s) => s.bestScore))
    : personalBest ?? 0;
  const currentStreak = history?.currentStreak ?? 0;
  const hasStats = daysPlayed > 0;

  // Find user in leaderboard
  const userIndex = authLogin
    ? leaderboard.findIndex(
        (e) => e.github_login?.toLowerCase() === authLogin,
      )
    : -1;
  const userEntry = userIndex >= 0 ? leaderboard[userIndex] : null;
  const userRank = userIndex >= 0 ? userIndex + 1 : null;
  const percentile =
    userRank && total > 0
      ? Math.round((userRank / total) * 100)
      : null;

  // Navigation handlers
  const goPrev = () => {
    const p = prevSeed(viewingSeed);
    if (p) setViewingSeed(p);
  };
  const goNext = () => {
    const n = nextSeed(viewingSeed);
    if (n) setViewingSeed(n);
  };
  const goToday = () => setViewingSeed(todaySeed);

  const canGoPrev = prevSeed(viewingSeed) !== null;
  const canGoNext = nextSeed(viewingSeed) !== null;

  return (
    <div className="mt-6">
      {/* Day navigator */}
      <div className="text-center">
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={goPrev}
            disabled={!canGoPrev}
            className="px-2 py-1 text-sm transition-opacity disabled:opacity-20"
            style={{ color: ACCENT }}
            aria-label="Previous day"
          >
            &#9664;
          </button>

          <button
            onClick={goToday}
            className="text-sm text-cream hover:underline"
            title="Go to today"
          >
            {formatSeedDate(viewingSeed)}
            {isToday && (
              <span
                className="ml-2 text-[10px] font-bold"
                style={{ color: ACCENT }}
              >
                [TODAY]
              </span>
            )}
          </button>

          <button
            onClick={goNext}
            disabled={!canGoNext}
            className="px-2 py-1 text-sm transition-opacity disabled:opacity-20"
            style={{ color: ACCENT }}
            aria-label="Next day"
          >
            &#9654;
          </button>
        </div>
        <p className="mt-2 text-[10px] text-muted normal-case">
          {isToday
            ? "Same course for all pilots today."
            : "Challenge ended."}
        </p>
      </div>

      {/* Stats bar */}
      {hasStats && (
        <div className="mt-4 flex border-[3px] border-border text-center">
          <div className="flex-1 border-r border-border/50 px-3 py-3">
            <p
              className="text-lg font-bold"
              style={{ color: currentStreak >= 3 ? "#f59e0b" : ACCENT }}
            >
              {currentStreak}
            </p>
            <p className="text-[9px] text-muted">
              DAY{currentStreak !== 1 ? "S" : ""} STREAK
            </p>
          </div>
          <div className="flex-1 border-r border-border/50 px-3 py-3">
            <p className="text-lg font-bold" style={{ color: ACCENT }}>
              {daysPlayed}
            </p>
            <p className="text-[9px] text-muted">
              DAY{daysPlayed !== 1 ? "S" : ""} PLAYED
            </p>
          </div>
          <div className="flex-1 px-3 py-3">
            <p className="text-lg font-bold" style={{ color: ACCENT }}>
              {bestAllTime}
            </p>
            <p className="text-[9px] text-muted">BEST PX</p>
          </div>
        </div>
      )}

      {/* User rank box */}
      {authLogin && userEntry && userRank && (
        <div
          className="mt-5 border-[3px] px-5 py-4 text-center"
          style={{
            borderColor: ACCENT,
            backgroundColor: "rgba(200, 230, 74, 0.08)",
          }}
        >
          <p className="text-xs normal-case text-cream">
            You scored{" "}
            <span className="font-bold" style={{ color: ACCENT }}>
              {userEntry.score} PX
            </span>{" "}
            · Rank{" "}
            <span className="font-bold" style={{ color: ACCENT }}>
              #{userRank}
            </span>{" "}
            of{" "}
            <span className="font-bold">{total} pilots</span>
            {percentile !== null && (
              <>
                {" "}
                · <span className="font-bold" style={{ color: ACCENT }}>Top {percentile}%</span>
              </>
            )}
          </p>
        </div>
      )}

      {/* CTA — only show for today */}
      {isToday && !userEntry && (
        <Link
          href="/"
          className="btn-press mt-5 block border-[3px] px-5 py-4 text-center text-xs normal-case transition-colors"
          style={{
            borderColor: ACCENT,
            color: ACCENT,
          }}
        >
          Take today&apos;s challenge &rarr;
        </Link>
      )}

      {/* Top 20 table */}
      <div className="mt-6 border-[3px] border-border">
        {/* Header row */}
        <div className="flex items-center gap-4 border-b-[3px] border-border bg-bg-card px-5 py-3 text-xs text-muted">
          <span className="w-10 text-center">#</span>
          <span className="flex-1">Pilot</span>
          <span className="hidden w-16 text-right sm:block">Time</span>
          <span className="hidden w-20 text-right sm:block">Collected</span>
          <span className="w-24 text-right">Score</span>
        </div>

        {/* Rows */}
        {!loading &&
          leaderboard.map((entry, i) => {
            const pos = i + 1;
            const isYou =
              authLogin &&
              entry.github_login?.toLowerCase() === authLogin;
            return (
              <div
                key={`${entry.github_login}-${i}`}
                className="flex items-center gap-4 border-b border-border/50 px-5 py-3.5 transition-colors hover:bg-bg-card"
                style={
                  isYou
                    ? { backgroundColor: "rgba(200, 230, 74, 0.06)" }
                    : undefined
                }
              >
                <span className="w-10 text-center">
                  <span
                    className="text-sm font-bold"
                    style={{ color: rankColor(pos) }}
                  >
                    {pos}
                  </span>
                </span>

                <div className="flex flex-1 items-center gap-3 overflow-hidden">
                  {entry.avatar_url && (
                    <Image
                      src={entry.avatar_url}
                      alt={entry.github_login}
                      width={36}
                      height={36}
                      className="border-2 border-border"
                      style={{ imageRendering: "pixelated" }}
                    />
                  )}
                  <div className="overflow-hidden">
                    <p className="truncate text-sm text-cream">
                      {entry.github_login}
                      {isYou && (
                        <span
                          className="ml-2 text-[10px]"
                          style={{ color: ACCENT }}
                        >
                          YOU
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                <span className="hidden w-16 text-right text-xs text-muted sm:block">
                  {Math.floor(entry.flight_ms / 60000)}:{String(Math.floor((entry.flight_ms % 60000) / 1000)).padStart(2, "0")}
                </span>

                <span className="hidden w-20 text-right text-xs text-muted sm:block">
                  {entry.collected}/40
                </span>

                <span
                  className="w-24 text-right text-sm"
                  style={{ color: ACCENT }}
                >
                  {entry.score} PX
                </span>
              </div>
            );
          })}

        {loading && (
          <div className="px-5 py-8 text-center text-xs text-muted normal-case">
            Loading...
          </div>
        )}

        {!loading && leaderboard.length === 0 && (
          <div className="px-5 py-8 text-center text-xs text-muted normal-case">
            {isToday
              ? "No flights recorded today. Be the first pilot!"
              : "No flights recorded."}
          </div>
        )}
      </div>

      {/* Personal best — only show if no history stats (backward compat) */}
      {!hasStats && personalBest !== null && personalBest > 0 && (
        <div className="mt-4 text-center text-[10px] text-muted normal-case">
          Your all-time best:{" "}
          <span style={{ color: ACCENT }}>{personalBest} PX</span>
        </div>
      )}
    </div>
  );
}
