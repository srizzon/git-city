"use client";

import { useState, useEffect, useCallback, use } from "react";

interface Metrics {
  summary: {
    slug: string; status: string; outcome: string | null;
    boss_max_hp: number; total_damage: number; total_participants: number;
    distinct_participants: number; flagged_outliers: number; rewards_granted: number;
  } | null;
  funnel: { viewed: number; joined: number; participated: number; rewarded: number; claimed: number } | null;
  tiers: Record<string, number>;
  lift: { event_dau: number; baseline_dau: number; lift_pct: number | null } | null;
  retention: {
    participant_total: number; participant_d7_retained: number; participant_d7_pct: number | null;
    non_participant_total: number; non_participant_d7_retained: number; non_participant_d7_pct: number | null;
  } | null;
  leaderboard: { rank: number; login: string; damage: number; minions: number; tier: string | null; flagged: boolean }[];
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="border border-border bg-bg-raised p-4">
      <p className="text-[11px] text-muted">{label}</p>
      <p className={`mt-1 text-2xl ${accent ? "text-lime" : "text-cream"}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[10px] text-dim">{sub}</p>}
    </div>
  );
}

export default function EventMetricsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [m, setM] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/events/${id}/metrics`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setM(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchMetrics();
    const t = setInterval(fetchMetrics, 30000); // live-ish refresh
    return () => clearInterval(t);
  }, [fetchMetrics]);

  const [busy, setBusy] = useState(false);
  const [newEnd, setNewEnd] = useState("");
  const patch = useCallback(async (body: Record<string, unknown>, confirmMsg?: string) => {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/events/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Action failed");
      await fetchMetrics();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }, [id, fetchMetrics]);

  if (loading) {
    return (
      <div className="min-h-screen bg-bg p-8">
        <div className="mx-auto max-w-6xl"><div className="h-4 w-40 animate-pulse bg-border" /></div>
      </div>
    );
  }
  if (error || !m?.summary) {
    return (
      <div className="min-h-screen bg-bg p-8 text-cream">
        <div className="mx-auto max-w-6xl">
          <a href="/admin/events" className="text-[11px] text-muted hover:text-cream">← Events</a>
          <p className="mt-4 text-xs text-red-400">{error ?? "Event not found"}</p>
        </div>
      </div>
    );
  }

  const s = m.summary;
  const f = m.funnel;
  const hpPct = s.boss_max_hp > 0 ? Math.min(100, (s.total_damage / s.boss_max_hp) * 100) : 0;

  return (
    <div className="min-h-screen bg-bg p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <a href="/admin/events" className="text-[11px] text-muted transition-colors hover:text-cream">← Events</a>
        <div className="mb-6 mt-2 flex items-baseline gap-3">
          <h1 className="text-sm text-cream">{s.slug}</h1>
          <span className="text-[10px] uppercase text-lime">{s.status}</span>
          {s.outcome && <span className="text-[10px] uppercase text-dim">· {s.outcome}</span>}
        </div>

        {/* Headline stats */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Participants" value={s.distinct_participants.toLocaleString()} accent />
          <Stat label="Total damage" value={s.total_damage.toLocaleString()} sub={`${hpPct.toFixed(0)}% of ${s.boss_max_hp.toLocaleString()} HP`} />
          <Stat label="Rewards granted" value={s.rewards_granted.toLocaleString()} />
          <Stat label="Flagged outliers" value={s.flagged_outliers.toLocaleString()} sub={s.flagged_outliers > 0 ? "review" : "clean"} />
        </div>

        {/* Live controls — manage the running event without a deploy */}
        <div className="mb-6 border border-border bg-bg-raised p-4">
          <p className="mb-3 text-[11px] text-muted">Live controls</p>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-[10px] text-dim">New end time</label>
              <input type="datetime-local" value={newEnd} onChange={(e) => setNewEnd(e.target.value)}
                className="border border-border bg-bg px-2 py-1.5 text-[11px] text-cream outline-none focus:border-lime" />
            </div>
            <button disabled={busy || !newEnd}
              onClick={() => patch({ action: "extend", ends_at: new Date(newEnd).toISOString() })}
              className="border border-border px-3 py-1.5 text-[10px] text-muted transition-colors hover:border-lime/40 hover:text-lime disabled:opacity-40">
              Apply end time
            </button>
            {s.status === "live" && (
              <button disabled={busy} onClick={() => patch({ action: "end" }, "End event now?")}
                className="border border-amber-700/40 px-3 py-1.5 text-[10px] text-amber-400 transition-colors hover:bg-amber-900/20 disabled:opacity-40">
                End now
              </button>
            )}
            {s.status === "wrap" && (
              <button disabled={busy} onClick={() => patch({ action: "release" }, "Release rewards now? This grants Pixels/items to winners.")}
                className="border border-lime/40 px-3 py-1.5 text-[10px] text-lime transition-colors hover:bg-lime/10 disabled:opacity-40">
                Release rewards
              </button>
            )}
          </div>
          {s.status === "wrap" && (
            <p className="mt-2 text-[9px] text-amber-400 normal-case">Held: standings computed, rewards NOT paid yet. Review flagged outliers in the leaderboard below, then Release.</p>
          )}
        </div>

        {/* DAU lift + retention split — the "gold numbers" */}
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="border border-border bg-bg-raised p-4">
            <p className="mb-2 text-[11px] text-muted">DAU LIFT (vs prior week)</p>
            {m.lift ? (
              <div className="flex items-baseline gap-3">
                <span className="text-2xl text-lime">{m.lift.lift_pct != null ? `${m.lift.lift_pct > 0 ? "+" : ""}${m.lift.lift_pct}%` : "—"}</span>
                <span className="text-[10px] text-dim">{m.lift.event_dau} event · {m.lift.baseline_dau} baseline</span>
              </div>
            ) : <span className="text-[10px] text-dim">needs baseline snapshots</span>}
          </div>
          <div className="border border-border bg-bg-raised p-4">
            <p className="mb-2 text-[11px] text-muted">D7 RETENTION (participant vs not)</p>
            {m.retention ? (
              <div className="flex items-baseline gap-3">
                <span className="text-2xl text-lime">{m.retention.participant_d7_pct ?? "—"}%</span>
                <span className="text-[10px] text-dim">
                  vs {m.retention.non_participant_d7_pct ?? "—"}% non-participant
                </span>
              </div>
            ) : <span className="text-[10px] text-dim">available 7 days post-event</span>}
            <p className="mt-1 text-[9px] text-dim normal-case">observed lift (quasi-experiment, not proven causality)</p>
          </div>
        </div>

        {/* Funnel */}
        {f && (
          <div className="mb-6 border border-border bg-bg-raised p-4">
            <p className="mb-3 text-[11px] text-muted">FUNNEL</p>
            <div className="space-y-1.5">
              {([
                ["Viewed", f.viewed],
                ["Joined", f.joined],
                ["Fought (dealt damage)", f.participated],
                ["Rewarded", f.rewarded],
                ["Claimed", f.claimed],
              ] as [string, number][]).map(([label, n], i, arr) => {
                const top = arr[0][1] || 1;
                const pct = Math.min(100, (n / top) * 100);
                return (
                  <div key={label} className="flex items-center gap-3 text-[11px]">
                    <span className="w-40 text-cream-dark">{label}</span>
                    <div className="relative h-3 flex-1 border border-border bg-bg">
                      <div className="absolute inset-y-0 left-0 bg-lime/60" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-16 text-right text-cream">{n.toLocaleString()}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Reward tier distribution */}
        {Object.keys(m.tiers).length > 0 && (
          <div className="mb-6 border border-border bg-bg-raised p-4">
            <p className="mb-3 text-[11px] text-muted">REWARD DISTRIBUTION</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(m.tiers).map(([k, n]) => (
                <span key={k} className="border border-border px-2 py-1 text-[10px] text-cream">
                  {k} <span className="text-lime">{n}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Leaderboard */}
        <div>
          <p className="mb-3 text-[11px] text-muted">TOP 20</p>
          <div className="border border-border bg-bg-raised">
            {m.leaderboard.map((row, i) => (
              <div key={row.login} className={`flex items-center justify-between px-4 py-2 text-[11px] ${i > 0 ? "border-t border-border" : ""}`}>
                <div className="flex items-center gap-3">
                  <span className="w-6 text-right text-dim">{row.rank ?? "—"}</span>
                  <span className="text-cream">{row.login}</span>
                  {row.tier && <span className="text-[9px] uppercase text-lime">{row.tier}</span>}
                  {row.flagged && <span className="text-[9px] uppercase text-red-400">outlier</span>}
                </div>
                <div className="flex gap-4 text-dim">
                  <span>{row.damage.toLocaleString()} dmg</span>
                  <span>{row.minions} min</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
