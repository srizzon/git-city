"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useLeaderboardAuth } from "./LeaderboardYouBadge";

const ACCENT = "#c8e64a";

interface UserPositionData {
  github_login: string;
  name: string | null;
  avatar_url: string | null;
  position: number;
  metricValue: string;
}

export default function LeaderboardUserPosition({
  tab,
  topLogins,
}: {
  tab: string;
  topLogins: string[];
}) {
  const authLogin = useLeaderboardAuth();
  const [data, setData] = useState<UserPositionData | null>(null);

  useEffect(() => {
    if (!authLogin) return;
    if (topLogins.includes(authLogin)) return;

    fetch(`/api/leaderboard-position?tab=${tab}&login=${authLogin}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.position && json.position > topLogins.length) {
          setData(json);
        }
      })
      .catch(() => {});
  }, [authLogin, tab, topLogins]);

  if (!data) return null;

  return (
    <>
      <div className="px-5 py-1 text-center text-[9px] text-dim">
        {"\u22EE"}
      </div>
      <Link
        href={`/dev/${data.github_login}`}
        className="flex items-center gap-4 border-t border-border/50 px-5 py-3.5 hover:bg-bg-card"
        style={{ backgroundColor: "rgba(200, 230, 74, 0.08)" }}
      >
        <span className="w-10 text-center text-sm font-bold" style={{ color: ACCENT }}>
          {data.position}
        </span>
        <div className="flex flex-1 items-center gap-3 overflow-hidden">
          {data.avatar_url && (
            <Image
              src={data.avatar_url}
              alt={data.github_login}
              width={36}
              height={36}
              className="border-2 border-border"
              style={{ imageRendering: "pixelated" }}
            />
          )}
          <div className="overflow-hidden">
            <p className="truncate text-sm text-cream">
              {data.name ?? data.github_login}
              <span className="ml-2 text-[10px]" style={{ color: ACCENT }}>YOU</span>
            </p>
          </div>
        </div>
        <span className="w-28 text-right text-sm" style={{ color: ACCENT }}>
          {data.metricValue}
        </span>
      </Link>
    </>
  );
}
