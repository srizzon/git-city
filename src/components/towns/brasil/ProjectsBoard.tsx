"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronLeft, Plus } from "lucide-react";
import posthog from "posthog-js";
import { STATES } from "@/lib/towns/brasil-map";
import { CATEGORIES, categoryLabel, timeLeft, type AdCard, type ProjectCard } from "@/lib/towns/brasil-projects";
import type { ListTab, ProjectList } from "@/lib/towns/brasil-projects-server";
import { createBrowserSupabase } from "@/lib/supabase";
import { signInWithGitHub } from "@/lib/sign-in";
import { ProjectIcon, VoteButton, adHref, api } from "./projects-ui";

// The projects page: tabs for this week (ranked, the one that pays points),
// the newest, all time and the winners; a category and a state to narrow it;
// each row upvotes in place and opens the project on the map. The ad (or the
// offer for it) sits on top, like on the map's card.

const TABS: { id: ListTab; label: string }[] = [
  { id: "week", label: "This week" },
  { id: "new", label: "New" },
  { id: "all", label: "All time" },
  { id: "winners", label: "Winners" },
];

const chip = (on: boolean) => `btn-press shrink-0 border-2 px-2.5 py-1.5 text-[9px] ${on ? "border-lime bg-lime text-bg" : "border-border text-cream hover:border-lime/60"}`;

export default function ProjectsBoard({ slug, initial, ad, viewerLogin }: { slug: string; initial: ProjectList; ad: AdCard | null; viewerLogin: string | null }) {
  const [tab, setTab] = useState<ListTab>("week");
  const [category, setCategory] = useState<string | null>(null);
  const [uf, setUf] = useState<string | null>(null);
  const [list, setList] = useState<ProjectList>(initial);
  const [loading, setLoading] = useState(false);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    posthog.capture("projects_list_viewed", { tab, category, uf });
    if (tab === "week" && !category && !uf && list === initial) return;
    setLoading(true);
    const q = new URLSearchParams({ tab });
    if (category) q.set("category", category);
    if (uf) q.set("uf", uf);
    fetch(`${api(slug)}?${q}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((x: ProjectList | null) => x && setList(x))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, category, uf, slug]);

  const signIn = () => void signInWithGitHub(createBrowserSupabase(), `${window.location.origin}/auth/callback?next=${encodeURIComponent(`/town/${slug}/projects`)}`);
  const open = (p: ProjectCard) => `/town/${slug}?project=${p.slug}`;

  return (
    <main className="min-h-screen bg-bg font-pixel uppercase text-cream">
      <div className="mx-auto flex max-w-[860px] flex-col gap-5 px-4 py-5 sm:px-6 sm:py-8">
        <div className="flex items-center justify-between gap-3 text-[10px]">
          <Link href={`/town/${slug}`} className="flex items-center gap-1 text-muted hover:text-cream">
            <ChevronLeft size={14} aria-hidden /> Back to the map
          </Link>
          <span className="text-muted">{timeLeft(list.week, now)} this week</span>
        </div>

        <header className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-border pb-4">
          <div>
            <h1 className="text-2xl text-cream sm:text-4xl">Projects</h1>
            <p className="mt-1 text-[10px] text-muted">Built by the devs on the map · the week&apos;s top 3 win points</p>
          </div>
          <Link href={`/town/${slug}?share=1`} onClick={() => posthog.capture("project_submit_started", { from: "list" })} className="btn-press flex min-h-10 items-center gap-1.5 bg-lime px-4 text-[10px] text-bg">
            <Plus size={13} strokeWidth={3} aria-hidden /> Share yours
          </Link>
        </header>

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
          <Link href={`/town/${slug}?ad=1`} onClick={() => posthog.capture("ad_offer_clicked", { from: "list" })} className="flex items-center justify-between gap-3 border-2 border-dashed border-[#f0b429]/50 px-3 py-2.5 text-[10px] hover:border-[#f0b429]">
            <span className="flex items-center gap-3">
              <span className="w-6 text-center text-[8px] text-[#f0b429]">AD</span>
              <span className="text-cream">Advertise here</span>
              <span className="normal-case text-muted max-sm:hidden">#1 on the map for a week</span>
            </span>
            <span className="text-[#f0b429]">Get</span>
          </Link>
        )}

        <nav className="flex gap-1.5 overflow-x-auto" aria-label="Lists">
          {TABS.map((t) => (
            <button key={t.id} type="button" aria-pressed={tab === t.id} onClick={() => setTab(t.id)} className={chip(tab === t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
        {tab !== "winners" && (
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" aria-pressed={!category} onClick={() => setCategory(null)} className={chip(!category)}>
              All
            </button>
            {CATEGORIES.map((c) => (
              <button key={c.id} type="button" aria-pressed={category === c.id} onClick={() => setCategory(category === c.id ? null : c.id)} className={chip(category === c.id)}>
                {c.label}
              </button>
            ))}
            <select value={uf ?? ""} onChange={(e) => setUf(e.target.value || null)} aria-label="State" className="min-h-8 border-2 border-border bg-bg px-2 text-[9px] uppercase text-cream">
              <option value="">Every state</option>
              {STATES.map((s) => (
                <option key={s.uf} value={s.uf}>
                  {s.uf} · {s.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <ol className={`flex flex-col border-2 border-border transition-opacity ${loading ? "opacity-50" : ""}`}>
          {list.rows.map((p, i) => (
            <li key={`${p.id}:${p.week}`} className="flex items-center gap-3 border-t-2 border-border px-3 py-2.5 first:border-t-0">
              <span className="w-7 shrink-0 text-center text-[11px] tabular-nums text-muted">{list.tab === "winners" ? `#${p.rank}` : p.rank ? p.rank : list.tab === "new" ? "" : i + 1}</span>
              <a href={open(p)} className="flex min-w-0 flex-1 items-center gap-3 hover:text-lime">
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
              </a>
              {list.tab === "winners" ? (
                <span className="shrink-0 text-[10px] tabular-nums text-muted">{p.votes} votes</span>
              ) : (
                <VoteButton key={`${p.id}:${p.votes}:${p.voted}`} slug={slug} project={p} signedIn={!!viewerLogin} mine={viewerLogin?.toLowerCase() === p.maker.login.toLowerCase()} from={`list_${tab}`} onSignIn={signIn} />
              )}
            </li>
          ))}
          {list.rows.length === 0 && (
            <li className="px-4 py-8 text-center text-[11px] normal-case text-muted">
              {tab === "winners" ? "No week has closed yet. The first winner is crowned Sunday at 21h." : tab === "week" && !category && !uf ? "No projects this week yet. Be the first." : "Nothing here yet."}
            </li>
          )}
        </ol>
      </div>
    </main>
  );
}
