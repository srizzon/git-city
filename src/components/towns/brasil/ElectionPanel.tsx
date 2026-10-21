"use client";

import { useCallback, useEffect, useState } from "react";
import posthog from "posthog-js";
import { Clock, Crown } from "lucide-react";
import Panel from "@/components/league/hud/Panel";
import { Avatar, fmt } from "@/components/league/hud/shared";
import type { ElectionView } from "@/lib/towns/brasil-election-server";
import type { UF } from "@/lib/towns/brasil-map";
import { Board } from "./BrasilPanels";
import { ballot } from "@/lib/towns/brasil-election";
import { useLang } from "@/lib/i18n/LangProvider";
import type { Lang } from "@/lib/i18n/lang";

// The presidential race as Brazil's voting machine: every candidate has a
// two-digit number, you type it on the keypad (or the keyboard, or tap the
// candidate), the screen shows their face, and CONFIRMA casts it (BRANCO
// takes your vote back, CORRIGE clears what you typed); the machine says FIM.
// The machine's buttons and screen keep its Portuguese, laid out like the
// real one; the rest speaks the map's language.
//
// Anyone can type and see a candidate. Only CONFIRMA asks for more, and the
// screen says what's missing right where you'd confirm: the vote not open
// yet, signing in, a building on the map (both come back to this machine
// with the number still typed), or a GitHub account too new. Nothing in here
// ever closes it. Under it: the candidates (a tap types their number), the
// live count, and running. A board on a wide screen, the sheet on a phone.
// Times are Brasília's.

const when = (ms: number, lang: Lang) =>
  new Date(ms).toLocaleString(lang === "pt" ? "pt-BR" : "en-GB", { timeZone: "America/Sao_Paulo", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const day = (ms: number, lang: Lang) => new Date(ms).toLocaleDateString(lang === "pt" ? "pt-BR" : "en-GB", { timeZone: "America/Sao_Paulo", day: "numeric", month: "short" });

function left(to: number): string {
  const ms = Math.max(0, to - Date.now());
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return d > 0 ? `${d}d ${h}h` : `${h}h ${m}m`;
}

/** Wider than a phone: the board in the middle. */
function useWide(): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}

async function shareOrCopy(text: string, url: string): Promise<"shared" | "copied" | "closed"> {
  try {
    if (navigator.share) {
      await navigator.share({ text, url });
      return "shared";
    }
  } catch {
    return "closed";
  }
  await navigator.clipboard.writeText(`${text} ${url}`).catch(() => {});
  return "copied";
}

export default function ElectionPanel({
  slug,
  initial,
  startNumber = null,
  signedIn,
  ufOf,
  onSignIn,
  onPutOnMap,
  onVoted,
  onClose,
}: {
  slug: string;
  initial: ElectionView;
  /** Opened on a candidate (a shared link, the count, the widget): that number already typed. */
  startNumber?: number | null;
  signedIn: boolean;
  /** A resident's state (null: the island; undefined: not on the map, like a nominated famous dev). */
  ufOf: (login: string) => UF | null | undefined;
  /** Sign in and come back to this machine with this number typed (null: just open it). */
  onSignIn: (number: number | null) => void;
  /** Put your building on the map, then come back here with this number typed. */
  onPutOnMap: (number: number | null) => void;
  /** Every fresh read, so the map outside the machine knows your vote too. */
  onVoted?: (view: ElectionView) => void;
  onClose: () => void;
}) {
  const wide = useWide();
  const { lang, t } = useLang();
  const [e, setE] = useState(initial);
  const [typed, setTyped] = useState(startNumber ? ballot(startNumber) : "");
  const [fim, setFim] = useState(false);
  const [copied, setCopied] = useState<"vote" | "run" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    onVoted?.(e);
  }, [e, onVoted]);

  const refresh = useCallback(() => {
    fetch(`/api/towns/${slug}/brasil/election`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((x: ElectionView | null) => x && setE(x))
      .catch(() => {});
  }, [slug]);

  // Fresh on open (you may have just signed in or put your building on the map), then every half minute.
  useEffect(() => {
    refresh();
    const id = setInterval(() => {
      tick((n) => n + 1);
      refresh();
    }, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  const act = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`/api/towns/${slug}/brasil/election`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? t("Try again.", "Tenta de novo."));
        setE(json as ElectionView);
        posthog.capture(body.action === "vote" ? "brasil_vote_clicked" : "brasil_run_clicked", { action: body.action, blank: body.number === null });
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : t("Try again.", "Tenta de novo."));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [slug, t],
  );

  const voting = e.phase === "voting";
  const me = e.viewer;
  const picked = typed.length === 2 ? (e.candidates.find((c) => c.number === Number(typed)) ?? null) : null;
  const typedNumber = typed.length === 2 ? Number(typed) : null;
  // Your vote, with its face: shown on the screen until you type another number.
  const mine = me?.votedFor ? (e.candidates.find((c) => c.number === me.votedFor!.number) ?? null) : null;
  const showVoted = fim || (voting && !!mine && typed.length === 0);

  // Whether CONFIRMA can go through, and (for the screen) what stands in the way when it can't.
  const blocked = !voting || !signedIn || !me?.onMap || !!me?.cantVote;
  const why: { text: string; action?: { label: string; run: () => void } } | null = !voting
    ? { text: t(`Vote opens ${when(e.next.opens, lang)} (Brasília).`, `A votação abre ${when(e.next.opens, lang)} (Brasília).`) }
    : !signedIn
      ? { text: t("Sign in to confirm your vote.", "Entra pra confirmar seu voto."), action: { label: t("Sign in with GitHub", "Entrar com GitHub"), run: () => onSignIn(typedNumber) } }
      : !me?.onMap
        ? { text: t("Only devs on the map vote.", "Só devs no mapa votam."), action: { label: t("Put my building on the map", "Botar meu prédio no mapa"), run: () => onPutOnMap(typedNumber) } }
        : me.cantVote
          ? { text: me.cantVote }
          : null;

  const type = useCallback((value: string) => {
    setFim(false);
    setError(null);
    setTyped(value);
  }, []);
  const press = useCallback(
    (d: string) => {
      if (busy) return;
      setFim(false);
      setError(null);
      setTyped((t) => (t.length < 2 ? t + d : t));
    },
    [busy],
  );
  const corrige = useCallback(() => type(""), [type]);
  const confirma = useCallback(async () => {
    if (blocked || busy || !picked) return;
    if (await act({ action: "vote", number: picked.number })) {
      setTyped("");
      setFim(true);
    }
  }, [blocked, busy, picked, act]);
  const branco = useCallback(async () => {
    if (blocked || busy) return;
    if (await act({ action: "vote", number: null })) {
      setTyped("");
      setFim(true);
    }
  }, [blocked, busy, act]);

  // The keyboard types on the machine too: digits, Backspace (CORRIGE), Enter (CONFIRMA).
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable || ev.metaKey || ev.ctrlKey || ev.altKey) return;
      if (/^[0-9]$/.test(ev.key)) press(ev.key);
      else if (ev.key === "Backspace") corrige();
      else if (ev.key === "Enter") void confirma();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press, corrige, confirma]);

  const share = async (kind: "vote" | "run") => {
    const n = kind === "vote" ? me?.votedFor?.number : me?.running;
    if (!n) return;
    const url = `${location.origin}/town/${slug}?${kind}=${ballot(n)}`;
    const text = kind === "vote" ? `Votei ${ballot(n)} pra presidente do Brasil dos devs 🗳️` : `Sou candidato a presidente do Brasil dos devs. Vote ${ballot(n)} 🗳️`;
    posthog.capture(kind === "vote" ? "brasil_vote_shared" : "brasil_candidacy_shared", { number: n });
    if ((await shareOrCopy(text, url)) === "copied") {
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    }
  };

  const total = e.totalVotes;
  const ink = "#1b1d22";

  // ── The machine's screen ──
  const footer = fim ? null : typed.length < 2 ? (
    <>
      {typed.length === 1 ? "Mais um dígito." : "Digite o número do seu candidato."}
      {why && <span className="mt-1 block text-[#c4561c]">{why.text}</span>}
    </>
  ) : !picked ? (
    <>Número errado. Aperte LARANJA para CORRIGIR.</>
  ) : why ? (
    <span className="flex flex-col items-start gap-2">
      <span className="text-[#c4561c]">{why.text}</span>
      {why.action && (
        <button type="button" onClick={why.action.run} className="btn-press bg-[#1b1d22] px-3 py-1.5 text-[9px] uppercase text-lime">
          {why.action.label}
        </button>
      )}
    </span>
  ) : (
    <>
      Aperte a tecla:
      <br />
      <span className="text-[#1f7a2c]">VERDE</span> para CONFIRMAR
      <br />
      <span className="text-[#c4561c]">LARANJA</span> para CORRIGIR
    </>
  );

  const screen = (
    <div className="flex min-h-[176px] flex-1 flex-col border-[3px] border-[#9a9a94] bg-[#eef0ea] p-3 shadow-[inset_0_0_18px_rgba(0,0,0,0.08)] sm:min-h-[204px]" style={{ color: ink }}>
      {busy && typed.length === 2 && picked ? (
        <div className="m-auto flex flex-col items-center gap-3 text-center">
          <span className="text-[11px] uppercase">Gravando seu voto…</span>
          <span className="h-2 w-40 overflow-hidden border-2" style={{ borderColor: ink }}>
            <span className="block h-full w-1/2 animate-pulse bg-[#1f7a2c]" />
          </span>
        </div>
      ) : showVoted ? (
        <div className="m-auto flex flex-col items-center gap-3 text-center">
          {fim ? <span className="text-5xl leading-none tracking-widest">FIM</span> : <span className="text-[11px] uppercase">Você já votou</span>}
          {mine ? (
            <span className="flex items-center gap-3 text-left">
              <span className="h-[52px] w-[42px] shrink-0 overflow-hidden border-2 border-[#9a9a94] bg-white/50">
                {/* eslint-disable-next-line @next/next/no-img-element -- a GitHub avatar, cropped to the machine's portrait frame */}
                {mine.avatar_url && <img src={mine.avatar_url} alt="" className="h-full w-full object-cover" />}
              </span>
              <span className="flex flex-col gap-1">
                <span className="text-lg leading-none tabular-nums">{ballot(mine.number)}</span>
                <span className="text-[10px] normal-case">@{mine.login}</span>
              </span>
            </span>
          ) : (
            <span className="text-[9px] normal-case">{t("Voto em branco · no vote", "Voto em branco")}</span>
          )}
          {mine && (
            <button type="button" onClick={() => share("vote")} className="btn-press bg-[#1b1d22] px-4 py-2 text-[10px] uppercase text-lime">
              {copied === "vote" ? t("Link copied", "Link copiado") : t("Share my vote", "Compartilhar meu voto")}
            </button>
          )}
          {!fim && <span className="text-[8px] normal-case">Digite outro número para trocar.</span>}
        </div>
      ) : (
        <>
          <div className="flex gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-2 normal-case">
              <span className="text-[8px] uppercase">Seu voto para</span>
              <span className="text-[13px] uppercase">Presidente</span>
              <span className="flex items-center gap-2 text-[9px]">
                Número:
                {[0, 1].map((k) => (
                  <span key={k} className={`flex h-9 w-7 items-center justify-center border-2 bg-white/60 text-lg tabular-nums ${typed.length === k ? "animate-pulse" : ""}`} style={{ borderColor: ink }}>
                    {typed[k] ?? ""}
                  </span>
                ))}
              </span>
              {picked && (
                <span className="text-[9px]">
                  Nome: <span className="text-[10px]">@{picked.login}</span>
                  <br />
                  {ufOf(picked.login) !== undefined && <>Estado: {ufOf(picked.login) ?? "Ilha"}</>}
                </span>
              )}
              {typed.length === 2 && !picked && <span className="text-[11px] uppercase">Número errado</span>}
            </div>
            <div className="h-[76px] w-[62px] shrink-0 overflow-hidden border-2 border-[#9a9a94] bg-white/50">
              {/* eslint-disable-next-line @next/next/no-img-element -- a GitHub avatar, cropped to the machine's portrait frame */}
              {picked?.avatar_url && <img src={picked.avatar_url} alt="" className="h-full w-full object-cover" />}
            </div>
          </div>
          <div className="mt-auto border-t-2 pt-1.5 text-[8px] normal-case leading-relaxed" style={{ borderColor: ink }}>
            {footer}
          </div>
        </>
      )}
    </div>
  );

  const key = (label: string) => (
    <button
      key={label}
      type="button"
      disabled={busy}
      onClick={() => press(label)}
      aria-label={t(`Digit ${label}`, `Dígito ${label}`)}
      className="btn-press flex h-10 items-center justify-center rounded-[3px] bg-[#25272c] text-base tabular-nums text-white shadow-[0_3px_0_#0b0c0e] disabled:opacity-50"
    >
      {label}
    </button>
  );

  const machine = (
    <div className="select-none border-2 border-[#8d8d87] bg-[#d9dad4] p-3 shadow-[0_6px_0_#6f706b]">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex min-w-0 flex-1 flex-col">{screen}</div>
        <div className="flex flex-col gap-2 sm:w-[200px]">
          {/* The machine's plate: the town's, not a real court's. */}
          <div className="flex items-center justify-center border-2 border-[#9a9a94] bg-[#eef0ea] py-1.5 text-[9px]" style={{ color: ink }}>
            Git City · Eleitoral
          </div>
          <div className="flex flex-col gap-1.5 bg-[#3a3c42] p-2">
            <div className="grid grid-cols-3 gap-1.5">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map(key)}
              <span />
              {key("0")}
              <span />
            </div>
            <div className="mt-1 grid grid-cols-[1fr_1fr_1.25fr] gap-1.5">
              <button type="button" disabled={!!why || busy} onClick={branco} className="btn-press h-9 rounded-[3px] bg-white text-[8px] text-[#1b1d22] shadow-[0_3px_0_#9a9a94] disabled:opacity-50">
                Branco
              </button>
              <button type="button" disabled={busy} onClick={corrige} className="btn-press h-9 rounded-[3px] bg-[#e4572e] text-[8px] text-[#1b1d22] shadow-[0_3px_0_#8f3219] disabled:opacity-50">
                Corrige
              </button>
              <button type="button" disabled={!!why || busy || !picked} onClick={confirma} className="btn-press h-10 rounded-[3px] bg-[#3fae49] text-[8px] text-[#0d2a10] shadow-[0_3px_0_#21672a] disabled:opacity-50">
                Confirma
              </button>
            </div>
          </div>
        </div>
      </div>
      {error && <p className="mt-2 text-[9px] normal-case text-red-700">{error}</p>}
    </div>
  );

  // ── The candidates: a tap types their number ──
  const roster = (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between px-1 text-[9px] text-muted">
        <span>{t("Candidates · tap one to type their number", "Candidatos · toca num pra digitar o número")}</span>
        <a href={`/town/${slug}/apuracao`} className="text-cream underline hover:text-lime">
          {voting ? t(`Live count · ${fmt(total)} votes`, `Apuração · ${fmt(total)} votos`) : t("Live count", "Apuração")}
        </a>
      </div>
      {e.candidates.length === 0 ? (
        <p className="border-2 border-border px-3 py-3 text-[10px] normal-case text-muted">{t("Nobody is running yet. Be the first.", "Ninguém se candidatou ainda. Seja o primeiro.")}</p>
      ) : (
        <ol className="flex flex-col gap-1">
          {e.candidates.map((c) => {
            const pct = total ? Math.round((c.votes / total) * 100) : 0;
            const mine = me?.votedFor?.number === c.number;
            const onScreen = picked?.number === c.number;
            return (
              <li key={c.number}>
                <button
                  type="button"
                  onClick={() => type(ballot(c.number))}
                  aria-label={t(`Type ${ballot(c.number)}, @${c.login}`, `Digitar ${ballot(c.number)}, @${c.login}`)}
                  className={`flex w-full items-center gap-2.5 border-2 px-2 py-1.5 text-left ${onScreen ? "border-cream" : mine ? "border-lime" : "border-border hover:border-lime/50"}`}
                >
                  <span className="flex h-8 w-9 shrink-0 items-center justify-center bg-[#eef0ea] text-sm tabular-nums" style={{ color: ink }}>
                    {ballot(c.number)}
                  </span>
                  <Avatar src={c.avatar_url} size={28} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[10px] normal-case text-cream">@{c.login}</span>
                    <span className="block text-[8px] text-muted">
                      {[ufOf(c.login) === undefined ? null : (ufOf(c.login) ?? t("Island", "Ilha")), c.addedBy === "admin" ? t("Nominated", "Indicado") : null].filter(Boolean).join(" · ")}
                      {mine && <span className="text-lime"> · {t("your vote", "seu voto")}</span>}
                    </span>
                  </span>
                  {voting && (
                    <span className="w-10 text-right">
                      <span className="block text-[11px] tabular-nums text-cream">{pct}%</span>
                      <span className="block text-[8px] tabular-nums text-dim">{fmt(c.votes)}</span>
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {/* Running */}
      {me?.running ? (
        <div className="flex flex-col gap-1.5 border-2 border-lime p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[9px] text-cream">
              {t("You're running", "Você é candidato")} · <span className="text-lime">#{ballot(me.running)}</span>
            </span>
            <button type="button" disabled={busy} onClick={() => act({ action: "withdraw" })} className="text-[9px] text-muted underline hover:text-cream disabled:opacity-40">
              {t("Stop running", "Desistir")}
            </button>
          </div>
          <button type="button" onClick={() => share("run")} className="btn-press bg-lime py-2 text-[10px] text-bg">
            {copied === "run" ? t("Link copied", "Link copiado") : t(`Share "vote ${ballot(me.running)}"`, `Compartilhar "vote ${ballot(me.running)}"`)}
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => (!signedIn ? onSignIn(null) : !me?.onMap ? onPutOnMap(null) : act({ action: "run" }))}
          className="btn-press border-2 border-border py-2 text-[10px] text-cream hover:border-lime/60 disabled:opacity-40"
        >
          {!signedIn ? t("Sign in to run for president", "Entra pra se candidatar") : !me?.onMap ? t("Put my building on the map to run", "Bota teu prédio no mapa pra se candidatar") : t("Run for president", "Me candidatar a presidente")}
        </button>
      )}
    </div>
  );

  // ── Who's in office, and when this vote runs ──
  const header = (
    <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[9px] text-muted">
      <span className="flex items-center gap-1.5">
        <Crown size={12} className={e.president ? "text-lime" : ""} aria-hidden />
        {e.president ? (
          <>
            {t("President", "Presidente")} <span className="normal-case text-cream">@{e.president.login}</span>
            {e.current && <span>· {t("until", "até")} {day(e.current.end, lang)}</span>}
          </>
        ) : (
          t("No president yet", "Sem presidente ainda")
        )}
      </span>
      <span className="flex items-center gap-1.5">
        <Clock size={12} aria-hidden />
        {voting ? (
          <>
            {t("Vote ends in", "Votação fecha em")} <span className="tabular-nums text-cream">{left(e.next.closes)}</span>
          </>
        ) : (
          <>
            {t("Vote opens in", "Votação abre em")} <span className="tabular-nums text-cream">{left(e.next.opens)}</span>
          </>
        )}
      </span>
    </div>
  );

  const body = (
    <div className="flex flex-col gap-3">
      {header}
      {machine}
      {roster}
    </div>
  );

  return wide ? (
    <Board title={t("President", "Presidente")} onClose={onClose}>
      {body}
    </Board>
  ) : (
    <Panel title={t("President", "Presidente")} onClose={onClose} above full>
      {body}
    </Panel>
  );
}
