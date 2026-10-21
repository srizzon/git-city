"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, ChevronDown, ChevronUp, Plus } from "lucide-react";
import posthog from "posthog-js";
import Panel from "@/components/league/hud/Panel";
import { timeLeft, type AdCard, type ProjectCard } from "@/lib/towns/brasil-projects";
import type { Blocked, CardData } from "@/lib/towns/brasil-projects-server";
import { ProjectIcon, VoteButton, adHref, api } from "./projects-ui";

// The map's top-right corner: this week's projects. On a wide screen a card,
// the mirror of the apuração card on the left (same border, rows, fold): the
// ad slot, the top 3 with their upvotes, See all and Share yours. On a phone
// a pill under the search on the right, opening the same list as a sheet.
// The ad slot, while nobody booked it, is the offer ("Your project here"),
// which opens the request form. Read again every minute.

const POLL_MS = 60_000;

/** Room for the card beside the centered search bar (the apuração card takes the left). */
function useWide(): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1100px)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}

function AdRow({ slug, ad, onOffer }: { slug: string; ad: AdCard | null; onOffer: () => void }) {
  const seen = useRef(false);
  useEffect(() => {
    if (seen.current) return;
    seen.current = true;
    if (ad) posthog.capture("sponsor_viewed", { slot_id: ad.id });
    else posthog.capture("ad_offer_viewed");
  }, [ad]);
  const inner = (
    <>
      <span className="w-4 shrink-0 text-center text-[7px] text-[#f0b429]">AD</span>
      {ad ? <ProjectIcon project={{ icon: ad.icon, maker: { login: "", avatar: null } }} size={22} /> : <span className="h-[22px] w-[22px] shrink-0 border border-dashed border-[#f0b429]/60" aria-hidden />}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[9px] text-cream">{ad ? ad.name : "Your project here"}</span>
        <span className="block truncate text-[10px] normal-case text-muted">{ad ? ad.tagline : "#1 here for a week"}</span>
      </span>
      <span className="flex min-h-7 min-w-[46px] shrink-0 items-center justify-center border-2 border-[#f0b429]/70 text-[9px] text-[#f0b429]">{ad ? <ArrowUpRight size={12} aria-label="Visit" /> : "Get"}</span>
    </>
  );
  const cls = "flex w-full items-center gap-2 bg-[#f0b429]/[0.06] px-3 py-1.5 text-left hover:bg-[#f0b429]/[0.12]";
  return ad ? (
    <a href={adHref(slug, ad.id)} target="_blank" rel="noopener sponsored" onClick={() => posthog.capture("sponsor_clicked", { slot_id: ad.id })} className={cls}>
      {inner}
    </a>
  ) : (
    <button
      type="button"
      onClick={() => {
        posthog.capture("ad_offer_clicked", { from: "card" });
        onOffer();
      }}
      className={cls}
    >
      {inner}
    </button>
  );
}

function Row({ slug, p, place, signedIn, viewerLogin, onOpen, onSignIn }: { slug: string; p: ProjectCard; place: number | null; signedIn: boolean; viewerLogin: string | null; onOpen: (p: ProjectCard) => void; onSignIn: () => void }) {
  return (
    <li className="flex items-center gap-2 px-3 py-1.5">
      <button type="button" onClick={() => onOpen(p)} className="flex min-w-0 flex-1 items-center gap-2 text-left hover:text-lime" aria-label={`Open ${p.name}`}>
        <span className="w-4 shrink-0 text-center text-[9px] tabular-nums text-muted">{place ?? "·"}</span>
        <ProjectIcon project={p} size={22} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[9px] normal-case text-cream">{p.name}</span>
          <span className="block truncate text-[10px] normal-case text-muted">
            {p.tagline}
            {p.uf ? ` · ${p.uf}` : ""}
          </span>
        </span>
      </button>
      <VoteButton key={`${p.id}:${p.votes}:${p.voted}`} slug={slug} project={p} signedIn={signedIn} mine={viewerLogin?.toLowerCase() === p.maker.login.toLowerCase()} from="card" onSignIn={onSignIn} />
    </li>
  );
}

export default function ProjectsCard({
  slug,
  initial,
  signedIn,
  viewerLogin,
  refreshKey = 0,
  onOpen,
  onShare,
  onOpenSlug,
  onOffer,
  onSeeAll,
  onSignIn,
}: {
  slug: string;
  initial: CardData | null;
  signedIn: boolean;
  viewerLogin: string | null;
  /** Bumped after something changed the card (a post, a vote in the sheet): read it again. */
  refreshKey?: number;
  onOpen: (p: ProjectCard) => void;
  /** Share yours, with whether they can post (null), why not, or undefined when the card doesn't know. */
  onShare: (blocked: Blocked | null | undefined) => void;
  /** Open a project by its slug (their own, from Your project). */
  onOpenSlug: (slug: string) => void;
  onOffer: () => void;
  /** Every project: the board over the map. */
  onSeeAll: () => void;
  onSignIn: () => void;
}) {
  const wide = useWide();
  const [c, setC] = useState(initial);
  const [open, setOpen] = useState(true);
  const [sheet, setSheet] = useState(false);

  useEffect(() => {
    const read = () =>
      fetch(`${api(slug)}?view=card`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((x: CardData | null) => x && setC(x))
        .catch(() => {});
    if (refreshKey) read();
    const id = setInterval(read, POLL_MS);
    return () => clearInterval(id);
  }, [slug, refreshKey]);

  useEffect(() => {
    posthog.capture("projects_card_viewed", { signed_in: signedIn, wide, projects: c?.count ?? 0 });
    // Once per mount: the card is the session's view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!c) return null;
  const left = timeLeft(c.week);
  const mine = c.me?.blocked?.code === "week_limit" ? c.me.blocked.project : null;
  const list = (
    <>
      <AdRow slug={slug} ad={c.ad} onOffer={onOffer} />
      <ol className="flex flex-col py-1">
        {c.top.map((p, i) => (
          <Row key={p.id} slug={slug} p={p} place={c.mode === "ranked" && p.votes > 0 ? i + 1 : null} signedIn={signedIn} viewerLogin={viewerLogin} onOpen={onOpen} onSignIn={onSignIn} />
        ))}
        {c.top.length === 0 && <li className="px-3 py-2 text-[10px] normal-case text-muted">No projects this week yet. Be the first.</li>}
      </ol>
      {c.mode === "new" && c.top.length > 0 && <p className="px-3 pb-1 text-[8px] text-muted">New this week · upvote to rank them</p>}
      <div className="grid grid-cols-2 gap-1.5 px-3 pb-3 pt-1">
        <button
          type="button"
          onClick={() => {
            posthog.capture("projects_list_opened", { from: "card" });
            setSheet(false);
            onSeeAll();
          }}
          className="btn-press flex min-h-9 items-center justify-center border-2 border-border text-[10px] text-cream hover:border-lime/60"
        >
          See all{c.count > 3 ? ` · ${c.count}` : ""}
        </button>
        {mine && mine.status !== "removed" ? (
          // This week's slot is used: the button is their project.
          <button
            type="button"
            onClick={() => {
              setSheet(false);
              onOpenSlug(mine.slug);
            }}
            className="btn-press flex min-h-9 items-center justify-center gap-1 border-2 border-lime text-[10px] text-lime hover:bg-lime hover:text-bg"
          >
            Your project
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              posthog.capture("project_submit_started", { from: "card", blocked: c.me?.blocked?.code ?? null });
              setSheet(false);
              onShare(c.me ? c.me.blocked : undefined);
            }}
            className="btn-press flex min-h-9 items-center justify-center gap-1 bg-lime text-[10px] text-bg"
          >
            <Plus size={12} strokeWidth={3} aria-hidden /> Share yours
          </button>
        )}
      </div>
    </>
  );

  if (!wide) {
    const lead = c.top[0];
    return (
      <>
        <button
          type="button"
          onClick={() => setSheet(true)}
          aria-label="Projects this week"
          className="pointer-events-auto absolute right-3 top-[104px] z-20 flex h-12 w-[calc(50%-16px)] flex-col justify-center gap-1.5 border-[3px] border-border bg-bg/90 px-2.5 text-left font-pixel text-[9px] uppercase backdrop-blur-sm"
        >
          <span className="flex items-center gap-1.5">
            <span className="text-lime">Projects</span>
            <span className="text-[8px] text-muted">This week</span>
          </span>
          {lead ? (
            <span className="flex items-center gap-1.5">
              {c.mode === "ranked" && lead.votes > 0 && <span className="shrink-0 tabular-nums text-muted">#1</span>}
              <span className="min-w-0 truncate normal-case text-cream">{lead.name}</span>
            </span>
          ) : (
            <span className="text-muted">Share yours</span>
          )}
        </button>
        {sheet && (
          <Panel title="Projects this week" onClose={() => setSheet(false)}>
            <p className="-mt-1 mb-2 text-[9px] text-muted">{left}</p>
            <div className="-mx-4">{list}</div>
          </Panel>
        )}
      </>
    );
  }

  return (
    <section aria-label="Projects this week" className="pointer-events-auto absolute right-4 top-4 z-20 w-[272px] border-[3px] border-border bg-bg/90 font-pixel uppercase backdrop-blur-sm">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between gap-2 border-b-2 border-border px-3 py-2 text-[10px]">
        <span className="text-cream">Projects · this week</span>
        <span className="flex items-center gap-1.5 text-muted">
          {left}
          {open ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
        </span>
      </button>
      {open && list}
    </section>
  );
}
