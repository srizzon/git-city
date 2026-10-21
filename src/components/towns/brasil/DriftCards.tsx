"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createBrowserSupabase } from "@/lib/supabase";
import { signInWithGitHub } from "@/lib/sign-in";
import { MEDAL_COLORS, fmt } from "@/components/drift/DriftHud";
import { projected, type PostState } from "@/components/drift/DriftResults";
import type { BoardRowLite } from "@/components/drift/DriftTitle";
import { medalFor, type LiveSpot, type Medal } from "@/lib/drift/spots/types";
import { useT } from "@/lib/i18n/LangProvider";

const MEDAL_PT: Record<Medal, string> = { author: "autor", gold: "ouro", silver: "prata", bronze: "bronze" };

// The drift track's two screens in the Brasil town, in the map's own HUD (one
// boxed card at the bottom, the scene clear above it): before the run, the
// track, the top three and your best; after it, your score, where it puts you
// and the same two ways on. Enter (or R after a run) drives, Esc goes back to
// the city. The run's numbers live in the drift HUD while you drive.

const EDGE = "border-[3px] border-border bg-bg/95";

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-3 z-40 flex justify-center font-pixel uppercase sm:bottom-6">
      <div className={`pointer-events-auto w-full max-w-[400px] animate-[fade-in_0.3s_ease-out] ${EDGE} text-cream`}>{children}</div>
    </div>
  );
}

function Rows({ rows, you }: { rows: BoardRowLite[]; you: string | null }) {
  const t = useT();
  if (rows.length === 0) return <p className="px-4 py-3 text-[10px] text-muted">{t("Nobody has driven it yet", "Ninguém correu aqui ainda")}</p>;
  return (
    <ol className="py-1.5">
      {rows.map((r) => {
        const me = r.login.toLowerCase() === (you ?? "you").toLowerCase();
        return (
          <li key={`${r.rank}-${r.login}`} className={`flex items-center gap-3 px-4 py-1 text-[11px] tabular-nums ${me ? "bg-lime text-bg" : ""}`}>
            <span className={`w-6 shrink-0 ${me ? "" : "text-muted"}`}>{r.rank}</span>
            <span className="min-w-0 flex-1 truncate normal-case">{me && !you ? t("You", "Você") : `@${r.login}`}</span>
            <span>{fmt(r.score)}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Actions({ back, go }: { back: { key: string; label: string; onClick: () => void }; go: { key: string; label: string; onClick: () => void } }) {
  return (
    <div className="grid grid-cols-[auto_1fr] border-t-[3px] border-border text-[11px]">
      <button type="button" onClick={back.onClick} className="flex h-11 items-center gap-2 border-r-[3px] border-border px-4 text-muted hover:text-cream">
        <kbd className="bg-[#22252c] px-1.5 py-0.5 font-pixel text-[9px] text-cream">{back.key}</kbd>
        {back.label}
      </button>
      <button type="button" onClick={go.onClick} autoFocus className="flex h-11 items-center justify-center gap-2 bg-lime px-4 text-bg outline-none hover:brightness-110 focus-visible:brightness-110">
        <kbd className="bg-bg/15 px-1.5 py-0.5 font-pixel text-[9px]">{go.key}</kbd>
        {go.label}
      </button>
    </div>
  );
}

/** Before the run: the track, the top three, your best. */
export function TrackCard({ spot, board, best, you, onStart, onBack }: { spot: LiveSpot; board: BoardRowLite[]; best: number | null; you: string | null; onStart: () => void; onBack: () => void }) {
  const t = useT();
  return (
    <Card>
      <header className="flex items-baseline justify-between gap-3 px-4 pb-2 pt-3">
        <h2 className="text-base text-lime sm:text-lg">{spot.name}</h2>
        {best !== null && (
          <span className="text-[9px] text-muted">
            {t("Your best", "Teu melhor")} <span className="text-cream">{fmt(best)}</span>
          </span>
        )}
      </header>
      <div className="border-t-[3px] border-border">
        <Rows rows={board.slice(0, 3)} you={you} />
      </div>
      <Actions back={{ key: "Esc", label: t("City", "Cidade"), onClick: onBack }} go={{ key: "Enter", label: "Drift", onClick: onStart }} />
    </Card>
  );
}

/** After the run, once the car has crossed the line and the camera rises: the score, where it puts you, again or back. */
export function TrackResults({
  spot,
  score,
  before,
  board,
  post,
  you,
  townPath,
  onRetry,
  onRetryPost,
  onBack,
}: {
  spot: LiveSpot;
  score: number;
  before: number | null;
  board: BoardRowLite[];
  post: PostState;
  you: string | null;
  /** Where sign-in comes back to. */
  townPath: string;
  onRetry: () => void;
  onRetryPost: () => void;
  onBack: () => void;
}) {
  const tr = useT();
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShown(true), 1200);
    return () => clearTimeout(t);
  }, []);
  const cb = useRef({ onRetry, onBack });
  useEffect(() => {
    cb.current = { onRetry, onBack };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === "KeyR" || e.code === "Enter" || e.code === "NumpadEnter") {
        e.preventDefault();
        cb.current.onRetry();
      } else if (e.key === "Escape") cb.current.onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  if (!shown) return null;

  const medal = medalFor(spot, score);
  const r = post.status === "posted" ? post.result : null;
  const rows = r ? r.around : projected(board, score, you ?? "you");
  const signIn = () => void signInWithGitHub(createBrowserSupabase(), `${window.location.origin}/auth/callback?next=${townPath}`);
  const verdict =
    before === null ? (
      <span className="text-muted">{tr("First run", "Primeira volta")}</span>
    ) : score > before ? (
      <span className="text-lime">{tr("New best", "Novo recorde")} +{fmt(score - before)}</span>
    ) : (
      <span className="text-muted">
        {tr("Best", "Melhor")} <span className="text-cream">{fmt(before)}</span>
      </span>
    );
  return (
    <Card>
      <header className="flex items-baseline justify-between gap-3 px-4 pb-2 pt-3">
        <h2 className="text-[10px] text-muted">{spot.name}</h2>
        {medal && (
          <span className="text-[10px]" style={{ color: MEDAL_COLORS[medal] }}>
            {tr(medal, MEDAL_PT[medal])}
          </span>
        )}
      </header>
      <div className="flex items-end justify-between gap-3 px-4 pb-3">
        <span className="text-4xl leading-none tabular-nums text-cream sm:text-5xl">{fmt(score)}</span>
        <span className="pb-1 text-[10px]">{verdict}</span>
      </div>
      <div className="border-t-[3px] border-border">
        {/* Your row alone says nothing the score doesn't. */}
        {rows.length > 1 && <Rows rows={rows.slice(0, 5)} you={you} />}
        {post.status === "signed-out" && (
          <button type="button" onClick={signIn} className={`w-full px-4 py-2.5 text-left text-[10px] text-lime hover:text-cream ${rows.length > 1 ? "border-t-2 border-border" : ""}`}>
            {tr("Sign in to post your run", "Entra pra postar tua volta")}
          </button>
        )}
        {post.status === "failed" && (
          <button type="button" onClick={onRetryPost} className={`w-full px-4 py-2.5 text-left text-[10px] text-[#ff9a3c] hover:text-cream ${rows.length > 1 ? "border-t-2 border-border" : ""}`}>
            {tr("Not posted · try again", "Não postou · tenta de novo")}
          </button>
        )}
      </div>
      <Actions back={{ key: "Esc", label: tr("City", "Cidade"), onClick: onBack }} go={{ key: "R", label: tr("Drive again", "Correr de novo"), onClick: onRetry }} />
    </Card>
  );
}
