"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Building2, Check, Copy, Flag, Github, Pencil, Trash2 } from "lucide-react";
import posthog from "posthog-js";
import Panel from "@/components/league/hud/Panel";
import { categoryLabel, timeLeft, weekClosesAt, type ProjectCard, type ProjectStatus } from "@/lib/towns/brasil-projects";
import { ProjectIcon, VoteButton, api, postJson, shareUrl, visitHref } from "./projects-ui";

// A project, opened from the card, the list or a shared link: what it is, a
// Visit through the click-through, its repo, the upvote and its place in the
// week, who made it (and a way to their building on the map), share and
// report. Its maker also sees its status and can edit or take it down.

export type ProjectView = ProjectCard & { status: ProjectStatus; reason: string | null; mine: boolean };

const STATUS: Record<ProjectStatus, { label: string; tone: string }> = {
  checking: { label: "Checking", tone: "text-muted" },
  live: { label: "Live", tone: "text-lime" },
  review: { label: "In review", tone: "text-[#f0b429]" },
  rejected: { label: "Rejected", tone: "text-red-400" },
  hidden: { label: "Hidden", tone: "text-red-400" },
  removed: { label: "Removed", tone: "text-muted" },
};

export const statusOf = (s: ProjectStatus) => STATUS[s];

export function Share({ slug, p }: { slug: string; p: ProjectCard }) {
  const [copied, setCopied] = useState(false);
  const url = shareUrl(slug, p.slug);
  const text = `Vota no ${p.name} no mapa dos devs do Brasil`;
  const go = (channel: string) => posthog.capture("project_shared", { project_id: p.id, channel });
  const links = [
    { id: "x", label: "X", href: `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}` },
    { id: "linkedin", label: "LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}` },
    { id: "whatsapp", label: "WhatsApp", href: `https://wa.me/?text=${encodeURIComponent(`${text}: ${url}`)}` },
  ];
  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(url).then(() => setCopied(true), () => {});
          go("copy");
        }}
        className="btn-press flex min-h-9 items-center justify-between gap-2 border-2 border-border px-3 text-left text-[9px] normal-case text-cream hover:border-lime/60"
      >
        <span className="truncate text-muted">{url.replace(/^https?:\/\//, "")}</span>
        <span className="flex shrink-0 items-center gap-1 uppercase text-lime">{copied ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />} {copied ? "Copied" : "Copy"}</span>
      </button>
      <div className="grid grid-cols-3 gap-1.5">
        {links.map((l) => (
          <a key={l.id} href={l.href} target="_blank" rel="noopener noreferrer" onClick={() => go(l.id)} className="btn-press flex min-h-9 items-center justify-center border-2 border-border text-[9px] text-cream hover:border-lime/60">
            {l.label}
          </a>
        ))}
      </div>
    </div>
  );
}

const REASONS = [
  { id: "scam", label: "Scam" },
  { id: "gambling", label: "Gambling" },
  { id: "broken", label: "Broken" },
  { id: "not_theirs", label: "Not theirs" },
  { id: "other", label: "Other" },
];

function Report({ slug, id, signedIn, onSignIn }: { slug: string; id: number; signedIn: boolean; onSignIn: () => void }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  if (done) return <p className="text-[9px] normal-case text-muted">{done}</p>;
  if (!open)
    return (
      <button type="button" onClick={() => (signedIn ? setOpen(true) : onSignIn())} className="flex items-center gap-1.5 self-start text-[9px] text-muted hover:text-cream">
        <Flag size={11} aria-hidden /> Report
      </button>
    );
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[9px] text-muted">What&apos;s wrong with it?</p>
      <div className="flex flex-wrap gap-1.5">
        {REASONS.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={async () => {
              const res = await postJson(`${api(slug)}/${id}`, { action: "report", reason: r.id, note: "" });
              posthog.capture("project_reported", { project_id: id, reason: r.id, ok: res.ok });
              setDone(res.ok ? "Thanks. We'll take a look." : res.error);
            }}
            className="btn-press border-2 border-border px-2 py-1 text-[9px] text-cream hover:border-red-400/70"
          >
            {r.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ProjectSheet({
  slug,
  projectSlug,
  initial,
  signedIn,
  onSignIn,
  onClose,
  onVisitBuilding,
  onEdit,
  onChanged,
  from,
}: {
  slug: string;
  projectSlug: string;
  initial?: ProjectCard | null;
  signedIn: boolean;
  onSignIn: () => void;
  onClose: () => void;
  /** The maker's building on the map; undefined when they're not on it. */
  onVisitBuilding?: (login: string) => void;
  onEdit: (p: ProjectView) => void;
  onChanged: () => void;
  from: string;
}) {
  const [p, setP] = useState<ProjectView | null>(initial ? { ...initial, status: "live", reason: null, mine: false } : null);
  const [missing, setMissing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [appeal, setAppeal] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let live = true;
    fetch(`${api(slug)}/${encodeURIComponent(projectSlug)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((x: ProjectView | null) => {
        if (!live) return;
        if (x) setP(x);
        else setMissing(true);
      })
      .catch(() => live && setMissing(true));
    return () => {
      live = false;
    };
  }, [slug, projectSlug]);

  useEffect(() => {
    posthog.capture("project_viewed", { project_slug: projectSlug, from });
  }, [projectSlug, from]);

  if (missing && !p)
    return (
      <Panel title="Project" onClose={onClose}>
        <p className="text-[10px] normal-case text-muted">This project isn&apos;t up anymore.</p>
      </Panel>
    );
  if (!p)
    return (
      <Panel title="Project" onClose={onClose}>
        <p className="text-[10px] text-muted">Loading</p>
      </Panel>
    );

  const st = statusOf(p.status);
  const live = p.status === "live";
  return (
    <Panel title="Project" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {p.mine && !live && (
          <div className="border-2 border-border bg-bg-raised px-3 py-2 text-[9px]">
            <span className={st.tone}>{st.label}</span>
            {p.reason && <p className="mt-1 text-[10px] normal-case text-muted">{p.reason}</p>}
            {p.status === "review" && <p className="mt-1 text-[10px] normal-case text-muted">A person looks at it soon. You get an email either way.</p>}
          </div>
        )}
        {p.cover && (
          // eslint-disable-next-line @next/next/no-img-element -- the project's own og:image
          <img src={p.cover} alt="" referrerPolicy="no-referrer" className="aspect-[1.91/1] w-full border-2 border-border bg-bg-raised object-cover" onError={(e) => (e.currentTarget.style.display = "none")} />
        )}
        <div className="flex items-start gap-3">
          <ProjectIcon project={p} size={40} />
          <div className="min-w-0 flex-1">
            <h3 className="break-words text-[13px] normal-case leading-tight text-cream">{p.name}</h3>
            <p className="mt-1 font-sans text-[13px] normal-case leading-snug text-warm">{p.tagline}</p>
            <p className="mt-1.5 text-[9px] text-muted">
              {categoryLabel(p.category)} · <span className="normal-case">{p.host}</span>
            </p>
          </div>
        </div>

        {live && (
          <div className="flex items-center justify-between gap-3 border-y-2 border-border py-2.5">
            <div className="text-[9px] text-muted">
              {p.rank ? (
                <span>
                  <span className="text-[13px] tabular-nums text-cream">#{p.rank}</span> {p.week && weekClosesAt(p.week) > now ? `this week · ${timeLeft(p.week, now)}` : "of its week"}
                </span>
              ) : (
                <span>Upvote to push it up</span>
              )}
            </div>
            <VoteButton key={`${p.id}:${p.votes}:${p.voted}`} slug={slug} project={p} signedIn={signedIn} mine={p.mine} size="lg" from={`sheet_${from}`} onSignIn={onSignIn} onChange={onChanged} />
          </div>
        )}

        <div className="grid grid-cols-2 gap-1.5">
          <a
            href={live ? visitHref(slug, p.id) : p.url}
            target="_blank"
            rel="noopener noreferrer nofollow ugc"
            onClick={() => posthog.capture("project_visit_clicked", { project_id: p.id, from })}
            className={`btn-press flex min-h-10 items-center justify-center gap-1.5 bg-lime text-[10px] text-bg ${p.repo ? "" : "col-span-2"}`}
          >
            Visit <ArrowUpRight size={13} aria-hidden />
          </a>
          {p.repo && (
            <a href={p.repo} target="_blank" rel="noopener noreferrer nofollow ugc" onClick={() => posthog.capture("project_repo_clicked", { project_id: p.id })} className="btn-press flex min-h-10 items-center justify-center gap-1.5 border-2 border-border text-[10px] text-cream hover:border-lime/60">
              <Github size={13} aria-hidden /> GitHub
            </a>
          )}
        </div>

        {p.description && <p className="whitespace-pre-line font-sans text-[13px] normal-case leading-relaxed text-warm">{p.description}</p>}

        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- a GitHub avatar */}
          {p.maker.avatar ? <img src={p.maker.avatar} alt="" width={28} height={28} className="h-7 w-7 shrink-0" /> : <span className="h-7 w-7 shrink-0 bg-bg-raised" />}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[10px] normal-case text-cream">@{p.maker.login}</p>
            {p.uf && <p className="text-[9px] text-muted">{p.uf}</p>}
          </div>
          {onVisitBuilding && (
            <button type="button" onClick={() => onVisitBuilding(p.maker.login)} className="btn-press flex min-h-8 items-center gap-1.5 border-2 border-border px-2.5 text-[9px] text-cream hover:border-lime/60">
              <Building2 size={12} aria-hidden /> Their building
            </button>
          )}
        </div>

        {live && (
          <div className="flex flex-col gap-1.5">
            <p className="text-[9px] text-muted">{p.mine ? "Bring votes" : "Share"}</p>
            <Share slug={slug} p={p} />
          </div>
        )}

        {p.mine ? (
          <div className="flex flex-col gap-2 border-t-2 border-border pt-3">
            <div className="grid grid-cols-2 gap-1.5">
              {p.status !== "hidden" && (
                <button type="button" onClick={() => onEdit(p)} className="btn-press flex min-h-9 items-center justify-center gap-1.5 border-2 border-border text-[10px] text-cream hover:border-lime/60">
                  <Pencil size={12} aria-hidden /> Edit
                </button>
              )}
              {confirmDelete ? (
                <button
                  type="button"
                  onClick={async () => {
                    const r = await postJson(`${api(slug)}/${p.id}`, {}, "DELETE");
                    posthog.capture("project_removed", { project_id: p.id, ok: r.ok });
                    if (r.ok) {
                      onChanged();
                      onClose();
                    }
                  }}
                  className="btn-press flex min-h-9 items-center justify-center gap-1.5 border-2 border-red-400 text-[10px] text-red-400"
                >
                  Take it down for good
                </button>
              ) : (
                <button type="button" onClick={() => setConfirmDelete(true)} className="btn-press flex min-h-9 items-center justify-center gap-1.5 border-2 border-border text-[10px] text-muted hover:text-cream">
                  <Trash2 size={12} aria-hidden /> Delete
                </button>
              )}
            </div>
            {p.status === "rejected" &&
              (appeal === "sent" ? (
                <p className="text-[9px] normal-case text-muted">Sent. A person will look at it.</p>
              ) : (
                <button
                  type="button"
                  onClick={async () => {
                    const r = await postJson(`${api(slug)}/${p.id}`, { action: "appeal", note: "" });
                    setAppeal(r.ok ? "sent" : r.error);
                  }}
                  className="self-start text-[9px] text-muted underline underline-offset-2 hover:text-cream"
                >
                  {appeal ?? "Think it's a mistake? Ask for a look"}
                </button>
              ))}
          </div>
        ) : (
          live && <Report slug={slug} id={p.id} signedIn={signedIn} onSignIn={onSignIn} />
        )}
      </div>
    </Panel>
  );
}
