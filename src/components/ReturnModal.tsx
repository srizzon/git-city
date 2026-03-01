"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import type { StreakData } from "@/lib/useStreakCheckin";

function getTierColor(streak: number) {
  if (streak >= 30) return "#aa44ff";
  if (streak >= 14) return "#ff2222";
  if (streak >= 7) return "#ff8833";
  return "#4488ff";
}

interface Props {
  streakData: StreakData;
  onClose: () => void;
}

export default function ReturnModal({ streakData, onClose }: Props) {
  const { streak, was_frozen, new_achievements, unseen_count } = streakData;
  const color = getTierColor(streak);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const [visible, setVisible] = useState(false);

  const handleClose = useCallback(() => {
    if (unseen_count > 0) {
      fetch("/api/achievements/mark-seen", { method: "POST" }).catch(() => {});
    }
    setVisible(false);
    setTimeout(onClose, 300);
  }, [unseen_count, onClose]);

  // Animate in
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  // Auto-dismiss after 4s (6s if there are new badges)
  useEffect(() => {
    const delay = new_achievements.length > 0 ? 6000 : 4000;
    timerRef.current = setTimeout(handleClose, delay);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [handleClose, new_achievements.length]);

  const raids = streakData.raids_since_last ?? [];
  const successfulRaids = raids.filter((r) => r.success);
  const failedRaids = raids.filter((r) => !r.success);

  const parts: string[] = [];
  if (was_frozen) parts.push("Freeze used");
  if (new_achievements.length > 0) {
    parts.push(`${new_achievements.length} new badge${new_achievements.length > 1 ? "s" : ""}`);
  }
  if (successfulRaids.length > 0) {
    parts.push(`Raided by ${successfulRaids.map((r) => r.attacker_login).join(", ")}`);
  }
  if (failedRaids.length > 0 && successfulRaids.length === 0) {
    parts.push(`Defended ${failedRaids.length} raid${failedRaids.length > 1 ? "s" : ""}`);
  }
  const subtitle = parts.length > 0 ? parts.join(" · ") : null;

  return (
    <div
      className="pointer-events-auto fixed bottom-6 left-1/2 z-50 cursor-pointer"
      onClick={handleClose}
      style={{
        transform: `translateX(-50%) translateY(${visible ? "0" : "16px"})`,
        opacity: visible ? 1 : 0,
        transition: "transform 0.3s ease-out, opacity 0.3s ease-out",
      }}
    >
      <div
        className="flex items-center gap-3 border-[2px] bg-bg-raised/95 px-4 py-2.5 backdrop-blur-sm"
        style={{ borderColor: color }}
      >
        <span className="text-lg font-bold" style={{ color }}>
          {streak}
        </span>

        <div className="flex flex-col">
          <span className="text-[10px] text-cream">
            day streak | 连续天数 {was_frozen ? " (saved)" : ""}
          </span>
          {subtitle && (
            <span className="text-[9px] text-muted">{subtitle}</span>
          )}
        </div>

        <div
          className="h-5 w-1 rounded-full"
          style={{ backgroundColor: color }}
        />
      </div>
    </div>
  );
}
