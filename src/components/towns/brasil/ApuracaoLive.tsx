"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Clock } from "lucide-react";
import { fmt } from "@/components/league/hud/shared";
import type { Count } from "@/lib/towns/brasil-election-server";
import { ballot } from "@/lib/towns/brasil-election";

// The presidential vote's live count, like election night on TV: the leader
// big (face, ballot number, %, votes), everyone else ranked with a bar, the
// total and the clock. Read again every 10 seconds while the vote is open; a
// row that just moved up flashes. After the vote closes it holds the result
// and names who was elected. The ballot numbers wear the voting machine's
// screen color.

const POLL_MS = 10_000;

const when = (ms: number) =>
  new Date(ms).toLocaleString("en-GB", { timeZone: "America/Sao_Paulo", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function left(to: number): string {
  const ms = Math.max(0, to - Date.now());
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const pct = (v: number, total: number) => (total ? (v / total) * 100 : 0);
const pctText = (v: number, total: number) => `${pct(v, total).toFixed(1)}%`;

function Number2({ n, big = false }: { n: number; big?: boolean }) {
  return (
    <span className={`flex shrink-0 items-center justify-center border-2 border-[#9a9a94] bg-[#eef0ea] tabular-nums text-[#1b1d22] ${big ? "h-14 w-16 text-3xl" : "h-8 w-10 text-sm"}`}>{ballot(n)}</span>
  );
}

function Face({ src, className }: { src: string | null; className: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- a GitHub avatar, cropped to a portrait
  return src ? <img src={src} alt="" className={`object-cover ${className}`} /> : <span className={`bg-bg-raised ${className}`} />;
}

export default function ApuracaoLive({ slug, initial }: { slug: string; initial: Count }) {
  const [c, setC] = useState(initial);
  const [moved, setMoved] = useState<Set<string>>(new Set());
  const [, tick] = useState(0);
  const prevPlace = useRef(new Map(initial.rows.map((r, i) => [r.login, i])));

  useEffect(() => {
    if (c.mode !== "live") {
      const id = setInterval(() => tick((n) => n + 1), 30_000);
      return () => clearInterval(id);
    }
    const id = setInterval(() => {
      tick((n) => n + 1);
      fetch(`/api/towns/${slug}/brasil/count`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((next: Count | null) => {
          if (!next) return;
          // Whoever climbed since the last read flashes.
          const up = new Set(next.rows.filter((r, i) => (prevPlace.current.get(r.login) ?? i) > i).map((r) => r.login));
          prevPlace.current = new Map(next.rows.map((r, i) => [r.login, i]));
          setMoved(up);
          setC(next);
        })
        .catch(() => {});
    }, POLL_MS);
    return () => clearInterval(id);
  }, [c.mode, slug]);

  const [lead, ...rest] = c.rows;

  return (
    <main className="min-h-screen bg-bg font-pixel uppercase text-cream">
      <div className="mx-auto flex max-w-[980px] flex-col gap-5 px-4 py-5 sm:px-6 sm:py-8">
        <div className="flex items-center justify-between gap-3 text-[10px]">
          <Link href={`/town/${slug}`} className="flex items-center gap-1 text-muted hover:text-cream">
            <ChevronLeft size={14} aria-hidden /> Back to the map
          </Link>
          {c.mode === "live" ? (
            <span className="flex items-center gap-2 text-cream">
              <span className="h-2 w-2 animate-pulse bg-red-500" aria-hidden /> Live
            </span>
          ) : (
            <span className="text-muted">{c.mode === "final" ? "Final result" : "Not open yet"}</span>
          )}
        </div>

        <header className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-border pb-4">
          <div>
            <h1 className="text-2xl text-cream sm:text-4xl">Apuração</h1>
            <p className="mt-1 text-[10px] text-muted">President of the devs&apos; Brazil · term {c.term}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl tabular-nums text-lime sm:text-3xl">{fmt(c.total)}</p>
            <p className="text-[9px] text-muted">votes</p>
          </div>
        </header>

        <p className="flex items-center gap-1.5 text-[10px] text-muted">
          <Clock size={13} aria-hidden />
          {c.mode === "live" ? (
            <>
              Vote ends in <span className="tabular-nums text-cream">{left(c.closes)}</span> <span className="normal-case">({when(c.closes)}, Brasília)</span>
            </>
          ) : c.mode === "final" ? (
            <>Closed {when(c.closes)} (Brasília)</>
          ) : (
            <>
              Vote opens {when(c.opens)} (Brasília) · in <span className="tabular-nums text-cream">{left(c.opens)}</span>
            </>
          )}
        </p>

        {!lead ? (
          <p className="border-2 border-border px-4 py-6 text-center text-[11px] normal-case text-muted">Nobody is running yet.</p>
        ) : (
          <>
            {/* The leader, big */}
            <section className={`flex items-center gap-4 border-2 p-4 transition-colors duration-700 sm:gap-6 sm:p-5 ${moved.has(lead.login) ? "border-lime bg-lime/10" : "border-lime/60"}`}>
              <Face src={lead.avatar_url} className="h-28 w-[88px] shrink-0 border-2 border-[#9a9a94] sm:h-36 sm:w-28" />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <span className="text-[10px] text-lime">{c.mode === "final" && c.elected === lead.login ? "Elected" : c.total ? "Leading" : "Running"}</span>
                <div className="flex items-center gap-3">
                  <Number2 n={lead.number} big />
                  <span className="min-w-0">
                    <span className="block truncate text-sm normal-case text-cream sm:text-lg">@{lead.login}</span>
                    <span className="block text-[10px] text-muted">{[lead.onMap ? (lead.uf ?? "Island") : null, lead.nominated ? "Nominated" : null].filter(Boolean).join(" · ")}</span>
                  </span>
                </div>
                {/* On a phone the % sits under the name, so the name keeps its room. */}
                <p className="flex items-baseline gap-2 sm:hidden">
                  <span className="text-2xl tabular-nums text-cream">{pctText(lead.votes, c.total)}</span>
                  <span className="text-[10px] tabular-nums text-muted">{fmt(lead.votes)} votes</span>
                </p>
                {c.mode === "live" && (
                  <Link href={`/town/${slug}?vote=${ballot(lead.number)}`} className="btn-press self-start bg-lime px-3 py-1.5 text-[10px] text-bg sm:hidden">
                    Vote {ballot(lead.number)}
                  </Link>
                )}
              </div>
              <div className="shrink-0 text-right max-sm:hidden">
                <p className="text-3xl tabular-nums text-cream sm:text-5xl">{pctText(lead.votes, c.total)}</p>
                <p className="mt-1 text-[10px] tabular-nums text-muted">{fmt(lead.votes)} votes</p>
                {c.mode === "live" && (
                  <Link href={`/town/${slug}?vote=${ballot(lead.number)}`} className="btn-press mt-3 inline-block bg-lime px-3 py-2 text-[10px] text-bg">
                    Vote {ballot(lead.number)}
                  </Link>
                )}
              </div>
            </section>

            {/* Everyone else */}
            <ol className="flex flex-col gap-1.5">
              {rest.map((r, i) => (
                <li key={r.login} className={`flex items-center gap-3 border-2 px-3 py-2 transition-colors duration-700 ${moved.has(r.login) ? "border-lime bg-lime/10" : "border-border"}`}>
                  <span className="w-5 text-[10px] tabular-nums text-muted">{i + 2}</span>
                  <Number2 n={r.number} />
                  <Face src={r.avatar_url} className="h-9 w-9 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="truncate text-[11px] normal-case text-cream">@{r.login}</span>
                      <span className="shrink-0 text-[9px] text-muted">{[r.onMap ? (r.uf ?? "Island") : null, r.nominated ? "Nominated" : null].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="mt-1.5 block h-2 bg-border">
                      <span className="block h-2 bg-cream/70 transition-[width] duration-700" style={{ width: `${pct(r.votes, c.total)}%` }} />
                    </span>
                  </span>
                  <span className="w-16 shrink-0 text-right">
                    <span className="block text-sm tabular-nums text-cream">{pctText(r.votes, c.total)}</span>
                    <span className="block text-[9px] tabular-nums text-dim">{fmt(r.votes)}</span>
                  </span>
                  {c.mode === "live" && (
                    <Link href={`/town/${slug}?vote=${ballot(r.number)}`} className="btn-press shrink-0 border-2 border-lime px-2.5 py-1.5 text-[9px] text-lime hover:bg-lime hover:text-bg">
                      Vote {ballot(r.number)}
                    </Link>
                  )}
                </li>
              ))}
            </ol>
          </>
        )}

        {c.mode !== "final" && (
          <Link href={`/town/${slug}?vote=open`} className="btn-press self-center border-2 border-lime bg-lime px-6 py-2.5 text-[11px] text-bg">
            {c.mode === "live" ? "Open the voting machine" : "Run for president"}
          </Link>
        )}
      </div>
    </main>
  );
}
