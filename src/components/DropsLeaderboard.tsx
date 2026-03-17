"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useLeaderboardAuth } from "@/components/LeaderboardYouBadge";

const ACCENT = "#c8e64a";

interface DropsEntry {
  rank: number;
  developer_id: number;
  login: string;
  avatar_url: string | null;
  name: string | null;
  points: number;
}

function rankColor(rank: number): string {
  if (rank === 1) return "#ffd700";
  if (rank === 2) return "#c0c0c0";
  if (rank === 3) return "#cd7f32";
  return ACCENT;
}

export default function DropsLeaderboard() {
  const authLogin = useLeaderboardAuth();
  const [period, setPeriod] = useState<"weekly" | "alltime">("weekly");
  const [leaderboard, setLeaderboard] = useState<DropsEntry[]>([]);
  const [myRank, setMyRank] = useState<{ rank: number; points: number } | null>(null);
  const [active, setActive] = useState<{ count: number; districts: string[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/drops/leaderboard?period=${period}`)
      .then((r) => r.json())
      .then((data) => {
        setLeaderboard(data.leaderboard ?? []);
        setMyRank(data.my_rank ?? null);
        if (data.active) setActive(data.active);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [period]);

  const userIndex = authLogin
    ? leaderboard.findIndex((e) => e.login?.toLowerCase() === authLogin)
    : -1;
  const isOnBoard = userIndex >= 0;

  return (
    <div className="mt-6">
      {/* Period selector */}
      <div className="flex justify-center gap-2">
        {(["weekly", "alltime"] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className="border-2 px-3 py-1.5 text-[10px] transition-colors"
            style={{
              borderColor: period === p ? ACCENT : "var(--color-border)",
              color: period === p ? ACCENT : "var(--color-muted)",
              backgroundColor: period === p ? "rgba(200, 230, 74, 0.1)" : "transparent",
            }}
          >
            {p === "weekly" ? "This Week" : "All Time"}
          </button>
        ))}
      </div>

      <div className="mt-3 text-center">
        <p className="text-xs text-muted normal-case">
          {period === "weekly"
            ? "Resets every Monday. Pull drops to earn points."
            : "Total pull points accumulated across all time."}
        </p>
      </div>

      {/* Active drops banner */}
      {active && active.count > 0 && (
        <div
          className="mt-4 border-2 px-4 py-3 text-center text-xs normal-case"
          style={{ borderColor: "#ffaa0044", backgroundColor: "#ffaa0008", color: "#ffaa00" }}
        >
          <span className="font-bold">{active.count} drop{active.count !== 1 ? "s" : ""} active</span>
          {active.districts.length > 0 && (
            <span className="text-cream">
              {" "}in {active.districts.slice(0, 3).join(", ")}
              {active.districts.length > 3 ? ` +${active.districts.length - 3} more` : ""}
            </span>
          )}
        </div>
      )}

      {/* User rank box */}
      {authLogin && myRank && (
        <div
          className="mt-5 border-[3px] px-5 py-4 text-center"
          style={{
            borderColor: ACCENT,
            backgroundColor: "rgba(200, 230, 74, 0.08)",
          }}
        >
          <p className="text-xs normal-case text-cream">
            You have{" "}
            <span className="font-bold" style={{ color: ACCENT }}>
              {myRank.points} pts
            </span>{" "}
            · Rank{" "}
            <span className="font-bold" style={{ color: ACCENT }}>
              #{myRank.rank}
            </span>
          </p>
        </div>
      )}

      {/* CTA if user not on board */}
      {authLogin && !isOnBoard && !myRank && !loading && (
        <Link
          href="/"
          className="btn-press mt-5 block border-[3px] px-5 py-4 text-center text-xs normal-case transition-colors"
          style={{ borderColor: ACCENT, color: ACCENT }}
        >
          Explore the city and pull drops to join the board &rarr;
        </Link>
      )}

      {/* Table */}
      <div className="mt-6 border-[3px] border-border">
        <div className="flex items-center gap-4 border-b-[3px] border-border bg-bg-card px-5 py-3 text-xs text-muted">
          <span className="w-10 text-center">#</span>
          <span className="flex-1">Developer</span>
          <span className="w-24 text-right">Points</span>
        </div>

        {!loading &&
          leaderboard.map((entry) => {
            const isYou = authLogin && entry.login?.toLowerCase() === authLogin;
            return (
              <Link
                key={entry.login}
                href={`/dev/${entry.login}`}
                className="flex items-center gap-4 border-b border-border/50 px-5 py-3.5 transition-colors hover:bg-bg-card"
                style={isYou ? { backgroundColor: "rgba(200, 230, 74, 0.06)" } : undefined}
              >
                <span className="w-10 text-center">
                  <span className="text-sm font-bold" style={{ color: rankColor(entry.rank) }}>
                    {entry.rank}
                  </span>
                </span>

                <div className="flex flex-1 items-center gap-3 overflow-hidden">
                  {entry.avatar_url && (
                    <Image
                      src={entry.avatar_url}
                      alt={entry.login}
                      width={36}
                      height={36}
                      className="border-2 border-border"
                      style={{ imageRendering: "pixelated" }}
                    />
                  )}
                  <div className="overflow-hidden">
                    <p className="truncate text-sm text-cream">
                      {entry.name ?? entry.login}
                      {isYou && (
                        <span className="ml-2 text-[10px]" style={{ color: ACCENT }}>
                          YOU
                        </span>
                      )}
                    </p>
                    <p className="truncate text-[10px] text-muted">@{entry.login}</p>
                  </div>
                </div>

                <span className="w-24 text-right text-sm" style={{ color: ACCENT }}>
                  {entry.points}
                </span>
              </Link>
            );
          })}

        {loading && (
          <div className="px-5 py-8 text-center text-xs text-muted normal-case">Loading...</div>
        )}

        {!loading && leaderboard.length === 0 && (
          <div className="px-5 py-8 text-center text-xs text-muted normal-case">
            No pulls yet. Explore the city to find drops!
          </div>
        )}
      </div>
    </div>
  );
}
