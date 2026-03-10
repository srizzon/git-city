"use client";

import { memo, useEffect, useState } from "react";
import { rankFromLevel, tierFromLevel } from "@/lib/xp";

interface LevelUpToastProps {
  level: number;
  onDone: () => void;
}


export default memo(function LevelUpToast({ level, onDone }: LevelUpToastProps) {
  const [visible, setVisible] = useState(true);
  const rank = rankFromLevel(level);
  const tier = tierFromLevel(level);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onDone, 500);
    }, 4000);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div
      className="fixed left-1/2 top-20 z-70 -translate-x-1/2 transition-all duration-500"
      style={{ opacity: visible ? 1 : 0, transform: `translateX(-50%) translateY(${visible ? 0 : -20}px)` }}
    >
      <div
        className="flex flex-col items-center gap-1 border-[3px] px-8 py-4 backdrop-blur-sm"
        style={{
          borderColor: tier.color,
          backgroundColor: "rgba(10, 10, 10, 0.92)",
          boxShadow: `0 0 30px ${tier.color}40, inset 0 0 20px ${tier.color}10`,
        }}
      >
        <span className="text-[10px] uppercase tracking-widest text-muted">Level Up!</span>
        <span className="text-2xl font-bold" style={{ color: tier.color }}>
          Lv {level}
        </span>
        <span className="text-sm font-bold" style={{ color: tier.color }}>
          {rank.title}
        </span>
        <span className="mt-0.5 text-[9px] uppercase tracking-wider" style={{ color: tier.color, opacity: 0.7 }}>
          {tier.name}
        </span>
      </div>
    </div>
  );
});
