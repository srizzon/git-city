"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Plus } from "lucide-react";
import posthog from "posthog-js";
import Panel from "@/components/league/hud/Panel";
import { PixelSelect, type PixelOption } from "@/components/ui/PixelSelect";
import { STATES } from "@/lib/towns/brasil-map";
import { CATEGORIES, categoryLabel, timeLeft, type AdCard, type ProjectCard } from "@/lib/towns/brasil-projects";
import type { ListTab, ProjectList } from "@/lib/towns/brasil-projects-server";
import { Board, useWide } from "./BrasilPanels";
import { ProjectIcon, VoteButton, adHref, api } from "./projects-ui";

// Every project, as a big board over the map (the whole screen on a phone):
// tabs for this week (ranked, the one that pays points), the newest, all time
// and the winners; a category and a state to narrow it; each row upvotes in
// place and opens the project's sheet. The ad (or the offer for it) sits on
// top, like on the map's card. The map keeps the tab and filters (view), so
// the board comes back as it was after a project's sheet closes.

const TABS: { id: ListTab; label: string }[] = [
  { id: "week", label: "This week" },
  { id: "new", label: "New" },
  { id: "all", label: "All time" },
  { id: "winners", label: "Winners" },
];

const TAB_OPTIONS: PixelOption[] = TABS.map((t) => ({ value: t.id, label: t.label }));
const CATEGORY_OPTIONS: PixelOption[] = [{ value: "", label: "Any type" }, ...CATEGORIES.map((c) => ({ value: c.id, label: c.label }))];
const STATE_OPTIONS: PixelOption[] = [{ value: "", label: "Every state" }, ...STATES.map((s) => ({ value: s.uf, label: `${s.uf} · ${s.name}` }))];

const PHONE_STATE_OPTIONS: PixelOption[] = [{ value: "", label: "Any state" }, ...STATE_OPTIONS.slice(1)];

export interface ProjectsView {
  tab: ListTab;
  category: string | null;
  uf: string | null;
}

export const ALL_PROJECTS: ProjectsView = { tab: "week", category: null, uf: null };

const chip = (on: boolean) => `btn-press flex h-[34px] shrink-0 items-center border-2 px-2.5 text-[9px] ${on ? "border-lime bg-lime text-bg" : "border-border text-cream hover:border-lime/60"}`;

export default function ProjectsBoard({
  slug,
  ad,
  viewerLogin,
  view,
  onView,
  onOpen,
  onShare,
  onOffer,
  onSignIn,
  onClose,
}: {
  slug: string;
  ad: AdCard | null;
  viewerLogin: string | null;
  view: ProjectsView;
  onView: (v: ProjectsView) => void;
  onOpen: (p: ProjectCard) => void;
  onShare: () => void;
  onOffer: () => void;
  onSignIn: () => void;
  onClose: () => void;
}) {
  const { tab, category, uf } = view;
  const wide = useWide();
  const key = `${tab}:${category ?? ""}:${uf ?? ""}`;
  // The list and the filters it was read for: dimmed while it's another's.
  const [read, setRead] = useState<{ key: string; list: ProjectList } | null>(null);
  const list = read?.list ?? null;
  const loading = read?.key !== key;
  const [now] = useState(() => Date.now());

  useEffect(() => {
    posthog.capture("projects_list_viewed", { tab, category, uf });
    let live = true;
    const q = new URLSearchParams({ tab });
    if (category) q.set("category", category);
    if (uf) q.set("uf", uf);
    fetch(`${api(slug)}?${q}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((x: ProjectList | null) => live && x && setRead({ key: `${tab}:${category ?? ""}:${uf ?? ""}`, list: x }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [tab, category, uf, slug]);

  const content = (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[9px] text-muted">
          The week&apos;s top 3 win points{list ? ` · ${timeLeft(list.week, now)}` : ""}
        </p>
        <button
          type="button"
          onClick={() => {
            posthog.capture("project_submit_started", { from: "list" });
            onShare();
          }}
          className="btn-press flex min-h-9 items-center gap-1.5 bg-lime px-3 text-[10px] text-bg"
        >
          <Plus size={13} strokeWidth={3} aria-hidden /> Share yours
        </button>
      </div>

      {ad ? (
        <a href={adHref(slug, ad.id)} target="_blank" rel="noopener sponsored" onClick={() => posthog.capture("sponsor_clicked", { slot_id: ad.id, from: "list" })} className="flex items-center gap-3 border-2 border-[#f0b429]/50 bg-[#f0b429]/[0.06] px-3 py-2.5 hover:border-[#f0b429]">
          <span className="w-6 text-center text-[8px] text-[#f0b429]">AD</span>
          <ProjectIcon project={{ icon: ad.icon, maker: { login: "", avatar: null } }} size={32} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[11px] text-cream">{ad.name}</span>
            <span className="block truncate text-[11px] normal-case text-muted">{ad.tagline}</span>
          </span>
          <ArrowUpRight size={16} className="text-[#f0b429]" aria-hidden />
        </a>
      ) : (
        <button
          type="button"
          onClick={() => {
            posthog.capture("ad_offer_clicked", { from: "list" });
            onOffer();
          }}
          className="flex items-center justify-between gap-3 border-2 border-dashed border-[#f0b429]/50 px-3 py-2.5 text-left text-[10px] hover:border-[#f0b429]"
        >
          <span className="flex items-center gap-3">
            <span className="w-6 text-center text-[8px] text-[#f0b429]">AD</span>
            <span className="text-cream">Advertise here</span>
            <span className="normal-case text-muted max-sm:hidden">#1 on the map for a week</span>
          </span>
          <span className="text-[#f0b429]">Get</span>
        </button>
      )}

      {wide ? (
        <>
          <nav className="flex gap-1.5 overflow-x-auto" aria-label="Lists">
            {TABS.map((t) => (
              <button key={t.id} type="button" aria-pressed={tab === t.id} onClick={() => onView({ ...view, tab: t.id })} className={chip(tab === t.id)}>
                {t.label}
              </button>
            ))}
          </nav>
          {tab !== "winners" && (
            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" aria-pressed={!category} onClick={() => onView({ ...view, category: null })} className={chip(!category)}>
                All
              </button>
              {CATEGORIES.map((c) => (
                <button key={c.id} type="button" aria-pressed={category === c.id} onClick={() => onView({ ...view, category: category === c.id ? null : c.id })} className={chip(category === c.id)}>
                  {c.label}
                </button>
              ))}
              <PixelSelect value={uf ?? ""} onChange={(v) => onView({ ...view, uf: v || null })} options={STATE_OPTIONS} ariaLabel="State" searchable searchPlaceholder="State…" className="w-44" />
            </div>
          )}
        </>
      ) : (
        // A phone: the list, the category and the state side by side, so the projects start higher.
        <div className="grid grid-cols-3 gap-1.5">
          <PixelSelect value={tab} onChange={(v) => onView({ ...view, tab: v as ListTab })} options={TAB_OPTIONS} ariaLabel="List" />
          {tab !== "winners" && (
            <>
              <PixelSelect value={category ?? ""} onChange={(v) => onView({ ...view, category: v || null })} options={CATEGORY_OPTIONS} ariaLabel="Category" />
              <PixelSelect value={uf ?? ""} onChange={(v) => onView({ ...view, uf: v || null })} options={PHONE_STATE_OPTIONS} ariaLabel="State" searchable searchPlaceholder="State…" />
            </>
          )}
        </div>
      )}

      <ol className={`flex flex-col border-2 border-border transition-opacity ${loading ? "opacity-50" : ""}`}>
        {list?.rows.map((p, i) => (
          <li key={`${p.id}:${p.week}`} className="flex items-center gap-3 border-t-2 border-border px-3 py-2.5 first:border-t-0">
            <span className="w-6 shrink-0 text-center text-[11px] tabular-nums text-muted">{list.tab === "winners" ? `#${p.rank}` : p.rank ? p.rank : list.tab === "new" ? "" : i + 1}</span>
            <button type="button" onClick={() => onOpen(p)} className="flex min-w-0 flex-1 items-center gap-3 text-left hover:text-lime">
              <ProjectIcon project={p} size={36} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px] normal-case text-cream">{p.name}</span>
                <span className="block truncate text-[11px] normal-case text-warm">{p.tagline}</span>
                <span className="block truncate text-[9px] text-muted">
                  <span className="normal-case">@{p.maker.login}</span>
                  {p.uf ? ` · ${p.uf}` : ""} · {categoryLabel(p.category)}
                  {list.tab === "winners" && p.week ? ` · week of ${p.week}` : ""}
                </span>
              </span>
            </button>
            {list.tab === "winners" ? (
              <span className="shrink-0 text-[10px] tabular-nums text-muted">{p.votes} votes</span>
            ) : (
              <VoteButton key={`${p.id}:${p.votes}:${p.voted}`} slug={slug} project={p} signedIn={!!viewerLogin} mine={viewerLogin?.toLowerCase() === p.maker.login.toLowerCase()} from={`list_${tab}`} onSignIn={onSignIn} />
            )}
          </li>
        ))}
        {list && list.rows.length === 0 && (
          <li className="px-4 py-8 text-center text-[11px] normal-case text-muted">
            {tab === "winners" ? "No week has closed yet. The first winner is crowned Sunday at 21h." : tab === "week" && !category && !uf ? "No projects this week yet. Be the first." : "Nothing here yet."}
          </li>
        )}
        {!list && <li className="px-4 py-8 text-center text-[11px] normal-case text-muted">Loading…</li>}
      </ol>
    </div>
  );

  return wide ? (
    <Board title="Projects" onClose={onClose} width={860}>
      {content}
    </Board>
  ) : (
    <Panel title="Projects" onClose={onClose} full>
      {content}
    </Panel>
  );
}
