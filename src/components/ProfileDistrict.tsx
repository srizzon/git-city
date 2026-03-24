"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DISTRICT_NAMES, DISTRICT_COLORS } from "@/lib/github";
import DistrictChooser from "./DistrictChooser";

interface ProfileDistrictProps {
  district: string;
  districtRank: number | null;
  inferredDistrict: string | null;
  isOwner: boolean;
  districtChosen: boolean;
  districtChangesCount: number;
  districtChangedAt: string | null;
}

const COOLDOWN_DAYS = 90;
const MAX_FREE_CHANGES = 2;

function getCooldownDaysLeft(changedAt: string | null): number {
  if (!changedAt) return 0;
  const last = new Date(changedAt).getTime();
  const remaining = last + COOLDOWN_DAYS * 24 * 60 * 60 * 1000 - Date.now();
  return remaining > 0 ? Math.ceil(remaining / (24 * 60 * 60 * 1000)) : 0;
}

export default function ProfileDistrict({
  district,
  districtRank,
  inferredDistrict,
  isOwner,
  districtChosen,
  districtChangesCount,
  districtChangedAt,
}: ProfileDistrictProps) {
  const [showChooser, setShowChooser] = useState(false);
  const [currentDistrict, setCurrentDistrict] = useState(district);
  const router = useRouter();

  const color = DISTRICT_COLORS[currentDistrict] ?? "#888";
  const name = DISTRICT_NAMES[currentDistrict] ?? currentDistrict;

  // Determine if user can change
  const cooldownDays = getCooldownDaysLeft(districtChangedAt);
  const maxedOut = districtChosen && districtChangesCount >= MAX_FREE_CHANGES;
  const onCooldown = districtChosen && cooldownDays > 0;
  const canChange = isOwner && !maxedOut && !onCooldown;

  return (
    <>
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        {canChange ? (
          <button
            onClick={() => setShowChooser(true)}
            className="btn-press group flex cursor-pointer items-center gap-1.5 border-2 px-2.5 py-1 transition-colors hover:border-border-light"
            style={{ borderColor: color }}
          >
            <span
              className="h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: color }}
            />
            <span className="text-[10px] text-cream">{name}</span>
            <span className="text-[10px] text-muted transition-colors group-hover:text-cream">
              &#9998;
            </span>
          </button>
        ) : (
          <span
            className="px-2 py-0.5 text-[10px] text-bg"
            style={{ backgroundColor: color }}
          >
            {name}
          </span>
        )}
        {districtRank && (
          <span className="text-[10px] text-muted">
            {districtRank === 1 ? "Mayor" : `#${districtRank}`} in {name}
          </span>
        )}
        {isOwner && onCooldown && (
          <span className="text-[9px] text-muted">
            change in {cooldownDays}d
          </span>
        )}
        {isOwner && maxedOut && (
          <span className="text-[9px] text-muted">
            paid changes soon
          </span>
        )}
      </div>

      {showChooser && (
        <DistrictChooser
          currentDistrict={currentDistrict}
          inferredDistrict={inferredDistrict}
          onClose={() => setShowChooser(false)}
          onChosen={(newDistrict) => {
            setCurrentDistrict(newDistrict);
            setShowChooser(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
