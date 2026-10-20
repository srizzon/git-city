"use client";

import { useState, type ReactNode } from "react";
import { ArrowUpRight, Building2, Check, Flag, Github, Link2, Linkedin, MessageCircle, Pencil, Trash2 } from "lucide-react";
import posthog from "posthog-js";
import { categoryLabel, timeLeft, weekClosesAt } from "@/lib/towns/brasil-projects";
import { Board } from "./BrasilPanels";
import { ProjectIcon, VoteButton, api, postJson, shareUrl, visitHref } from "./projects-ui";
import type { ProjectView } from "./ProjectSheet";

// A project on a wide screen: a board in the middle of the map. The name,
// its line and its place in the week sit on the profile's pixel grid; under
// it the upvote and Visit side by side, the description, who made it and the
// share buttons. The site's icon stays small beside the name and its
// og:image isn't shown: most aren't made to be looked at big.

/** The profile's pixel grid, as a background. */
const GRID = {
  backgroundImage: "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
  backgroundSize: "8px 8px",
};

const REASONS = [
  { id: "scam", label: "Scam" },
  { id: "gambling", label: "Gambling" },
  { id: "broken", label: "Broken" },
  { id: "not_theirs", label: "Not theirs" },
  { id: "other", label: "Other" },
];

/** A square button with an icon, like the profile's social links. */
function Square({ label, href, onClick, children, active = false }: { label: string; href?: string; onClick?: () => void; children: ReactNode; active?: boolean }) {
  const cls = `btn-press flex h-9 w-9 items-center justify-center border-2 transition-colors ${active ? "border-lime text-lime" : "border-border-light text-cream hover:border-lime hover:text-lime"}`;
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow ugc" aria-label={label} title={label} onClick={onClick} className={cls}>
      {children}
    </a>
  ) : (
    <button type="button" aria-label={label} title={label} onClick={onClick} className={cls}>
      {children}
    </button>
  );
}

function Report({ slug, id, signedIn, onSignIn }: { slug: string; id: number; signedIn: boolean; onSignIn: () => void }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  if (done) return <span className="text-[9px] normal-case text-muted">{done}</span>;
  if (!open)
    return (
      <button type="button" onClick={() => (signedIn ? setOpen(true) : onSignIn())} className="flex items-center gap-1.5 text-[9px] text-dim hover:text-cream">
        <Flag size={11} aria-hidden /> Report
      </button>
    );
  return (
    <span className="flex flex-wrap items-center gap-1.5">
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
    </span>
  );
}

export default function ProjectBoard({
  slug,
  p,
  now,
  signedIn,
  status,
  onSignIn,
  onClose,
  onVisitBuilding,
  onEdit,
  onDelete,
  onChanged,
  from,
}: {
  slug: string;
  p: ProjectView;
  now: number;
  signedIn: boolean;
  /** The maker's own note when it isn't live (in review, rejected). */
  status: ReactNode;
  onSignIn: () => void;
  onClose: () => void;
  onVisitBuilding?: (login: string) => void;
  onEdit: (p: ProjectView) => void;
  onDelete: () => void;
  onChanged: () => void;
  from: string;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);
  const live = p.status === "live";
  const open = !!p.week && weekClosesAt(p.week) > now;
  const url = shareUrl(slug, p.slug);
  const shareText = `Vota no ${p.name} no mapa dos devs do Brasil`;
  const shared = (channel: string) => posthog.capture("project_shared", { project_id: p.id, channel });

  const mark = <ProjectIcon project={p} size={28} />;
  const place = live && (
    <p className="text-[10px] text-muted">
      {p.rank ? (
        <>
          <span className="text-lime">#{p.rank}</span> {open ? "this week" : "of its week"}
        </>
      ) : (
        "New this week"
      )}
      {" · "}
      <span className="tabular-nums text-cream">{p.votes}</span> {p.votes === 1 ? "upvote" : "upvotes"}
      {open && p.week ? ` · ${timeLeft(p.week, now)}` : ""}
    </p>
  );
  const vote = live && <VoteButton key={`${p.id}:${p.votes}:${p.voted}`} slug={slug} project={p} signedIn={signedIn} mine={p.mine} size="hero" from={`board_${from}`} onSignIn={onSignIn} onChange={onChanged} />;
  const visit = (
    <a
      href={live ? visitHref(slug, p.id) : p.url}
      target="_blank"
      rel="noopener noreferrer nofollow ugc"
      onClick={() => posthog.capture("project_visit_clicked", { project_id: p.id, from })}
      className="btn-press flex min-h-12 flex-1 items-center justify-center gap-2 border-2 border-border-light px-4 text-[12px] text-cream hover:border-lime hover:text-lime"
    >
      Visit <ArrowUpRight size={14} aria-hidden />
    </a>
  );
  const repo = p.repo && (
    <a href={p.repo} target="_blank" rel="noopener noreferrer nofollow ugc" aria-label="GitHub repo" title="GitHub repo" onClick={() => posthog.capture("project_repo_clicked", { project_id: p.id })} className="btn-press flex h-12 w-12 shrink-0 items-center justify-center border-2 border-border-light text-cream hover:border-lime hover:text-lime">
      <Github size={16} aria-hidden />
    </a>
  );
  const words = p.description && <p className="whitespace-pre-line font-sans text-[14px] normal-case leading-relaxed text-warm">{p.description}</p>;
  const shareRow = live && (
    <div className="flex items-center gap-1.5">
      <Square
        label={copied ? "Copied" : "Copy link"}
        active={copied}
        onClick={() => {
          void navigator.clipboard?.writeText(url).then(() => setCopied(true), () => {});
          shared("copy");
        }}
      >
        {copied ? <Check size={15} aria-hidden /> : <Link2 size={15} aria-hidden />}
      </Square>
      <Square label="Share on X" href={`https://x.com/intent/post?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(url)}`} onClick={() => shared("x")}>
        <span className="text-[12px]">X</span>
      </Square>
      <Square label="Share on LinkedIn" href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`} onClick={() => shared("linkedin")}>
        <Linkedin size={15} aria-hidden />
      </Square>
      <Square label="Share on WhatsApp" href={`https://wa.me/?text=${encodeURIComponent(`${shareText}: ${url}`)}`} onClick={() => shared("whatsapp")}>
        <MessageCircle size={15} aria-hidden />
      </Square>
    </div>
  );
  const footer = (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-border pt-4">
      <div className="flex min-w-0 items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- a GitHub avatar */}
        {p.maker.avatar ? <img src={p.maker.avatar} alt="" width={32} height={32} className="h-8 w-8 shrink-0" /> : <span className="h-8 w-8 shrink-0 bg-bg-raised" />}
        <p className="min-w-0 text-[10px] text-muted">
          Made by <span className="normal-case text-cream">@{p.maker.login}</span>
        </p>
        {onVisitBuilding && (
          <button type="button" onClick={() => onVisitBuilding(p.maker.login)} className="btn-press flex h-8 items-center gap-1.5 border-2 border-border px-2.5 text-[9px] text-cream hover:border-lime/60">
            <Building2 size={12} aria-hidden /> Their building
          </button>
        )}
      </div>
      {shareRow}
    </div>
  );
  const own = p.mine ? (
    <div className="flex items-center justify-end gap-1.5">
      {p.status !== "hidden" && (
        <button type="button" onClick={() => onEdit(p)} className="btn-press flex h-8 items-center gap-1.5 border-2 border-border px-2.5 text-[9px] text-cream hover:border-lime/60">
          <Pencil size={12} aria-hidden /> Edit
        </button>
      )}
      {confirmDelete ? (
        <button type="button" onClick={onDelete} className="btn-press flex h-8 items-center gap-1.5 border-2 border-red-400 px-2.5 text-[9px] text-red-400">
          Take it down for good
        </button>
      ) : (
        <button type="button" onClick={() => setConfirmDelete(true)} className="btn-press flex h-8 items-center gap-1.5 border-2 border-border px-2.5 text-[9px] text-muted hover:text-cream">
          <Trash2 size={12} aria-hidden /> Delete
        </button>
      )}
    </div>
  ) : (
    live && (
      <div className="flex justify-end">
        <Report slug={slug} id={p.id} signedIn={signedIn} onSignIn={onSignIn} />
      </div>
    )
  );

  return (
    <Board title="Project" onClose={onClose} width={680}>
      <div className="flex flex-col gap-5">
        {status}
        <section className="flex flex-col items-center gap-3 border-[3px] border-border bg-bg-raised px-6 pb-6 pt-7 text-center" style={GRID}>
          <div className="flex items-center gap-3">
            {mark}
            <h3 className="min-w-0 break-words text-3xl leading-none text-cream">{p.name}</h3>
          </div>
          <p className="max-w-[44ch] text-balance font-sans text-[17px] normal-case leading-snug text-cream">{p.tagline}</p>
          <p className="text-[9px] text-muted">
            {categoryLabel(p.category)} · <span className="normal-case">{p.host}</span>
            {p.uf ? ` · ${p.uf}` : ""}
          </p>
          {place}
        </section>
        <div className="flex gap-2">
          {vote && <div className="flex-1">{vote}</div>}
          {visit}
          {repo}
        </div>
        {words}
        {footer}
        {own}
      </div>
    </Board>
  );
}
