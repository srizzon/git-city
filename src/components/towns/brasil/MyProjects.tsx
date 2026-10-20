"use client";

import { useEffect, useState } from "react";
import { Plus, Trophy } from "lucide-react";
import type { Blocked, MyProject } from "@/lib/towns/brasil-projects-server";
import { opensText } from "@/lib/towns/brasil-projects";
import { statusOf } from "./ProjectSheet";
import { ProjectIcon, api } from "./projects-ui";

// On a building's card: the week's win it carries (anyone sees it), and on
// your own building your projects (status, rank this week, votes, visits),
// each opening its sheet, with Share a project when there's room.

export function ProjectWin({ win, onOpen }: { win: { week: string; name: string; slug: string }; onOpen: (slug: string) => void }) {
  return (
    <button type="button" onClick={() => onOpen(win.slug)} className="flex w-full items-center gap-2 border-2 border-lime/40 bg-lime/[0.06] px-2.5 py-1.5 text-left text-[9px] hover:border-lime">
      <Trophy size={12} className="shrink-0 text-lime" aria-hidden />
      <span className="text-lime">Project of the week</span>
      <span className="min-w-0 flex-1 truncate text-right normal-case text-cream">{win.name}</span>
    </button>
  );
}

export default function MyProjects({ slug, refreshKey, onOpen, onShare }: { slug: string; refreshKey: number; onOpen: (slug: string) => void; onShare: (blocked: Blocked | null) => void }) {
  const [rows, setRows] = useState<MyProject[] | null>(null);
  const [blocked, setBlocked] = useState<Blocked | null>(null);
  useEffect(() => {
    fetch(`${api(slug)}?view=mine`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { projects: MyProject[]; blocked: Blocked | null } | null) => {
        setRows(j?.projects ?? []);
        setBlocked(j?.blocked ?? null);
      })
      .catch(() => setRows([]));
  }, [slug, refreshKey]);
  if (!rows) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[9px] text-muted">Your projects</p>
      {rows.map((p) => {
        const st = statusOf(p.status);
        return (
          <button key={p.id} type="button" onClick={() => onOpen(p.slug)} className="flex items-center gap-2 border-2 border-border px-2 py-1.5 text-left hover:border-lime/60">
            <ProjectIcon project={p} size={20} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[9px] normal-case text-cream">{p.name}</span>
              <span className="block text-[8px] tabular-nums text-muted">
                <span className={st.tone}>{st.label}</span>
                {p.status === "live" && ` · ${p.rank ? `#${p.rank} this week · ` : ""}${p.votes} votes · ${p.visits} visits`}
              </span>
            </span>
          </button>
        );
      })}
      {blocked?.opens ? (
        <p className="text-[8px] text-muted">Next project from {opensText(blocked.opens)}</p>
      ) : (
        blocked?.code !== "live_limit" && (
          <button type="button" onClick={() => onShare(blocked)} className="btn-press flex min-h-8 items-center justify-center gap-1 border-2 border-border text-[9px] text-cream hover:border-lime/60">
            <Plus size={11} strokeWidth={3} aria-hidden /> Share a project
          </button>
        )
      )}
    </div>
  );
}
