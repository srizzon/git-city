"use client";

import { memo, useMemo } from "react";
import { tierFromLevel, levelProgress } from "@/lib/xp";

interface XpBarProps {
  xpTotal: number;
  xpLevel: number;
  accent: string;
}

const TIER_BADGES: Record<string, string> = {
  localhost: "",
  staging: "STG",
  production: "PROD",
  open_source: "OS",
  unicorn: "UNI",
  founder: "FDR",
};

export default memo(function XpBar({ xpTotal, xpLevel }: XpBarProps) {
  const tier = useMemo(() => tierFromLevel(xpLevel), [xpLevel]);
  const progress = useMemo(() => levelProgress(xpTotal), [xpTotal]);
  const badge = TIER_BADGES[tier.id];

  return (
    <div className="flex items-center gap-1.5 border-2 border-border bg-bg/80 px-2 py-1 backdrop-blur-sm">
      {/* Level number */}
      <span
        className="text-sm font-bold leading-none"
        style={{ color: tier.color }}
      >
        {xpLevel}
      </span>

      {/* Progress bar */}
      <div className="flex flex-col gap-0.5">
        {badge && (
          <span
            className="text-[7px] font-bold leading-none"
            style={{ color: tier.color }}
          >
            {badge}
          </span>
        )}
        <div className="h-2 w-16 bg-border">
          <div
            className="h-full transition-all duration-700 ease-out"
            style={{
              width: `${Math.max(2, Math.round(progress * 100))}%`,
              backgroundColor: tier.color,
            }}
          />
        </div>
      </div>
    </div>
  );
});
