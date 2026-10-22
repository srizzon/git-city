"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AgendaStats } from "@/app/api/admin/reels/route";

// The reels agenda: what's scheduled, posting, posted or failed this week,
// day by day in Brasília time, with each posted reel's latest numbers (views,
// devs it put on the map). A waiting reel can be moved, posted now or
// cancelled; a failed one shows why and can be retried. The reel-publish
// cron does the posting, so this works from the phone with the Mac closed.

interface AgendaReel {
  id: string;
  spec_id: string;
  kind: "main" | "trial";
  caption: string;
  scheduled_at: string;
  status: "scheduled" | "publishing" | "posted" | "failed";
  attempts: number;
  error: string | null;
  permalink: string | null;
  meta: { preset?: string; hook?: string; length_s?: number; readout?: { at: string; verdict: string; winner?: boolean } };
  stats: AgendaStats | null;
  graduated: boolean;
}

const TZ = "America/Sao_Paulo";
const dayOf = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const n = (v: number | null | undefined) => (v == null ? "–" : v >= 10_000 ? `${(v / 1000).toFixed(1)}k` : v.toLocaleString("en-US"));
/** The value a datetime-local input wants, in Brasília time. */
const localInput = (iso: string) => {
  const d = new Date(new Date(iso).getTime() - 3 * 3_600_000);
  return d.toISOString().slice(0, 16);
};

const STATUS: Record<AgendaReel["status"], { label: string; tone: string }> = {
  scheduled: { label: "Scheduled", tone: "text-cream" },
  publishing: { label: "Posting…", tone: "text-cream" },
  posted: { label: "Posted", tone: "text-lime" },
  failed: { label: "Failed", tone: "text-red-400" },
};

const button = "border border-border px-2.5 py-1 text-[10px] text-cream hover:border-lime hover:text-lime disabled:opacity-40";

function Row({ r, act, busy }: { r: AgendaReel; act: (body: Record<string, string>) => void; busy: boolean }) {
  const [moving, setMoving] = useState(false);
  const [at, setAt] = useState(localInput(r.scheduled_at));
  const waiting = r.status === "scheduled" || r.status === "failed";
  const s = STATUS[r.status];
  return (
    <div className="flex flex-col gap-2 border-t border-border py-3 first:border-t-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-sm text-cream">{timeOf(r.scheduled_at)}</span>
        <span className="text-[11px] uppercase text-cream">{r.kind === "main" ? "Main" : "Trial"}</span>
        <span className="text-[11px] text-muted">{r.meta.preset ?? r.spec_id}</span>
        <span className={`ml-auto text-[10px] uppercase tracking-wider ${s.tone}`}>
          {s.label}
          {r.graduated ? " · graduated" : ""}
        </span>
      </div>
      {r.meta.hook && <p className="text-[11px] normal-case text-muted">“{r.meta.hook}”</p>}
      {r.status === "failed" && r.error && <p className="text-[11px] normal-case text-red-400">{r.error}</p>}
      {r.stats && (
        <div className="grid grid-cols-4 gap-px border border-border bg-border text-center sm:grid-cols-7">
          {(
            [
              ["Views", n(r.stats.views)],
              ["Reach", n(r.stats.reach)],
              ["Skip", r.stats.skip_rate == null ? "–" : `${r.stats.skip_rate}%`],
              ["Watch", r.stats.avg_watch_ms == null ? "–" : `${(r.stats.avg_watch_ms / 1000).toFixed(1)}s`],
              ["Shares", n(r.stats.shares)],
              ["Comments", n(r.stats.comments)],
              ["New devs", n(r.stats.devs_placed)],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="bg-bg-raised py-1.5">
              <div className="text-[12px] text-lime">{v}</div>
              <div className="text-[8px] uppercase text-muted">{k}</div>
            </div>
          ))}
        </div>
      )}
      {r.meta.readout && (
        // the cloud readout's verdict on this reel (api/reels/readout), written once it had its numbers
        <p className={`border-l-2 pl-2 text-[11px] normal-case ${r.meta.readout.winner ? "border-lime text-lime" : "border-border text-cream"}`}>
          {r.meta.readout.winner ? "Winner · " : ""}
          {r.meta.readout.verdict}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {r.permalink && (
          <a href={r.permalink} target="_blank" rel="noreferrer" className={button}>
            Instagram
          </a>
        )}
        {waiting && !moving && (
          <>
            <button type="button" disabled={busy} onClick={() => setMoving(true)} className={button}>
              Move
            </button>
            <button type="button" disabled={busy} onClick={() => act({ action: "now", id: r.id })} className={button}>
              Post now
            </button>
            <button type="button" disabled={busy} onClick={() => confirm(`Cancel ${r.spec_id}?`) && act({ action: "cancel", id: r.id })} className={`${button} hover:border-red-400 hover:text-red-400`}>
              Cancel
            </button>
          </>
        )}
        {r.status === "failed" && (
          <button type="button" disabled={busy} onClick={() => act({ action: "retry", id: r.id })} className={button}>
            Try again
          </button>
        )}
        {moving && (
          <>
            <input
              type="datetime-local"
              aria-label="New time (Brasília)"
              value={at}
              onChange={(e) => setAt(e.target.value)}
              className="border border-border bg-bg px-2 py-1 text-[11px] text-cream [color-scheme:dark]"
            />
            <button type="button" disabled={busy} onClick={() => (act({ action: "move", id: r.id, at: `${at}:00-03:00` }), setMoving(false))} className={button}>
              Save
            </button>
            <button type="button" onClick={() => setMoving(false)} className={button}>
              Back
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function AdminReels() {
  const [from, setFrom] = useState<string | null>(null);
  const [reels, setReels] = useState<AgendaReel[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Bumped after an action and every minute (a reel goes from scheduled to posted on its own).
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    fetch(`/api/admin/reels${from ? `?from=${from}` : ""}`, { cache: "no-store" })
      .then(async (res) => {
        const j = (await res.json().catch(() => ({}))) as { reels?: AgendaReel[]; error?: string };
        if (!live) return;
        if (!res.ok) setError(j.error ?? `Failed (${res.status}).`);
        else setReels(j.reels ?? []);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [from, tick]);

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  const act = async (body: Record<string, string>) => {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/reels", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) setError(j.error ?? `Failed (${res.status}).`);
    setTick((x) => x + 1);
  };

  const days = [...new Set((reels ?? []).map((r) => dayOf(r.scheduled_at)))];

  return (
    <div className="min-h-screen bg-bg p-4 sm:p-6 lg:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <div>
          <Link href="/admin" className="text-[11px] text-muted hover:text-cream">
            ← Admin
          </Link>
          <div className="mt-2 flex items-center justify-between gap-3">
            <h1 className="text-sm text-cream">Reels agenda</h1>
            <input
              type="date"
              aria-label="Week from"
              value={from ?? ""}
              onChange={(e) => setFrom(e.target.value || null)}
              className="border border-border bg-bg px-2 py-1 text-[11px] text-cream [color-scheme:dark]"
            />
          </div>
          <p className="mt-1 text-[11px] text-muted">Brasília time. Reels post on their own at their slot; numbers update every hour.</p>
        </div>
        {error && <p className="text-[11px] normal-case text-red-400">{error}</p>}
        {!reels ? (
          <p className="text-[11px] text-muted">Loading…</p>
        ) : !reels.length ? (
          <p className="text-[11px] text-muted">Nothing scheduled this week. Schedule a finished reel from the reels studio.</p>
        ) : (
          days.map((d) => (
            <section key={d} className="flex flex-col border border-border bg-bg-raised px-4 py-1">
              <h2 className="pt-3 text-[11px] uppercase tracking-wider text-dim">
                {new Date(`${d}T12:00:00-03:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: TZ })}
              </h2>
              {reels
                .filter((r) => dayOf(r.scheduled_at) === d)
                .map((r) => (
                  <Row key={r.id} r={r} act={act} busy={busy} />
                ))}
            </section>
          ))
        )}
      </div>
    </div>
  );
}
