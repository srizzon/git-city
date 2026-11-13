"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useLang } from "@/lib/i18n/LangProvider";

// The (i) next to a player's commit count: how GitHub counts, how to turn on
// private contributions, when Git City re-syncs, and a button to sync now.

type Lang = "en" | "pt";

const GITHUB_PRIVATE_URL =
  "https://docs.github.com/en/account-and-profile/setting-up-and-managing-your-github-profile/managing-contribution-settings-on-your-profile/showing-your-private-contributions-and-achievements-on-your-profile";

const GITHUB_RULES_URL =
  "https://docs.github.com/en/account-and-profile/setting-up-and-managing-your-github-profile/managing-contribution-settings-on-your-profile/why-are-my-contributions-not-showing-up-on-my-profile";

const COPY = {
  en: {
    open: "How contributions are counted",
    title: "How contributions count",
    sourceH: "Where the number comes from",
    source: "Everything on your GitHub contribution graph, all years added up: commits, pull requests, issues and reviews.",
    privateH: "Private repos",
    private: "GitHub leaves them out by default. On your GitHub profile, open Contribution settings above the graph and check Private contributions.",
    privateLink: "Open the GitHub profile",
    privateSteps: "GitHub's steps",
    missingH: "Still missing some?",
    missing: "GitHub only counts a commit when its email is on your GitHub account, it is on the default branch and the repo isn't a fork.",
    missingLink: "GitHub's rules",
    updatesH: "When it updates",
    updates: "Every 6 hours while you play, within 10 days otherwise. The city redraws every 30 minutes, so a new height can take that long to show.",
    synced: (ago: string) => `Synced ${ago}`,
    never: "Not synced yet",
    refresh: "Refresh now",
    syncing: "Syncing…",
    upToDate: "Already up to date",
    gained: (n: number, total: string) => `+${n.toLocaleString()} · now ${total}`,
    signIn: "Sign in to refresh",
    rateLimited: "Too many refreshes. Try again later.",
    failed: "GitHub didn't answer. Try again in a minute.",
    close: "Close",
    ago: { now: "just now", m: "min ago", h: "h ago", d: "d ago" },
  },
  pt: {
    open: "Como as contribuições são contadas",
    title: "Como as contribuições contam",
    sourceH: "De onde vem o número",
    source: "Tudo que aparece no seu gráfico de contribuições do GitHub, somando todos os anos: commits, pull requests, issues e reviews.",
    privateH: "Repos privados",
    private: "O GitHub deixa eles de fora por padrão. No seu perfil do GitHub, abra Contribution settings acima do gráfico e marque Private contributions.",
    privateLink: "Abrir o perfil no GitHub",
    privateSteps: "Passo a passo do GitHub",
    missingH: "Ainda faltando?",
    missing: "O GitHub só conta um commit se o email dele estiver na sua conta do GitHub, se ele estiver na branch padrão e se o repo não for um fork.",
    missingLink: "Regras do GitHub",
    updatesH: "Quando atualiza",
    updates: "A cada 6 horas enquanto você joga, em até 10 dias fora isso. A cidade é redesenhada a cada 30 minutos, então a altura nova pode levar isso pra aparecer.",
    synced: (ago: string) => `Atualizado ${ago}`,
    never: "Ainda não atualizado",
    refresh: "Atualizar agora",
    syncing: "Atualizando…",
    upToDate: "Já está em dia",
    gained: (n: number, total: string) => `+${n.toLocaleString("pt-BR")} · agora ${total}`,
    signIn: "Entre pra atualizar",
    rateLimited: "Muitas atualizações. Tente mais tarde.",
    failed: "O GitHub não respondeu. Tente de novo em um minuto.",
    close: "Fechar",
    ago: { now: "agora", m: "min atrás", h: "h atrás", d: "d atrás" },
  },
} as const;

function timeAgo(iso: string, words: (typeof COPY)[Lang]["ago"]): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return words.now;
  if (min < 60) return `${min} ${words.m}`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h}${words.h}`;
  return `${Math.floor(h / 24)}${words.d}`;
}

interface Props {
  /** The building whose count this explains. Without it (lists, comparisons)
   *  the window explains counting but has no sync status or refresh button. */
  login?: string;
  lang?: Lang;
  accent?: string;
  /** Called with the new all-years total after a refresh that changed it. */
  onRefreshed?: (contributions: number) => void;
  className?: string;
}

type Phase =
  | { kind: "idle" }
  | { kind: "syncing" }
  | { kind: "done"; text: string }
  | { kind: "error"; text: string };

export default function CommitsInfo({ login, lang: langProp, accent = "#c8e64a", onRefreshed, className = "" }: Props) {
  // Inside the Brasil map's LangProvider this speaks Portuguese; elsewhere English.
  const ctx = useLang();
  const lang: Lang = langProp ?? (ctx.lang === "pt" ? "pt" : "en");
  const t = COPY[lang];
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<string | null | undefined>(undefined);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  useEffect(() => {
    if (!open) return;
    let alive = true;
    if (login) {
      fetch(`/api/dev/${encodeURIComponent(login)}/refresh`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (alive) setFetchedAt(d?.fetched_at ?? null); })
        .catch(() => { if (alive) setFetchedAt(null); });
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => { alive = false; window.removeEventListener("keydown", onKey); };
  }, [open, login]);

  const refresh = async () => {
    if (!login) return;
    setPhase({ kind: "syncing" });
    try {
      const r = await fetch(`/api/dev/${encodeURIComponent(login)}/refresh`, { method: "POST" });
      if (r.status === 401) return setPhase({ kind: "error", text: t.signIn });
      if (r.status === 429) return setPhase({ kind: "error", text: t.rateLimited });
      if (!r.ok) return setPhase({ kind: "error", text: t.failed });
      const d = (await r.json()) as { contributions: number; previous: number; fetched_at: string | null };
      setFetchedAt(d.fetched_at);
      const gained = d.contributions - d.previous;
      const total = d.contributions.toLocaleString(lang === "pt" ? "pt-BR" : "en-US");
      setPhase({ kind: "done", text: gained > 0 ? t.gained(gained, total) : t.upToDate });
      if (gained !== 0) {
        if (onRefreshed) onRefreshed(d.contributions);
        else router.refresh();
      }
    } catch {
      setPhase({ kind: "error", text: t.failed });
    }
  };

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen(true); setPhase({ kind: "idle" }); }}
        aria-label={t.open}
        title={t.open}
        className={`inline-flex h-3.5 w-3.5 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border-light align-middle font-pixel text-[7px] leading-none text-muted normal-case transition-colors hover:border-cream hover:text-cream ${className}`}
      >
        i
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 px-4"
          onClick={(e) => { stop(e); if (e.target === e.currentTarget) setOpen(false); }}
          onPointerDown={stop}
          onWheel={stop}
          role="dialog"
          aria-modal="true"
          aria-labelledby="commits-info-title"
        >
          <div className="relative flex max-h-[88vh] w-full max-w-sm flex-col border-2 border-border-light bg-bg text-left normal-case">
            <div className="flex items-center justify-between border-b-2 border-border px-4 py-3">
              <h2 id="commits-info-title" className="font-pixel text-xs uppercase tracking-wide" style={{ color: accent }}>
                {t.title}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t.close}
                className="cursor-pointer font-pixel text-sm text-muted hover:text-cream"
              >
                &#10005;
              </button>
            </div>

            <div className="no-scrollbar flex-1 space-y-4 overflow-y-auto px-4 py-4">
              <Block title={t.sourceH} body={t.source} />
              <Block title={t.privateH} body={t.private}>
                <a
                  href={login ? `https://github.com/${encodeURIComponent(login)}` : GITHUB_PRIVATE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1.5 inline-block text-[11px] underline underline-offset-2 hover:text-cream"
                  style={{ color: accent }}
                >
                  {login ? t.privateLink : t.privateSteps} ↗
                </a>
              </Block>
              <Block title={t.missingH} body={t.missing}>
                <a
                  href={GITHUB_RULES_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1.5 inline-block text-[11px] text-muted underline underline-offset-2 hover:text-cream"
                >
                  {t.missingLink} ↗
                </a>
              </Block>
              <Block title={t.updatesH} body={t.updates} />
            </div>

            {login && <div className="flex items-center justify-between gap-3 border-t-2 border-border px-4 py-3">
              <p className="min-w-0 text-[11px] leading-snug" aria-live="polite">
                {phase.kind === "done" ? (
                  <span style={{ color: accent }}>{phase.text}</span>
                ) : phase.kind === "error" ? (
                  <span className="text-red-400">{phase.text}</span>
                ) : (
                  <span className="text-muted">
                    {fetchedAt === undefined ? " " : fetchedAt ? t.synced(timeAgo(fetchedAt, t.ago)) : t.never}
                  </span>
                )}
              </p>
              <button
                type="button"
                onClick={refresh}
                disabled={phase.kind === "syncing"}
                className="btn-press shrink-0 cursor-pointer border-2 px-3 py-1.5 font-pixel text-[10px] uppercase tracking-wide text-bg disabled:cursor-wait disabled:opacity-60"
                style={{ backgroundColor: accent, borderColor: accent }}
              >
                {phase.kind === "syncing" ? t.syncing : t.refresh}
              </button>
            </div>}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function Block({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <section>
      <h3 className="font-pixel text-[10px] uppercase tracking-wide text-cream">{title}</h3>
      <p className="mt-1 text-[11px] leading-relaxed text-warm">{body}</p>
      {children}
    </section>
  );
}
