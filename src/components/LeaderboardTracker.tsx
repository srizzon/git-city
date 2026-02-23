"use client";

import { useEffect } from "react";
import { trackLeaderboardViewed } from "@/lib/himetrica";

export default function LeaderboardTracker({ tab }: { tab: string }) {
  useEffect(() => {
    trackLeaderboardViewed(tab);
  }, [tab]);
  return null;
}
