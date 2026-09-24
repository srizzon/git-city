"use client";

import Link from "next/link";
import type { LeaguePageData } from "@/lib/leagues/queries";
import Panel from "./Panel";
import { Avatar, fmt, useCountdown } from "./shared";

export default function StandingsPanel({ data, onClose }: { data: LeaguePageData; onClose: () => void }) {
  const { week, viewer, members } = data;
  const countdown = useCountdown();
  const invited = members.filter((m) => m.status === "invited");
  return (
    <Panel title="This week" onClose={onClose}>
      <div className="flex items-baseline justify-between text-[10px] text-muted">
        <span>{week.mode === "xp" ? "Code + game XP" : "Code only"}</span>
        <span>Closes in {countdown || "…"}</span>
      </div>
      <ol className="mt-3 space-y-1.5">
        {week.standings.map((s) => {
          const me = viewer?.login === s.login;
          return (
            <li
              key={s.developer_id}
              className={`flex items-center gap-3 border-[3px] bg-bg-card px-3 py-2 ${me ? "border-lime" : "border-border"}`}
            >
              <span className={`w-6 text-right text-xs ${s.rank === 1 ? "text-lime" : "text-muted"}`}>{s.rank}</span>
              <Avatar src={s.avatar_url} />
              <Link href={`/dev/${s.login}`} className="min-w-0 flex-1 truncate text-xs text-cream normal-case hover:text-lime">
                @{s.login}
              </Link>
              <span className="w-14 text-right text-xs text-cream tabular-nums">{fmt(s.total)}</span>
            </li>
          );
        })}
        {week.standings.length === 0 && <li className="text-[11px] text-muted normal-case">Nobody has joined yet.</li>}
      </ol>
      {invited.length > 0 && (
        <div className="mt-6">
          <h3 className="text-[10px] text-muted">Invited · not joined yet</h3>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {invited.map((m) => (
              <li key={m.developer_id} className="flex items-center gap-1.5 border-2 border-border px-2 py-1">
                <Avatar src={m.avatar_url} size={16} faded />
                <span className="text-[10px] text-dim normal-case">@{m.login}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}
