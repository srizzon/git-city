"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useLeaderboardAuth } from "@/components/LeaderboardYouBadge";

const ACCENT = "#c8e64a";

interface DailiesEntry {
  github_login: string;
  avatar_url: string | null;
  dailies_completed: number;
  dailies_streak: number;
}

function rankColor(rank: number): string {
  if (rank === 1) return "#ffd700";
  if (rank === 2) return "#c0c0c0";
  if (rank === 3) return "#cd7f32";
  return ACCENT;
}

export default function DailiesLeaderboard() {
  const authLogin = useLeaderboardAuth();
  const [leaderboard, setLeaderboard] = useState<DailiesEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dailies/leaderboard")
      .then((r) => r.json())
      .then((data) => {
        setLeaderboard(data.leaderboard ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Find user in leaderboard
  const userIndex = authLogin
    ? leaderboard.findIndex(
        (e) => e.github_login?.toLowerCase() === authLogin,
      )
    : -1;
  const userEntry = userIndex >= 0 ? leaderboard[userIndex] : null;
  const userRank = userIndex >= 0 ? userIndex + 1 : null;

  return (
    <div className="mt-6">
      <div className="text-center">
        <p className="text-xs text-muted normal-case">
          Ranked by current streak, then total completions.
        </p>
      </div>

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
            You&apos;re on a{" "}
            <span className="font-bold" style={{ color: ACCENT }}>
              {userEntry.dailies_streak}-day streak
            </span>{" "}
            with{" "}
            <span className="font-bold" style={{ color: ACCENT }}>
              {userEntry.dailies_completed}
            </span>{" "}
            total completions · Rank{" "}
            <span className="font-bold" style={{ color: ACCENT }}>
              #{userRank}
            </span>
          </p>
        </div>
      )}

      {/* CTA if user not on board */}
      {authLogin && !userEntry && !loading && (
        <Link
          href="/"
          className="btn-press mt-5 block border-[3px] px-5 py-4 text-center text-xs normal-case transition-colors"
          style={{
            borderColor: ACCENT,
            color: ACCENT,
          }}
        >
          Complete your daily missions to join the board &rarr;
        </Link>
      )}

      {/* Table */}
      <div className="mt-6 border-[3px] border-border">
        {/* Header row */}
        <div className="flex items-center gap-4 border-b-[3px] border-border bg-bg-card px-5 py-3 text-xs text-muted">
          <span className="w-10 text-center">#</span>
          <span className="flex-1">Developer</span>
          <span className="w-20 text-right">Streak</span>
          <span className="w-20 text-right">Total</span>
        </div>

        {/* Rows */}
        {!loading &&
          leaderboard.map((entry, i) => {
            const pos = i + 1;
            const isYou =
              authLogin &&
              entry.github_login?.toLowerCase() === authLogin;
            return (
              <Link
                key={entry.github_login}
                href={`/dev/${entry.github_login}`}
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
                      className="border-[2px] border-border"
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

                <span
                  className="w-20 text-right text-sm"
                  style={{ color: entry.dailies_streak >= 3 ? "#f59e0b" : ACCENT }}
                >
                  {entry.dailies_streak}d
                </span>

                <span
                  className="w-20 text-right text-sm"
                  style={{ color: ACCENT }}
                >
                  {entry.dailies_completed}
                </span>
              </Link>
            );
          })}

        {loading && (
          <div className="px-5 py-8 text-center text-xs text-muted normal-case">
            Loading...
          </div>
        )}

        {!loading && leaderboard.length === 0 && (
          <div className="px-5 py-8 text-center text-xs text-muted normal-case">
            No one has completed dailies yet. Be the first!
          </div>
        )}
      </div>
    </div>
  );
}
