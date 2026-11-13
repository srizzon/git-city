"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createBrowserSupabase } from "@/lib/supabase";
import { useLang } from "@/lib/i18n/LangProvider";

// The (i) next to a player's commit count. Opens: the building's number with
// a sync button, three steps to turn on private contributions (GitHub's own
// menu redrawn in the city's look, real labels), and when counts update.

type Lang = "en" | "pt";

const GITHUB_RULES_URL =
  "https://docs.github.com/en/account-and-profile/setting-up-and-managing-your-github-profile/managing-contribution-settings-on-your-profile/why-are-my-contributions-not-showing-up-on-my-profile";

const COPY = {
  en: {
    open: "How contributions are counted",
    title: "Contributions",
    generic: "How contributions count",
    privateH: "Missing private commits?",
    step1: "Open your GitHub profile",
    step1Btn: "Open",
    step2: "Above the graph, click Contribution settings",
    step3: "Check Private contributions, then refresh here",
    updatesH: "When it updates",
    tiles: [["6h", "while you play"], ["10d", "everyone else"], ["30m", "city redraw"]] as const,
    rules: "Still missing some? GitHub skips forks, other branches and emails not on your account.",
    rulesLink: "Rules",
    synced: (ago: string) => `synced ${ago}`,
    never: "not synced yet",
    refresh: "Refresh",
    syncing: "Syncing",
    upToDate: "Up to date",
    gained: (n: string) => `+${n} new`,
    signIn: "Sign in to refresh",
    rateLimited: "Too many refreshes. Try later.",
    failed: "GitHub didn't answer. Try again.",
    close: "Close",
    ago: { now: "just now", m: "min ago", h: "h ago", d: "d ago" },
  },
  pt: {
    open: "Como as contribuições são contadas",
    title: "Contribuições",
    generic: "Como as contribuições contam",
    privateH: "Faltam commits privados?",
    step1: "Abra seu perfil no GitHub",
    step1Btn: "Abrir",
    step2: "Acima do gráfico, clique em Contribution settings",
    step3: "Marque Private contributions e atualize aqui",
    updatesH: "Quando atualiza",
    tiles: [["6h", "enquanto joga"], ["10d", "o resto"], ["30m", "cidade redesenha"]] as const,
    rules: "Ainda faltando? O GitHub ignora forks, outras branches e emails fora da sua conta.",
    rulesLink: "Regras",
    synced: (ago: string) => `atualizado ${ago}`,
    never: "ainda não atualizado",
    refresh: "Atualizar",
    syncing: "Atualizando",
    upToDate: "Em dia",
    gained: (n: string) => `+${n} novas`,
    signIn: "Entre pra atualizar",
    rateLimited: "Muitas atualizações. Tente depois.",
    failed: "O GitHub não respondeu. Tente de novo.",
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

/** Square pixel "i": the city's square, 1px-grid look, not a round web icon. */
function PixelInfo() {
  return (
    <svg viewBox="0 0 9 9" width="9" height="9" shapeRendering="crispEdges" aria-hidden className="block">
      <path fill="currentColor" fillRule="evenodd" d="M0 0h9v9H0z M1 1v7h7V1z M4 2h1v1H4z M4 4h1v3H4z" />
    </svg>
  );
}

interface Props {
  /** The building whose count this explains. Without it (lists, comparisons)
   *  the window explains counting but has no number or refresh button. */
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

interface Status {
  contributions: number;
  fetched_at: string | null;
}

export default function CommitsInfo({ login, lang: langProp, accent = "#c8e64a", onRefreshed, className = "" }: Props) {
  // Inside the Brasil map's LangProvider this speaks Portuguese; elsewhere English.
  const ctx = useLang();
  const lang: Lang = langProp ?? (ctx.lang === "pt" ? "pt" : "en");
  const t = COPY[lang];
  const locale = lang === "pt" ? "pt-BR" : "en-US";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status | null | undefined>(undefined);
  const [viewer, setViewer] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  useEffect(() => {
    if (!open) return;
    let alive = true;
    if (login) {
      fetch(`/api/dev/${encodeURIComponent(login)}/refresh`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (alive) setStatus(d ? { contributions: d.contributions, fetched_at: d.fetched_at } : null); })
        .catch(() => { if (alive) setStatus(null); });
    }
    // The private-contributions switch lives on the VIEWER's GitHub profile,
    // whoever's building this is.
    createBrowserSupabase()
      .auth.getUser()
      .then(({ data }: { data: { user: User | null } }) => {
        const m = data.user?.user_metadata;
        const name = (m?.user_name ?? m?.preferred_username ?? "") as string;
        if (alive) setViewer(name || null);
      })
      .catch(() => {});
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
      setStatus({ contributions: d.contributions, fetched_at: d.fetched_at });
      const gained = d.contributions - d.previous;
      setPhase({ kind: "done", text: gained > 0 ? t.gained(gained.toLocaleString(locale)) : t.upToDate });
      if (gained !== 0) {
        if (onRefreshed) onRefreshed(d.contributions);
        else router.refresh();
      }
    } catch {
      setPhase({ kind: "error", text: t.failed });
    }
  };

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const profileUrl = viewer ? `https://github.com/${encodeURIComponent(viewer)}` : "https://github.com/";

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen(true); setPhase({ kind: "idle" }); }}
        aria-label={t.open}
        title={t.open}
        className={`-m-1 inline-flex shrink-0 cursor-pointer items-center justify-center p-1 align-middle text-dim transition-colors hover:text-cream ${className}`}
      >
        <PixelInfo />
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[200] flex items-end justify-center bg-black/80 font-pixel uppercase sm:items-center sm:px-4"
          onClick={(e) => { stop(e); if (e.target === e.currentTarget) setOpen(false); }}
          onPointerDown={stop}
          onWheel={stop}
          role="dialog"
          aria-modal="true"
          aria-label={login ? t.title : t.generic}
        >
          <div className="no-scrollbar relative max-h-[92vh] w-full overflow-y-auto border-[3px] border-border bg-bg text-left text-warm sm:max-w-md">
            {/* Header: the number */}
            <div className="flex items-start justify-between gap-3 border-b-[3px] border-border px-5 pt-4 pb-4">
              <div className="min-w-0">
                <p className="text-[10px] tracking-widest text-muted">
                  {login ? <>{t.title} <span className="normal-case">· @{login}</span></> : t.generic}
                </p>
                {login && (
                  <p className="mt-2 text-3xl leading-none tabular-nums" style={{ color: accent }}>
                    {status ? status.contributions.toLocaleString(locale) : " "}
                  </p>
                )}
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label={t.close} className="-mr-1 cursor-pointer p-1 text-sm text-muted hover:text-cream">
                &#10005;
              </button>
            </div>

            {/* Sync */}
            {login && (
              <div className="flex items-center justify-between gap-3 border-b-[3px] border-border bg-bg-raised px-5 py-3">
                <p className="min-w-0 text-[10px] leading-snug" aria-live="polite">
                  {phase.kind === "done" ? (
                    <span style={{ color: accent }}>{phase.text}</span>
                  ) : phase.kind === "error" ? (
                    <span className="text-red-400">{phase.text}</span>
                  ) : (
                    <span className="text-muted">
                      {status === undefined ? " " : status?.fetched_at ? t.synced(timeAgo(status.fetched_at, t.ago)) : t.never}
                    </span>
                  )}
                </p>
                <button
                  type="button"
                  onClick={refresh}
                  disabled={phase.kind === "syncing"}
                  className="btn-press shrink-0 cursor-pointer px-4 py-2 text-[10px] text-bg disabled:cursor-wait disabled:opacity-60"
                  style={{ backgroundColor: accent }}
                >
                  {phase.kind === "syncing" ? `${t.syncing}…` : t.refresh}
                </button>
              </div>
            )}

            {/* Steps */}
            <div className="px-5 pt-5">
              <p className="text-xs text-cream">{t.privateH}</p>
              <ol className="mt-4 space-y-4">
                <Step n={1} accent={accent} text={t.step1}>
                  <a
                    href={profileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-press shrink-0 border-[3px] border-border px-3 py-1.5 text-[10px] text-cream transition-colors hover:border-border-light"
                  >
                    {t.step1Btn} ↗
                  </a>
                </Step>
                <Step n={2} accent={accent} text={t.step2} />
                <li className="ml-10">
                  <GitHubMenu accent={accent} />
                </li>
                <Step n={3} accent={accent} text={t.step3} />
              </ol>
            </div>

            {/* When it updates */}
            <div className="px-5 pt-6 pb-5">
              <p className="text-xs text-cream">{t.updatesH}</p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {t.tiles.map(([v, label]) => (
                  <div key={label} className="border-[3px] border-border bg-bg-card px-2 py-2.5 text-center">
                    <div className="text-base" style={{ color: accent }}>{v}</div>
                    <div className="mt-1 text-[8px] text-muted">{label}</div>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-[10px] leading-relaxed text-muted normal-case">
                {t.rules}{" "}
                <a href={GITHUB_RULES_URL} target="_blank" rel="noopener noreferrer" className="text-cream underline underline-offset-2 hover:text-white">
                  {t.rulesLink} ↗
                </a>
              </p>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function Step({ n, accent, text, children }: { n: number; accent: string; text: string; children?: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center border-[3px] border-border text-[10px]" style={{ color: accent }}>
        {n}
      </span>
      <span className="min-w-0 flex-1 text-[11px] leading-snug text-warm normal-case">{text}</span>
      {children}
    </li>
  );
}

// GitHub's "Contribution settings" menu, redrawn in the city's flat look with
// GitHub's real labels, so the player recognises it on their profile.
const GRAPH = "1203012402130341202310421032140230123401";
const LEVELS = ["#2a2a33", "#3a4a17", "#5f7a1f", "#8aaa1a", "#c8e64a"];

function GitHubMenu({ accent }: { accent: string }) {
  return (
    <div className="min-h-[104px] border-[3px] border-border bg-bg-card p-2.5 normal-case" aria-hidden>
      <div className="flex items-start justify-between gap-2">
        <span className="pt-1 text-[8px] text-muted">1,234 contributions</span>
        <div className="relative">
          <span className="block border-2 px-1.5 py-1 text-[8px] whitespace-nowrap text-cream" style={{ borderColor: accent }}>
            Contribution settings ▾
          </span>
          <div className="absolute right-0 top-full z-10 mt-1 w-40 border-2 border-border-light bg-bg">
            <div className="flex items-center gap-1.5 border-b-2 px-2 py-1.5" style={{ borderColor: `${accent}55`, backgroundColor: `${accent}14` }}>
              <span className="flex h-2.5 w-2.5 items-center justify-center text-[7px] leading-none text-bg" style={{ backgroundColor: accent }}>✓</span>
              <span className="text-[8px]" style={{ color: accent }}>Private contributions</span>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1.5">
              <span className="h-2.5 w-2.5 border border-border-light" />
              <span className="text-[8px] text-muted">Activity overview</span>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-2.5 grid w-max grid-flow-col grid-rows-4 gap-[2px]">
        {GRAPH.split("").map((c, i) => (
          <span key={i} className="h-2 w-2" style={{ backgroundColor: LEVELS[Number(c)] }} />
        ))}
      </div>
    </div>
  );
}
