"use client";

import { useEffect, useRef, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase";
import { signInWithGitHub } from "@/lib/sign-in";
import { medalFor, medalScores, type LiveSpot } from "@/lib/drift/spots/types";
import { DRIFT_PT, MEDAL_COLORS, fmt } from "./DriftHud";
import { useLang } from "@/lib/i18n/LangProvider";
import type { BoardRowLite } from "./DriftTitle";
import { Backdrop, Band, Chip } from "@/components/games/ui";

// Past the line, in Trackmania's order: FINISH on the scene, then the frame
// blurs and a timing tower builds on the right, like motorsport TV: the run's
// score counting up on the cream band with its medal, then the drivers around
// you with your row in lime (the ones you just passed below you), then the
// rest. The next driver up is one key away as a ghost. Again is R or Enter.

export interface PostResult {
  score: number;
  best: number;
  improved: boolean;
  rankWorld: number;
  rankCountry: number;
  totalWorld: number;
  totalCountry: number;
  country: string | null;
  passed: string[];
  next: { login: string; score: number; rank: number } | null;
  around: BoardRowLite[];
}

export type PostState =
  | { status: "posting" }
  | { status: "posted"; result: PostResult }
  | { status: "failed" }
  | { status: "signed-out" };

export interface DriftResultsProps {
  spot: LiveSpot;
  score: number;
  before: number | null;
  stats: { banks: number; lost: number; clips: number; bestChain: number };
  post: PostState;
  you: string | null;
  /** The world board as the page loaded it: where an unposted run would land. */
  board: BoardRowLite[];
  onRetry: () => void;
  onRetryPost: () => void;
  onRaceGhost: (login: string) => void;
  onSpots: () => void;
  /** A town's track: its own words for again and the way out, and the page sign-in and challenges come back to. */
  town?: { again: string; exit: string; path: string };
  /** The left of the screen, under the blur once the rows are in (a town's track: its medals and board). */
  aside?: React.ReactNode;
}

const COUNTRY = new Intl.DisplayNames(["en"], { type: "region" });
const COUNTRY_PT = new Intl.DisplayNames(["pt-BR"], { type: "region" });
const T = { hero: "clamp(40px, min(11vh, 14vw), 128px)", big: "clamp(16px, min(3vh, 4.4vw), 34px)", body: "clamp(11px, min(1.8vh, 3.2vw), 19px)", small: "clamp(10px, min(1.4vh, 2.6vw), 15px)" };

/** Rows around a score that isn't on the board yet: two above, you, two below. */
export function projected(board: BoardRowLite[], score: number, you: string): BoardRowLite[] {
  const others = board.filter((r) => r.login.toLowerCase() !== you.toLowerCase());
  const at = others.filter((r) => r.score > score).length;
  const rows: BoardRowLite[] = others.slice(Math.max(0, at - 2), at).map((r, i, a) => ({ ...r, rank: at - a.length + i + 1 }));
  rows.push({ rank: at + 1, login: you, score });
  others.slice(at, at + 2).forEach((r, i) => rows.push({ ...r, rank: at + 2 + i }));
  return rows;
}

export default function DriftResults(p: DriftResultsProps) {
  const { lang, t } = useLang();
  const medalName = (m: string) => (lang === "pt" ? (DRIFT_PT[m] ?? m) : m);
  const [beat, setBeat] = useState(0);
  const [shown, setShown] = useState(0);
  const [copied, setCopied] = useState(false);
  const better = p.before === null || p.score > p.before;
  const medal = medalFor(p.spot, p.score);
  const nextMedal = [...medalScores(p.spot)].reverse().find(([, at]) => at > p.score) ?? null;
  const r = p.post.status === "posted" ? p.post.result : null;
  const me = p.you ?? "you";
  const rows = r ? r.around : projected(p.board, p.score, me);
  const passed = new Set((r?.passed ?? []).map((l) => l.toLowerCase()));

  // 0 FINISH on the scene · 1 blur, tower, count-up · 2 medal and verdict · 3 the rows and what's next.
  useEffect(() => {
    const ts = [1100, 2300, 2900].map((ms, i) => setTimeout(() => setBeat(i + 1), ms));
    return () => ts.forEach(clearTimeout);
  }, []);
  const showing = beat >= 1;
  useEffect(() => {
    if (!showing) return;
    const start = performance.now();
    let raf = 0;
    const tick = () => {
      const k = Math.min(1, (performance.now() - start) / 1100);
      setShown(Math.round(p.score * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [showing, p.score]);

  const cb = useRef({ p, challenge: () => {} });
  const home = p.town?.path ?? `/drift/${p.spot.id}`;
  const challenge = () => {
    if (!p.you) return;
    const url = p.town ? `${window.location.origin}${home}` : `${window.location.origin}${home}?vs=${encodeURIComponent(p.you)}`;
    navigator.clipboard?.writeText(url).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  };
  useEffect(() => {
    cb.current = { p, challenge };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const { p: q, challenge: c } = cb.current;
      const res = q.post.status === "posted" ? q.post.result : null;
      if (e.code === "KeyR" || e.code === "Enter" || e.code === "NumpadEnter") {
        e.preventDefault();
        q.onRetry();
      } else if (e.code === "KeyG" && res?.next) q.onRaceGhost(res.next.login);
      else if (e.code === "KeyC") c();
      else if (e.key === "Escape") q.onSpots();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const signIn = () => void signInWithGitHub(createBrowserSupabase(), `${window.location.origin}/auth/callback?next=${home}`);
  const act = "drift-band flex items-center gap-3 shadow-[0_6px_0_rgba(0,0,0,0.35)]";

  return (
    <div className="pointer-events-none fixed inset-0 z-40 font-pixel uppercase">
      {beat === 0 && (
        <div className="absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2">
          <span className="block animate-[drift-pop_0.3s_ease-out_both] bg-lime px-8 pb-4 pt-5 leading-none tracking-[0.12em] text-bg shadow-[0_10px_0_rgba(0,0,0,0.35)]" style={{ fontSize: T.hero }}>
            {t("Finish", "Chegada")}
          </span>
        </div>
      )}

      {showing && (
        <>
          <Backdrop side={p.aside ? undefined : "right"} />
          {beat >= 3 && p.aside && <div className="absolute left-[6vw] top-[10vh] hidden w-[min(440px,34vw)] flex-col md:flex">{p.aside}</div>}
          <div className="absolute left-4 right-4 top-[5vh] flex flex-col items-stretch md:left-auto md:right-[6vw] md:top-[10vh] md:w-[min(620px,46vw)]">
            <Band className="justify-between px-5 py-2.5" style={{ fontSize: T.small }}>
              <span className="text-lime">{p.spot.name} · finish</span>
              {beat >= 2 && medal && (
                <span className="animate-[drift-pop_0.3s_ease-out_both]" style={{ color: MEDAL_COLORS[medal] }}>
                  {t(`${medal} medal`, `medalha de ${medalName(medal)}`)}
                </span>
              )}
            </Band>
            <Band tone="cream" delay={60} tab={beat >= 2 && medal ? MEDAL_COLORS[medal] : undefined} className="px-6 pb-4 pt-5">
              <span className="leading-none tabular-nums" style={{ fontSize: T.hero }}>
                {fmt(shown)}
              </span>
            </Band>
            {beat >= 2 && (
              <Band
                tone={better && p.before !== null ? "lime" : "dark"}
                className="justify-between gap-4 whitespace-nowrap px-5 py-2.5 tabular-nums"
                style={{ fontSize: T.body }}
              >
                {better && p.before !== null && (
                  <>
                    <span>{t("New best", "Novo recorde")}</span>
                    <span>+{fmt(p.score - p.before)}</span>
                  </>
                )}
                {!better && p.before !== null && (
                  <>
                    <span className="text-muted">{t("Your best", "Seu recorde")} {fmt(p.before)}</span>
                    <span className="text-[#ff5a52]">−{fmt(p.before - p.score)}</span>
                  </>
                )}
                {p.before === null && <span>{t("First run", "Primeira volta")}</span>}
              </Band>
            )}

            {beat >= 3 && (
              <>
                <div className="mt-5 flex flex-col">
                  {rows.map((row, i) => {
                    const mine = row.login.toLowerCase() === me.toLowerCase();
                    return (
                      <Band
                        key={`${row.rank}-${row.login}`}
                        tone={mine ? "lime" : "dark"}
                        delay={i * 70}
                        className={`justify-between gap-4 px-5 tabular-nums ${mine ? "py-3" : "py-2"}`}
                        style={{ fontSize: mine ? T.body : T.small }}
                      >
                        <span className="flex gap-5">
                          <span className={mine ? "" : "text-muted"}>{row.rank}</span>
                          <span className="normal-case">{mine && !p.you ? "You" : `@${row.login}`}</span>
                          {passed.has(row.login.toLowerCase()) && <span className="text-lime">{t("passed", "passou")}</span>}
                        </span>
                        <span>{fmt(row.score)}</span>
                      </Band>
                    );
                  })}
                </div>
                <Band delay={420} className="mt-5 flex-wrap gap-x-5 gap-y-1 px-5 py-2.5 text-muted" style={{ fontSize: T.small }}>
                  {r?.country && (
                    <span>
                      {(lang === "pt" ? COUNTRY_PT : COUNTRY).of(r.country) ?? r.country} <span className="text-cream">#{r.rankCountry}</span>
                    </span>
                  )}
                  {r && (
                    <span>
                      {t("World", "Mundo")} <span className="text-cream">#{r.rankWorld}</span> {t("of", "de")} {fmt(r.totalWorld)}
                    </span>
                  )}
                  <span>
                    <span className="text-cream">{p.stats.banks}</span> {t("banked", "garantidos")}
                  </span>
                  <span>
                    <span className={p.stats.lost ? "text-[#ff5a52]" : "text-cream"}>{p.stats.lost}</span> {t("lost", "perdidos")}
                  </span>
                  <span>
                    <span className="text-cream">{p.stats.clips}</span> {t("clips", "clips")}
                  </span>
                  <span>
                    {t("Best chain", "Melhor sequência")} <span className="text-cream">{fmt(p.stats.bestChain)}</span>
                  </span>
                </Band>
                {!r?.next && nextMedal && (
                  <Band delay={480} className="gap-3 px-5 py-2.5" style={{ fontSize: T.small }}>
                    <span className="text-muted">{t("Next", "Próxima")}</span>
                    <span style={{ color: MEDAL_COLORS[nextMedal[0]] }}>{medalName(nextMedal[0])}</span>
                    <span className="tabular-nums">{fmt(nextMedal[1])}</span>
                  </Band>
                )}
              </>
            )}
          </div>

          {/* What's next */}
          {beat >= 3 && (
            <div className="pointer-events-auto absolute bottom-[4vh] left-4 right-4 grid grid-cols-2 items-stretch md:bottom-[6vh] md:left-auto md:right-[6vw] md:flex md:flex-wrap md:justify-end" style={{ fontSize: T.body }}>
              <button type="button" onClick={p.onSpots} className={`${act} bg-[#141417] px-4 text-cream hover:text-lime`} style={{ animationDelay: "560ms" }}>
                <Chip>Esc</Chip> {p.town?.exit ?? t("Spots", "Spots")}
              </button>
              {p.post.status === "signed-out" && (
                <button type="button" onClick={signIn} className={`${act} bg-[#141417] px-4 text-lime`} style={{ animationDelay: "520ms" }}>
                  {t("Sign in to post", "Entre pra postar")}
                </button>
              )}
              {p.post.status === "failed" && (
                <button type="button" onClick={p.onRetryPost} className={`${act} bg-[#ff9a3c] px-4 text-bg`} style={{ animationDelay: "520ms" }}>
                  {t("Not posted · try again", "Não postou · tenta de novo")}
                </button>
              )}
              {p.post.status === "posting" && (
                <span className={`${act} bg-[#141417] px-4 text-muted`} style={{ animationDelay: "520ms" }}>
                  {t("Posting…", "Postando…")}
                </span>
              )}
              {p.you && p.post.status === "posted" && (
                <button type="button" onClick={challenge} className={`${act} bg-[#141417] px-4 text-cream hover:text-lime`} style={{ animationDelay: "500ms" }}>
                  <Chip>C</Chip> {copied ? t("Link copied", "Link copiado") : t("Challenge", "Desafiar")}
                </button>
              )}
              {r?.next && (
                <button type="button" onClick={() => p.onRaceGhost(r.next!.login)} className={`${act} bg-[#141417] px-4 normal-case text-cream hover:text-lime`} style={{ animationDelay: "460ms" }}>
                  <Chip>G</Chip> {t("Race", "Correr contra")} @{r.next.login}
                </button>
              )}
              <button type="button" onClick={p.onRetry} autoFocus className={`${act} col-span-2 justify-center bg-cream px-7 py-4 text-bg outline-none hover:bg-lime focus-visible:bg-lime`} style={{ fontSize: T.big, animationDelay: "420ms" }}>
                <Chip tone="dark">R</Chip> {p.town?.again ?? t("Again", "De novo")}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
