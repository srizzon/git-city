"use client";

import { useEffect } from "react";
import { trackLeaderboardViewed } from "@/lib/himetrica";

export default function LeaderboardTracker({ tab }: { tab: string }) {
  useEffect(() => {
    trackLeaderboardViewed(tab);
    // Fire-and-forget daily mission tracking
    fetch("/api/dailies/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mission_id: "check_leaderboard" }),
    }).catch(() => {});
  }, [tab]);
  return null;
}
