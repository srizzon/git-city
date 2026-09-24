"use client";

import type { LeaguePageData } from "@/lib/leagues/queries";
import Panel from "./Panel";
import { Avatar, fmt } from "./shared";

export default function HallOfFamePanel({ data, onClose }: { data: LeaguePageData; onClose: () => void }) {
  const { members, hall_of_fame: hall } = data;
  const bySize = [...members].sort((a, b) => b.contributions - a.contributions).slice(0, 20);
  return (
    <Panel title="Hall of fame" onClose={onClose}>
      <h3 className="text-[10px] text-muted">Weekly winners</h3>
      <ul className="mt-2 space-y-1.5">
        {hall.map((w) => (
          <li key={w.week_start} className="flex items-center gap-2 border-[3px] border-border bg-bg-card px-3 py-2">
            <span className="w-12 shrink-0 text-[9px] text-muted">{w.week_start.slice(5)}</span>
            {w.winner ? (
              <>
                <Avatar src={w.winner.avatar_url} size={20} />
                <span className="min-w-0 flex-1 truncate text-[11px] text-cream normal-case">@{w.winner.login}</span>
                {w.winner.ex_member && <span className="text-[8px] text-dim">ex-member</span>}
                <span className="text-[10px] text-cream tabular-nums">{fmt(w.winner.score)}</span>
              </>
            ) : (
              <span className="flex-1 text-[10px] text-dim">No winner</span>
            )}
          </li>
        ))}
        {hall.length === 0 && <li className="text-[11px] text-muted normal-case">The first week hasn&apos;t closed yet.</li>}
      </ul>

      <h3 className="mt-6 text-[10px] text-muted">Biggest buildings, all time</h3>
      <ol className="mt-2 space-y-1.5">
        {bySize.map((m, i) => (
          <li key={m.developer_id} className="flex items-center gap-2 border-[3px] border-border bg-bg-card px-3 py-2">
            <span className="w-5 text-right text-[10px] text-muted">{i + 1}</span>
            <Avatar src={m.avatar_url} size={20} faded={m.status === "invited"} />
            <span className="min-w-0 flex-1 truncate text-[11px] text-cream normal-case">@{m.login}</span>
            {m.status === "former" && <span className="text-[8px] text-dim">ex-member</span>}
            <span className="text-[10px] text-cream tabular-nums">{fmt(m.contributions)}</span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
