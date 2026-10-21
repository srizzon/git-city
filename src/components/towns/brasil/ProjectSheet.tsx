"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Building2, Check, Copy, Flag, Github, Pencil, Trash2 } from "lucide-react";
import posthog from "posthog-js";
import Panel from "@/components/league/hud/Panel";
import { Board, useWide } from "./BrasilPanels";
import ProjectBoard from "./ProjectBoard";
import {
  categoryLabel,
  timeLeft,
  weekClosesAt,
  type ProjectCard,
  type ProjectStatus,
} from "@/lib/towns/brasil-projects";
import { ProjectIcon, VoteButton, api, postJson, shareUrl, visitHref } from "./projects-ui";
import { useLang, useT } from "@/lib/i18n/LangProvider";

// A project, opened from the card, the list or a shared link: what it is, a
// Visit through the click-through, its repo, the upvote and its place in the
// week, who made it (and a way to their building on the map), share and
// report. Its maker also sees its status and can edit or take it down.

export type ProjectView = ProjectCard & {
  status: ProjectStatus;
  reason: string | null;
  mine: boolean;
};

const STATUS: Record<ProjectStatus, { label: string; pt: string; tone: string }> = {
  checking: { label: "Checking", pt: "Checando", tone: "text-muted" },
  live: { label: "Live", pt: "No ar", tone: "text-lime" },
  review: { label: "In review", pt: "Em análise", tone: "text-[#f0b429]" },
  rejected: { label: "Rejected", pt: "Recusado", tone: "text-red-400" },
  hidden: { label: "Hidden", pt: "Oculto", tone: "text-red-400" },
  removed: { label: "Removed", pt: "Removido", tone: "text-muted" },
};

export const statusOf = (s: ProjectStatus) => STATUS[s];

export function Share({ slug, p }: { slug: string; p: ProjectCard }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const url = shareUrl(slug, p.slug);
  const text = `Vota no ${p.name} no mapa dos devs do Brasil`;
  const go = (channel: string) => posthog.capture("project_shared", { project_id: p.id, channel });
  const links = [
    {
      id: "x",
      label: "X",
      href: `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
    },
    {
      id: "linkedin",
      label: "LinkedIn",
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
    },
    {
      id: "whatsapp",
      label: "WhatsApp",
      href: `https://wa.me/?text=${encodeURIComponent(`${text}: ${url}`)}`,
    },
  ];
  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(url).then(
            () => setCopied(true),
            () => {},
          );
          go("copy");
        }}
        className="btn-press flex min-h-9 items-center justify-between gap-2 border-2 border-border px-3 text-left text-[9px] normal-case text-cream hover:border-lime/60"
      >
        <span className="truncate text-muted">{url.replace(/^https?:\/\//, "")}</span>
        <span className="flex shrink-0 items-center gap-1 uppercase text-lime">
          {copied ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />}{" "}
          {copied ? t("Copied", "Copiado") : t("Copy", "Copiar")}
        </span>
      </button>
      <div className="grid grid-cols-3 gap-1.5">
        {links.map((l) => (
          <a
            key={l.id}
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => go(l.id)}
            className="btn-press flex min-h-9 items-center justify-center border-2 border-border text-[9px] text-cream hover:border-lime/60"
          >
            {l.label}
          </a>
        ))}
      </div>
    </div>
  );
}

const REASONS = [
  { id: "scam", label: "Scam", pt: "Golpe" },
  { id: "gambling", label: "Gambling", pt: "Aposta" },
  { id: "broken", label: "Broken", pt: "Quebrado" },
  { id: "not_theirs", label: "Not theirs", pt: "Não é dele" },
  { id: "other", label: "Other", pt: "Outro" },
];

function Report({
  slug,
  id,
  signedIn,
  onSignIn,
}: {
  slug: string;
  id: number;
  signedIn: boolean;
  onSignIn: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  if (done) return <p className="text-[9px] normal-case text-muted">{done}</p>;
  if (!open)
    return (
      <button
        type="button"
        onClick={() => (signedIn ? setOpen(true) : onSignIn())}
        className="flex items-center gap-1.5 self-start text-[9px] text-muted hover:text-cream"
      >
        <Flag size={11} aria-hidden /> {t("Report", "Denunciar")}
      </button>
    );
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[9px] text-muted">{t("What's wrong with it?", "Qual o problema?")}</p>
      <div className="flex flex-wrap gap-1.5">
        {REASONS.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={async () => {
              const res = await postJson(`${api(slug)}/${id}`, {
                action: "report",
                reason: r.id,
                note: "",
              });
              posthog.capture("project_reported", { project_id: id, reason: r.id, ok: res.ok });
              setDone(res.ok ? t("Thanks. We'll take a look.", "Valeu. A gente vai dar uma olhada.") : res.error);
            }}
            className="btn-press border-2 border-border px-2 py-1 text-[9px] text-cream hover:border-red-400/70"
          >
            {t(r.label, r.pt)}
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
  const [p, setP] = useState<ProjectView | null>(
    initial ? { ...initial, status: "live", reason: null, mine: false } : null,
  );
  const [missing, setMissing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [appeal, setAppeal] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const wide = useWide();
  const { lang, t } = useLang();

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

  const Shell = wide ? Board : Panel;
  if (missing && !p)
    return (
      <Shell title={t("Project", "Projeto")} onClose={onClose}>
        <p className="text-[10px] normal-case text-muted">{t("This project isn't up anymore.", "Esse projeto não tá mais no ar.")}</p>
      </Shell>
    );
  if (!p)
    return (
      <Shell title={t("Project", "Projeto")} onClose={onClose}>
        <p className="text-[10px] text-muted">{t("Loading", "Carregando")}</p>
      </Shell>
    );

  const remove = async () => {
    const r = await postJson(`${api(slug)}/${p.id}`, {}, "DELETE");
    posthog.capture("project_removed", { project_id: p.id, ok: r.ok });
    if (r.ok) {
      onChanged();
      onClose();
    }
  };
  const st = statusOf(p.status);
  const live = p.status === "live";
  const status = p.mine && !live && (
    <div className="border-2 border-border bg-bg-raised px-3 py-2 text-[9px]">
      <span className={st.tone}>{t(st.label, st.pt)}</span>
      {p.reason && <p className="mt-1 text-[10px] normal-case text-muted">{p.reason}</p>}
      {p.status === "review" && (
        <p className="mt-1 text-[10px] normal-case text-muted">
          {t("A person looks at it soon. You get an email either way.", "Uma pessoa vai olhar em breve. Você recebe um email de qualquer jeito.")}
        </p>
      )}
    </div>
  );
  const cover = p.cover && (
    // eslint-disable-next-line @next/next/no-img-element -- the project's own og:image
    <img
      src={p.cover}
      alt=""
      referrerPolicy="no-referrer"
      className="aspect-[1.91/1] w-full border-2 border-border bg-bg-raised object-cover"
      onError={(e) => (e.currentTarget.style.display = "none")}
    />
  );
  const header = (
    <div className="flex items-start gap-3">
      <ProjectIcon project={p} size={40} />
      <div className="min-w-0 flex-1">
        <h3 className="break-words text-[13px] normal-case leading-tight text-cream">{p.name}</h3>
        <p className="mt-1 font-sans text-[13px] normal-case leading-snug text-warm">{p.tagline}</p>
        <p className="mt-1.5 text-[9px] text-muted">
          {categoryLabel(p.category, lang)} · <span className="normal-case">{p.host}</span>
        </p>
      </div>
    </div>
  );
  const rank = live && (
    <div className="flex items-center justify-between gap-3 border-y-2 border-border py-2.5">
      <div className="text-[9px] text-muted">
        {p.rank ? (
          <span>
            <span className="text-[13px] tabular-nums text-cream">#{p.rank}</span>{" "}
            {p.week && weekClosesAt(p.week) > now
              ? t(`this week · ${timeLeft(p.week, now, lang)}`, `da semana · ${timeLeft(p.week, now, lang)}`)
              : t("of its week", "da semana dele")}
          </span>
        ) : (
          <span>{t("Upvote to push it up", "Vota pra subir ele")}</span>
        )}
      </div>
      <VoteButton
        key={`${p.id}:${p.votes}:${p.voted}`}
        slug={slug}
        project={p}
        signedIn={signedIn}
        mine={p.mine}
        size="lg"
        from={`sheet_${from}`}
        onSignIn={onSignIn}
        onChange={onChanged}
      />
    </div>
  );
  const actions = (
    <div className="grid grid-cols-2 gap-1.5">
      <a
        href={live ? visitHref(slug, p.id) : p.url}
        target="_blank"
        rel="noopener noreferrer nofollow ugc"
        onClick={() => posthog.capture("project_visit_clicked", { project_id: p.id, from })}
        className={`btn-press flex min-h-10 items-center justify-center gap-1.5 bg-lime text-[10px] text-bg ${p.repo ? "" : "col-span-2"}`}
      >
        {t("Visit", "Visitar")} <ArrowUpRight size={13} aria-hidden />
      </a>
      {p.repo && (
        <a
          href={p.repo}
          target="_blank"
          rel="noopener noreferrer nofollow ugc"
          onClick={() => posthog.capture("project_repo_clicked", { project_id: p.id })}
          className="btn-press flex min-h-10 items-center justify-center gap-1.5 border-2 border-border text-[10px] text-cream hover:border-lime/60"
        >
          <Github size={13} aria-hidden /> GitHub
        </a>
      )}
    </div>
  );
  const description = p.description && (
    <p className="whitespace-pre-line font-sans text-[13px] normal-case leading-relaxed text-warm">
      {p.description}
    </p>
  );
  const maker = (
    <div className="flex items-center gap-2.5">
      {p.maker.avatar ? (
        // eslint-disable-next-line @next/next/no-img-element -- a GitHub avatar
        <img src={p.maker.avatar} alt="" width={28} height={28} className="h-7 w-7 shrink-0" />
      ) : (
        <span className="h-7 w-7 shrink-0 bg-bg-raised" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[10px] normal-case text-cream">@{p.maker.login}</p>
        {p.uf && <p className="text-[9px] text-muted">{p.uf}</p>}
      </div>
      {onVisitBuilding && (
        <button
          type="button"
          onClick={() => onVisitBuilding(p.maker.login)}
          className="btn-press flex min-h-8 items-center gap-1.5 border-2 border-border px-2.5 text-[9px] text-cream hover:border-lime/60"
        >
          <Building2 size={12} aria-hidden /> {t("Their building", "Prédio dele")}
        </button>
      )}
    </div>
  );
  const share = live && (
    <div className="flex flex-col gap-1.5">
      <p className="text-[9px] text-muted">{p.mine ? t("Bring votes", "Traz votos") : t("Share", "Compartilhar")}</p>
      <Share slug={slug} p={p} />
    </div>
  );
  const owner = p.mine ? (
    <div className="flex flex-col gap-2 border-t-2 border-border pt-3">
      <div className="grid grid-cols-2 gap-1.5">
        {p.status !== "hidden" && (
          <button
            type="button"
            onClick={() => onEdit(p)}
            className="btn-press flex min-h-9 items-center justify-center gap-1.5 border-2 border-border text-[10px] text-cream hover:border-lime/60"
          >
            <Pencil size={12} aria-hidden /> {t("Edit", "Editar")}
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
            {t("Delete? This week's slot doesn't come back", "Apagar? A vaga da semana não volta")}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="btn-press flex min-h-9 items-center justify-center gap-1.5 border-2 border-border text-[10px] text-muted hover:text-cream"
          >
            <Trash2 size={12} aria-hidden /> {t("Delete", "Apagar")}
          </button>
        )}
      </div>
      {p.status === "rejected" &&
        (appeal === "sent" ? (
          <p className="text-[9px] normal-case text-muted">{t("Sent. A person will look at it.", "Enviado. Uma pessoa vai olhar.")}</p>
        ) : (
          <button
            type="button"
            onClick={async () => {
              const r = await postJson(`${api(slug)}/${p.id}`, { action: "appeal", note: "" });
              setAppeal(r.ok ? "sent" : r.error);
            }}
            className="self-start text-[9px] text-muted underline underline-offset-2 hover:text-cream"
          >
            {appeal ?? t("Think it's a mistake? Ask for a look", "Acha que foi engano? Pede uma revisão")}
          </button>
        ))}
    </div>
  ) : (
    live && <Report slug={slug} id={p.id} signedIn={signedIn} onSignIn={onSignIn} />
  );

  // A wide screen: a board in the middle like States, the project on the left and what you do with it on the right.
  if (wide)
    return (
      <ProjectBoard
        slug={slug}
        p={p}
        now={now}
        signedIn={signedIn}
        status={status}
        onSignIn={onSignIn}
        onClose={onClose}
        onVisitBuilding={onVisitBuilding}
        onEdit={onEdit}
        onDelete={remove}
        onChanged={onChanged}
        from={from}
      />
    );
  return (
    <Panel title={t("Project", "Projeto")} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {status}
        {cover}
        {header}
        {rank}
        {actions}
        {description}
        {maker}
        {share}
        {owner}
      </div>
    </Panel>
  );
}
