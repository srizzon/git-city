"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, ChevronUp, Maximize2 } from "lucide-react";
import Panel from "@/components/league/hud/Panel";
import { fmt } from "@/components/league/hud/shared";
import type { Count, CountRow } from "@/lib/towns/brasil-election-server";
import { ballot } from "@/lib/towns/brasil-election";

// The presidential count on the map, always in view while the presidency is
// on: on a wide screen a card in the top-left corner (who leads, the top
// three) that opens down into everyone, Vote and the full page; on a phone a
// pill under the search that opens the sheet. Vote is always one tap away,
// and tapping a candidate opens the voting machine with their number typed.
// Read again every 15 seconds while the vote is open. Before the vote it says
// when it opens; after, who was elected.

const POLL_MS = 15_000;

const when = (ms: number) => new Date(ms).toLocaleString("en-GB", { timeZone: "America/Sao_Paulo", weekday: "short", hour: "2-digit", minute: "2-digit" });
const pct = (v: number, total: number) => (total ? (v / total) * 100 : 0);
const pctText = (v: number, total: number) => `${pct(v, total).toFixed(1)}%`;

/** Wider than a phone. */
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

function Num({ n }: { n: number }) {
  return <span className="flex h-6 w-7 shrink-0 items-center justify-center border border-[#9a9a94] bg-[#eef0ea] text-[10px] tabular-nums text-[#1b1d22]">{ballot(n)}</span>;
}

function Face({ src, size }: { src: string | null; size: number }) {
  // eslint-disable-next-line @next/next/no-img-element -- a GitHub avatar
  return src ? <img src={src} alt="" width={size} height={size} className="shrink-0 object-cover" style={{ width: size, height: size }} /> : <span className="shrink-0 bg-bg-raised" style={{ width: size, height: size }} />;
}

function Row({ r, total, place, mine, onPick }: { r: CountRow; total: number; place: number; mine: boolean; onPick: (n: number) => void }) {
  return (
    <li>
      <button type="button" onClick={() => onPick(r.number)} aria-label={`Vote ${ballot(r.number)}, @${r.login}${mine ? ", your vote" : ""}`} className="flex w-full items-center gap-2 py-1 text-left hover:text-lime">
      <span className="flex w-4 justify-center text-[9px] tabular-nums text-muted">{mine ? <Check size={12} strokeWidth={3} className="text-lime" aria-hidden /> : place}</span>
      <Num n={r.number} />
      <Face src={r.avatar_url} size={20} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[9px] normal-case text-cream">@{r.login}</span>
        <span className="mt-1 block h-1 bg-border">
          <span className={`block h-1 transition-[width] duration-700 ${place === 1 ? "bg-lime" : "bg-cream/60"}`} style={{ width: `${pct(r.votes, total)}%` }} />
        </span>
      </span>
      <span className="w-11 text-right text-[10px] tabular-nums text-cream">{pctText(r.votes, total)}</span>
      </button>
    </li>
  );
}

export default function ApuracaoWidget({
  slug,
  initial,
  myVote = null,
  onVote,
}: {
  slug: string;
  initial: Count;
  /** The number you voted for this term (null: no vote yet). */
  myVote?: number | null;
  onVote: (number?: number) => void;
}) {
  const wide = useWide();
  const [c, setC] = useState(initial);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (c.mode !== "live") return;
    const id = setInterval(() => {
      fetch(`/api/towns/${slug}/brasil/count`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((x: Count | null) => x && setC(x))
        .catch(() => {});
    }, POLL_MS);
    return () => clearInterval(id);
  }, [c.mode, slug]);

  const lead = c.rows[0];
  const voted = c.mode === "live" && myVote !== null;
  // Vote, or (once you have) your vote, still a tap from changing it.
  const voteButton = (extra: string) =>
    voted ? (
      <button type="button" onClick={() => onVote(myVote!)} className={`btn-press flex min-h-9 items-center justify-center gap-1.5 border-2 border-lime text-[10px] text-lime ${extra}`}>
        <Check size={12} strokeWidth={3} aria-hidden /> You voted {ballot(myVote!)}
      </button>
    ) : (
      <button type="button" onClick={() => onVote()} className={`btn-press min-h-9 bg-lime text-[10px] text-bg ${extra}`}>
        {c.mode === "live" ? "Vote" : c.mode === "final" ? "See the race" : "Run for president"}
      </button>
    );
  const status =
    c.mode === "live" ? (
      <span className="flex items-center gap-1.5 text-cream">
        <span className="h-1.5 w-1.5 animate-pulse bg-red-500" aria-hidden /> Live
      </span>
    ) : c.mode === "final" ? (
      <span className="text-lime">Elected</span>
    ) : (
      <span className="text-muted">Vote {when(c.opens)}</span>
    );

  const full = (
    <div className="flex flex-col gap-2">
      {/* Scrolls on its own, so Vote and Full count stay in view however many run. */}
      <ol className="-mr-2 flex max-h-[min(50vh,360px)] flex-col overflow-y-auto overscroll-contain pr-2">
        {c.rows.map((r, i) => (
          <Row key={r.login} r={r} total={c.total} place={i + 1} mine={voted && r.number === myVote} onPick={onVote} />
        ))}
        {c.rows.length === 0 && <li className="py-2 text-[9px] normal-case text-muted">Nobody is running yet.</li>}
      </ol>
      <p className="text-[9px] tabular-nums text-muted">{fmt(c.total)} votes</p>
      <div className="grid grid-cols-2 gap-1.5">
        {voteButton("")}
        <a href={`/town/${slug}/apuracao`} className="btn-press flex min-h-9 items-center justify-center gap-1.5 border-2 border-border text-[10px] text-cream hover:border-lime/60">
          <Maximize2 size={12} aria-hidden /> Full count
        </a>
      </div>
    </div>
  );

  // A phone: the pill under the search, the sheet on tap.
  if (!wide) {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Presidential count"
          className="pointer-events-auto absolute left-3 top-[104px] z-20 flex items-center gap-2 border-2 border-border bg-bg/90 px-2.5 py-1.5 font-pixel text-[9px] uppercase backdrop-blur-sm"
        >
          {status}
          {lead && c.mode !== "soon" ? (
            <>
              <Num n={lead.number} />
              <span className="tabular-nums text-cream">{pctText(lead.votes, c.total)}</span>
            </>
          ) : (
            <span className="text-cream">President</span>
          )}
          {voted && <span className="text-lime">· Voted</span>}
        </button>
        {open && (
          <Panel title="Apuração" onClose={() => setOpen(false)} above>
            <div className="mb-2 text-[9px]">{status}</div>
            {full}
          </Panel>
        )}
      </>
    );
  }

  // A wide screen: the corner card, opening down.
  return (
    <section aria-label="Presidential count" className="pointer-events-auto absolute left-4 top-4 z-20 w-[272px] border-[3px] border-border bg-bg/90 font-pixel uppercase backdrop-blur-sm">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between gap-2 border-b-2 border-border px-3 py-2 text-[10px]">
        <span className="flex items-center gap-2">
          {status}
          <span className="text-muted">· Apuração</span>
        </span>
        {open ? <ChevronUp size={14} className="text-muted" aria-hidden /> : <ChevronDown size={14} className="text-muted" aria-hidden />}
      </button>
      <div className="px-3 py-2">
        {open ? (
          full
        ) : lead ? (
          <ol className="flex flex-col">
            {c.rows.slice(0, 3).map((r, i) => (
              <Row key={r.login} r={r} total={c.total} place={i + 1} mine={voted && r.number === myVote} onPick={onVote} />
            ))}
          </ol>
        ) : (
          <p className="py-1 text-[9px] normal-case text-muted">Nobody is running yet.</p>
        )}
        {!open && voteButton("mt-2 w-full")}
      </div>
    </section>
  );
}
