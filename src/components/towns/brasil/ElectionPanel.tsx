"use client";

import { useCallback, useEffect, useState } from "react";
import posthog from "posthog-js";
import { Clock, Crown } from "lucide-react";
import Panel from "@/components/league/hud/Panel";
import { Avatar, fmt } from "@/components/league/hud/shared";
import type { ElectionView } from "@/lib/towns/brasil-election-server";
import type { UF } from "@/lib/towns/brasil-map";
import { Board } from "./BrasilPanels";

// The presidential race as Brazil's voting machine: every candidate has a
// two-digit number, you type it on the keypad (or the keyboard), the screen
// shows their face, and CONFIRMA casts it (BRANCO takes your vote back,
// CORRIGE clears what you typed); the machine says FIM. The machine's three
// buttons and FIM keep its Portuguese: that's what everyone in Brazil
// recognizes, and so does its screen ("Seu voto para", "Número errado",
// "Aperte a tecla"), laid out like the real one. Under it, the candidates with their numbers and the live
// count, and the way to run. A board on a wide screen, the sheet on a phone.
// Times are Brasília's.

const when = (ms: number) =>
  new Date(ms).toLocaleString("en-GB", { timeZone: "America/Sao_Paulo", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const day = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { timeZone: "America/Sao_Paulo", day: "numeric", month: "short" });

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

export default function ElectionPanel({
  slug,
  initial,
  startNumber = null,
  signedIn,
  ufOf,
  onSignIn,
  onPickDev,
  onPutOnMap,
  onClose,
}: {
  slug: string;
  initial: ElectionView;
  /** Opened from a shared vote: that number already typed. */
  startNumber?: number | null;
  signedIn: boolean;
  /** A resident's state, for the candidate's screen and card. */
  ufOf: (login: string) => UF | null;
  onSignIn: () => void;
  onPickDev: (login: string) => void;
  onPutOnMap: () => void;
  onClose: () => void;
}) {
  const wide = useWide();
  const [e, setE] = useState(initial);
  const [typed, setTyped] = useState(startNumber ? String(startNumber) : "");
  const [shared, setShared] = useState(false);
  const [sharedRun, setSharedRun] = useState(false);
  const [fim, setFim] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, tick] = useState(0);

  // The count moves while the vote is open, and so does the clock: read it again every half minute.
  useEffect(() => {
    const id = setInterval(() => {
      tick((n) => n + 1);
      if (e.phase !== "voting") return;
      fetch(`/api/towns/${slug}/brasil/election`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((x: ElectionView | null) => x && setE(x))
        .catch(() => {});
    }, 30_000);
    return () => clearInterval(id);
  }, [e.phase, slug]);

  const act = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`/api/towns/${slug}/brasil/election`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Try again.");
        setE(json as ElectionView);
        posthog.capture(body.action === "vote" ? "brasil_vote_clicked" : "brasil_run_clicked", { action: body.action, blank: body.number === null });
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Try again.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [slug],
  );

  const voting = e.phase === "voting";
  const me = e.viewer;
  // Why the keypad is off, if it is.
  const lock = !voting ? "closed" : !signedIn ? "signin" : !me?.onMap ? "map" : me.cantVote ? "cant" : null;
  const picked = typed.length === 2 ? (e.candidates.find((c) => c.number === Number(typed)) ?? null) : null;

  const press = useCallback(
    (d: string) => {
      if (lock || busy) return;
      setFim(false);
      setError(null);
      setTyped((t) => (t.length < 2 ? t + d : t));
    },
    [lock, busy],
  );
  const corrige = useCallback(() => {
    setTyped("");
    setFim(false);
    setError(null);
  }, []);
  const confirma = useCallback(async () => {
    if (lock || busy || !picked) return;
    if (await act({ action: "vote", number: picked.number })) {
      setTyped("");
      setFim(true);
    }
  }, [lock, busy, picked, act]);
  const branco = useCallback(async () => {
    if (lock || busy) return;
    if (await act({ action: "vote", number: null })) {
      setTyped("");
      setFim(true);
    }
  }, [lock, busy, act]);

  // A vote shared: the link opens this machine with the number typed, and its preview is the machine's screen.
  const share = useCallback(async () => {
    const v = e.viewer?.votedFor;
    if (!v) return;
    const url = `${location.origin}/town/${slug}?vote=${v.number}`;
    const text = `Votei ${v.number} pra presidente do Brasil dos devs 🗳️`;
    posthog.capture("brasil_vote_shared", { number: v.number });
    try {
      if (navigator.share) {
        await navigator.share({ text, url });
        return;
      }
    } catch {
      // closed the share sheet: nothing to do
      return;
    }
    await navigator.clipboard.writeText(`${text} ${url}`).catch(() => {});
    setShared(true);
    setTimeout(() => setShared(false), 1500);
  }, [e.viewer, slug]);

  // A candidacy shared: the same machine, opened on their number, under a "vote 34" preview with their face.
  const shareRun = useCallback(async () => {
    const n = e.viewer?.running;
    if (!n) return;
    const url = `${location.origin}/town/${slug}?run=${n}`;
    const text = `Sou candidato a presidente do Brasil dos devs. Vote ${n} 🗳️`;
    posthog.capture("brasil_candidacy_shared", { number: n });
    try {
      if (navigator.share) {
        await navigator.share({ text, url });
        return;
      }
    } catch {
      return;
    }
    await navigator.clipboard.writeText(`${text} ${url}`).catch(() => {});
    setSharedRun(true);
    setTimeout(() => setSharedRun(false), 1500);
  }, [e.viewer, slug]);

  // The keyboard types on the machine too: digits, Backspace (CORRIGE), Enter (CONFIRMA).
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable || ev.metaKey || ev.ctrlKey || ev.altKey) return;
      if (/^[0-9]$/.test(ev.key)) press(ev.key);
      else if (ev.key === "Backspace") corrige();
      else if (ev.key === "Enter" && picked) confirma();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press, corrige, confirma, picked]);

  const total = e.totalVotes;

  // ── The machine: Brazil's voting machine, its screen in its own Portuguese ──
  const screen = (
    <div className="flex min-h-[168px] flex-1 flex-col border-[3px] border-[#9a9a94] bg-[#eef0ea] p-3 text-[#1b1d22] shadow-[inset_0_0_18px_rgba(0,0,0,0.08)] sm:min-h-[200px]">
      {lock ? (
        <div className="m-auto flex flex-col items-center gap-2.5 text-center normal-case">
          {lock === "closed" ? (
            <>
              <span className="text-[9px] uppercase">Votação abre</span>
              <span className="text-[13px]">{when(e.next.opens)}</span>
              <span className="text-[8px]">Vote opens · Brasília time</span>
            </>
          ) : lock === "signin" ? (
            <>
              <span className="text-[10px] uppercase">Sign in to vote</span>
              <button type="button" onClick={onSignIn} className="btn-press bg-[#1b1d22] px-3 py-2 text-[10px] uppercase text-lime">
                Sign in with GitHub
              </button>
            </>
          ) : lock === "map" ? (
            <>
              <span className="text-[10px] uppercase">Only devs on the map vote</span>
              <button type="button" onClick={onPutOnMap} className="btn-press bg-[#1b1d22] px-3 py-2 text-[10px] uppercase text-lime">
                Put my building on the map
              </button>
            </>
          ) : (
            <span className="max-w-[240px] text-[10px]">{me?.cantVote}</span>
          )}
        </div>
      ) : fim ? (
        <div className="m-auto flex flex-col items-center gap-3 text-center">
          <span className="text-5xl leading-none tracking-widest">FIM</span>
          <span className="text-[9px] normal-case">{me?.votedFor ? `Your vote: ${me.votedFor.number} · @${me.votedFor.login}` : "Voto em branco · no vote"}</span>
          {me?.votedFor && (
            <button type="button" onClick={share} className="btn-press bg-[#1b1d22] px-4 py-2 text-[10px] uppercase text-lime">
              {shared ? "Link copied" : "Share my vote"}
            </button>
          )}
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
                  <span key={k} className={`flex h-9 w-7 items-center justify-center border-2 border-[#1b1d22] bg-white/60 text-lg tabular-nums ${typed.length === k ? "animate-pulse" : ""}`}>
                    {typed[k] ?? ""}
                  </span>
                ))}
              </span>
              {typed.length === 2 && (
                <span className="text-[9px]">
                  {picked ? (
                    <>
                      Nome: <span className="text-[10px]">@{picked.login}</span>
                      <br />
                      Estado: {ufOf(picked.login) ?? "Ilha"}
                    </>
                  ) : (
                    <span className="text-[11px] uppercase">Número errado</span>
                  )}
                </span>
              )}
            </div>
            <div className="h-[76px] w-[62px] shrink-0 overflow-hidden border-2 border-[#9a9a94] bg-white/50">
              {/* eslint-disable-next-line @next/next/no-img-element -- a GitHub avatar, cropped to the machine's portrait frame */}
              {picked?.avatar_url && <img src={picked.avatar_url} alt="" className="h-full w-full object-cover" />}
            </div>
          </div>
          <div className="mt-auto border-t-2 border-[#1b1d22] pt-1.5 text-[8px] normal-case leading-relaxed">
            {typed.length < 2 ? (
              me?.votedFor && typed.length === 0 ? (
                <>Seu voto: {me.votedFor.number} · @{me.votedFor.login}. Digite outro número para trocar.</>
              ) : (
                <>Digite o número do seu candidato.</>
              )
            ) : (
              <>
                Aperte a tecla:
                <br />
                <span className="text-[#1f7a2c]">VERDE</span> para CONFIRMAR
                <br />
                <span className="text-[#c4561c]">LARANJA</span> para CORRIGIR
              </>
            )}
          </div>
        </>
      )}
    </div>
  );

  const key = (label: string) => (
    <button
      key={label}
      type="button"
      disabled={!!lock || busy}
      onClick={() => press(label)}
      aria-label={`Digit ${label}`}
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
          <div className="flex items-center justify-center border-2 border-[#9a9a94] bg-[#eef0ea] py-1.5 text-[9px] text-[#1b1d22]">Git City · Eleitoral</div>
          <div className="flex flex-col gap-1.5 bg-[#3a3c42] p-2">
            <div className="grid grid-cols-3 gap-1.5">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map(key)}
              <span />
              {key("0")}
              <span />
            </div>
            <div className="mt-1 grid grid-cols-[1fr_1fr_1.25fr] gap-1.5">
              <button type="button" disabled={!!lock || busy} onClick={branco} className="btn-press h-9 rounded-[3px] bg-white text-[8px] text-[#1b1d22] shadow-[0_3px_0_#9a9a94] disabled:opacity-50">
                Branco
              </button>
              <button type="button" disabled={!!lock || busy} onClick={corrige} className="btn-press h-9 rounded-[3px] bg-[#e4572e] text-[8px] text-[#1b1d22] shadow-[0_3px_0_#8f3219] disabled:opacity-50">
                Corrige
              </button>
              <button type="button" disabled={!!lock || busy || !picked} onClick={confirma} className="btn-press h-10 rounded-[3px] bg-[#3fae49] text-[8px] text-[#0d2a10] shadow-[0_3px_0_#21672a] disabled:opacity-50">
                Confirma
              </button>
            </div>
          </div>
        </div>
      </div>
      {error && <p className="mt-2 text-[9px] normal-case text-red-700">{error}</p>}
    </div>
  );

  // ── The candidates ──
  const roster = (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between px-1 text-[9px] text-muted">
        <span>Candidates</span>
        <a href={`/town/${slug}/apuracao`} className="text-cream underline hover:text-lime">
          {voting ? `Live count · ${fmt(total)} votes` : "Live count"}
        </a>
      </div>
      {e.candidates.length === 0 ? (
        <p className="border-2 border-border px-3 py-3 text-[10px] normal-case text-muted">Nobody is running yet. Be the first.</p>
      ) : (
        <ol className="flex flex-col gap-1">
          {e.candidates.map((c) => {
            const pct = total ? Math.round((c.votes / total) * 100) : 0;
            const mine = me?.votedFor?.number === c.number;
            return (
              <li key={c.number}>
                <button
                  type="button"
                  onClick={() => {
                    if (lock) onPickDev(c.login);
                    else {
                      setTyped(String(c.number));
                      setFim(false);
                    }
                  }}
                  className={`flex w-full items-center gap-2.5 border-2 px-2 py-1.5 text-left ${mine ? "border-lime" : "border-border hover:border-lime/50"}`}
                >
                  <span className="flex h-8 w-9 shrink-0 items-center justify-center bg-[#e8e4d8] text-sm tabular-nums text-[#16161a]">{c.number}</span>
                  <Avatar src={c.avatar_url} size={28} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[10px] normal-case text-cream">@{c.login}</span>
                    <span className="block text-[8px] text-muted">{ufOf(c.login) ?? "Island"}</span>
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
      {signedIn && me?.onMap && me.running && (
        <div className="flex items-center justify-between gap-2 border-2 border-lime px-3 py-2">
          <span className="text-[9px] text-cream">
            You&apos;re running · <span className="text-lime">#{me.running}</span>
          </span>
          <button type="button" disabled={busy} onClick={() => act({ action: "withdraw" })} className="text-[9px] text-muted underline hover:text-cream disabled:opacity-40">
            Stop
          </button>
        </div>
      )}
      {signedIn && me?.onMap && !me.running && (
        <button type="button" disabled={busy} onClick={() => act({ action: "run" })} className="btn-press border-2 border-border py-2 text-[10px] text-cream hover:border-lime/60 disabled:opacity-40">
          Run for president
        </button>
      )}
      {me?.running && (
        <button type="button" onClick={shareRun} className="btn-press border-2 border-lime bg-lime py-2 text-[10px] text-bg">
          {sharedRun ? "Link copied" : `Share "vote ${me.running}"`}
        </button>
      )}
    </div>
  );

  // ── Who's in office, and when this vote runs ──
  const header = (
    <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[9px] text-muted">
      {e.president ? (
        <button type="button" onClick={() => onPickDev(e.president!.login)} className="flex items-center gap-1.5 hover:text-cream">
          <Crown size={12} className="text-lime" aria-hidden /> President <span className="normal-case text-cream">@{e.president.login}</span>
          {e.current && <span>· until {day(e.current.end)}</span>}
        </button>
      ) : (
        <span className="flex items-center gap-1.5">
          <Crown size={12} aria-hidden /> No president yet
        </span>
      )}
      <span className="flex items-center gap-1.5">
        <Clock size={12} aria-hidden />
        {voting ? (
          <>
            Vote ends in <span className="tabular-nums text-cream">{left(e.next.closes)}</span>
          </>
        ) : (
          <>
            Vote in <span className="tabular-nums text-cream">{left(e.next.opens)}</span>
          </>
        )}
      </span>
    </div>
  );

  if (wide) {
    return (
      <Board title="President" onClose={onClose}>
        <div className="flex flex-col gap-3">
          {header}
          {machine}
          {roster}
        </div>
      </Board>
    );
  }
  return (
    <Panel title="President" onClose={onClose}>
      <div className="flex flex-col gap-3">
        {header}
        {machine}
        {roster}
      </div>
    </Panel>
  );
}
