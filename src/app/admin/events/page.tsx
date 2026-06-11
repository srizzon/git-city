"use client";

import { useState, useEffect, useCallback } from "react";

interface EventRow {
  id: string;
  slug: string;
  status: string;
  starts_at: string;
  ends_at: string;
  boss_max_hp: number;
  total_damage: number;
  total_participants: number;
  outcome: string | null;
  theme_config: { boss_name?: string; lore?: string } | null;
  sponsor_brand: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  scheduled: "border-border text-muted",
  live: "border-lime/40 bg-lime/10 text-lime",
  wrap: "border-amber-700/40 bg-amber-900/20 text-amber-400",
  archived: "border-border text-dim",
};

const DUCK_OPTS = [
  { v: "companion_duck", label: "Companion Duck" },
  { v: "duck_combatant", label: "Combatant Duck" },
  { v: "duck_gold_animated", label: "Golden Slayer Duck" },
  { v: "", label: "None (XP only)" },
];

function defaultStart(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  return toLocalInput(d);
}
function defaultEnd(): string {
  const d = new Date(Date.now() + 3 * 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  return toLocalInput(d);
}
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const field = "w-full border border-border bg-bg px-3 py-2 text-xs text-cream outline-none focus:border-lime";

export default function AdminEventsPage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [slug, setSlug] = useState("bug-invasion-1");
  const [bossName, setBossName] = useState("The Original Bug");
  const [lore, setLore] = useState("A rubber duck that absorbed every bug ever debugged. It came back.");
  const [startsAt, setStartsAt] = useState(defaultStart());
  const [endsAt, setEndsAt] = useState(defaultEnd());
  const [bossMaxHp, setBossMaxHp] = useState(50000);
  const [sponsorBrand, setSponsorBrand] = useState("");
  const [creating, setCreating] = useState(false);

  const [participationItem, setParticipationItem] = useState("companion_duck");
  const [combatantItem, setCombatantItem] = useState("duck_combatant");
  const [slayerItem, setSlayerItem] = useState("duck_gold_animated");

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/events");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      setEvents(data.events ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);
  useEffect(() => {
    if (!error && !success) return;
    const t = setTimeout(() => { setError(null); setSuccess(null); }, 4000);
    return () => clearTimeout(t);
  }, [error, success]);

  async function createEvent(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true); setError(null); setSuccess(null);
    try {
      const res = await fetch("/api/admin/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug, boss_name: bossName, lore,
          starts_at: new Date(startsAt).toISOString(),
          ends_at: new Date(endsAt).toISOString(),
          boss_max_hp: bossMaxHp,
          sponsor_brand: sponsorBrand || undefined,
          rewards: {
            participation: { item_id: participationItem },
            combatant: { item_id: combatantItem },
            slayer: { item_id: slayerItem },
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create");
      setSuccess(`Created "${slug}"`);
      await fetchEvents();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create");
    } finally {
      setCreating(false);
    }
  }

  async function action(id: string, act: "start" | "end" | "cancel") {
    if (act === "end" && !confirm("End event now and distribute rewards?")) return;
    try {
      const res = await fetch(`/api/admin/events/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: act }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Action failed");
      setSuccess("Done");
      await fetchEvents();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this event?")) return;
    try {
      const res = await fetch(`/api/admin/events/${id}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Delete failed"); }
      await fetchEvents();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  const liveCount = events.filter((e) => e.status === "live").length;
  const scheduledCount = events.filter((e) => e.status === "scheduled").length;

  return (
    <div className="min-h-screen bg-bg p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-sm text-cream">Bug Invasion · Events</h1>
        <p className="mt-1 text-[11px] text-muted">Schedule live boss events. Cron opens at start, distributes rewards at end.</p>

        {/* Summary */}
        <div className="mb-6 mt-5 grid grid-cols-3 gap-3">
          <div className="border border-border bg-bg-raised p-4">
            <p className="text-[11px] text-muted">Live</p>
            <p className="mt-1 text-2xl text-lime">{liveCount}</p>
          </div>
          <div className="border border-border bg-bg-raised p-4">
            <p className="text-[11px] text-muted">Scheduled</p>
            <p className="mt-1 text-2xl text-cream">{scheduledCount}</p>
          </div>
          <div className="border border-border bg-bg-raised p-4">
            <p className="text-[11px] text-muted">Total</p>
            <p className="mt-1 text-2xl text-cream">{events.length}</p>
          </div>
        </div>

        {/* Toast */}
        {(error || success) && (
          <div className="fixed right-4 top-4 z-[100]">
            <div className={`border px-4 py-3 text-xs ${success ? "border-lime/30 bg-lime/10 text-lime" : "border-red-800/30 bg-red-900/20 text-red-400"}`}>
              {success ?? error}
            </div>
          </div>
        )}

        {/* Create form */}
        <div className="mb-8 border border-border bg-bg-raised p-5">
          <h2 className="mb-4 text-xs text-cream">Create event</h2>
          <form onSubmit={createEvent} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[11px] text-muted">Slug</label>
                <input value={slug} onChange={(e) => setSlug(e.target.value)} className={field} required />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-muted">Boss name</label>
                <input value={bossName} onChange={(e) => setBossName(e.target.value)} className={field} />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[11px] text-muted">Lore</label>
              <textarea value={lore} onChange={(e) => setLore(e.target.value)} rows={2} className={field} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[11px] text-muted">Starts</label>
                <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={field} required />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-muted">Ends</label>
                <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={field} required />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[11px] text-muted">Boss HP</label>
                <input type="number" value={bossMaxHp} onChange={(e) => setBossMaxHp(Number(e.target.value))} className={field} min={5000} max={20000000} />
                <p className="mt-1 text-[9px] text-dim normal-case">~100 dmg/s per active player. HP ≈ players × 100 × seconds of fight</p>
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-muted">Sponsor</label>
                <input value={sponsorBrand} onChange={(e) => setSponsorBrand(e.target.value)} className={field} placeholder="house" />
              </div>
            </div>

            {/* Reward per tier — terse, aligned rows */}
            <div className="border border-border bg-bg p-3">
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-[11px] text-cream">Reward per tier</span>
                <span className="text-[10px] text-dim">cosmetic granted</span>
              </div>
              <div className="space-y-2">
                <RewardRow label="Participation" hint="all ≥100 dmg" value={participationItem} onChange={setParticipationItem} />
                <RewardRow label="Combatant" hint="top 50%" value={combatantItem} onChange={setCombatantItem} />
                <RewardRow label="Slayer" hint="top 10%" value={slayerItem} onChange={setSlayerItem} />
              </div>
            </div>

            <button type="submit" disabled={creating}
              className="border-2 border-lime bg-lime/10 px-4 py-2.5 text-xs text-lime transition-colors hover:bg-lime/20 disabled:opacity-50">
              {creating ? "Creating..." : "Create scheduled event"}
            </button>
          </form>
        </div>

        {/* Event list */}
        <h2 className="mb-3 text-xs text-cream">Events ({events.length})</h2>
        {loading ? (
          <div className="border border-border bg-bg-raised p-4"><div className="h-4 w-32 animate-pulse bg-border" /></div>
        ) : events.length === 0 ? (
          <div className="border border-border bg-bg-raised p-6 text-center">
            <p className="text-xs text-muted">No events yet</p>
          </div>
        ) : (
          <div>
            {events.map((ev, i) => (
              <div key={ev.id} className={`border border-border bg-bg-raised px-4 py-3 transition-colors hover:bg-bg-card ${i > 0 ? "border-t-0" : ""}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className={`shrink-0 border px-2 py-0.5 text-[10px] ${STATUS_STYLES[ev.status] ?? "border-border text-muted"}`}>{ev.status}</span>
                    <span className="truncate text-xs text-cream">{ev.slug}</span>
                    {ev.sponsor_brand && <span className="shrink-0 text-[10px] text-lime">· {ev.sponsor_brand}</span>}
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <a href={`/admin/events/${ev.id}`} className="border border-border px-2 py-0.5 text-[9px] text-muted transition-colors hover:border-lime/40 hover:text-lime">Metrics</a>
                    {ev.status === "scheduled" && (
                      <button onClick={() => action(ev.id, "start")} className="border border-lime/40 px-2 py-0.5 text-[9px] text-lime transition-colors hover:bg-lime/10">Start</button>
                    )}
                    {ev.status === "live" && (
                      <button onClick={() => action(ev.id, "end")} className="border border-amber-700/40 px-2 py-0.5 text-[9px] text-amber-400 transition-colors hover:bg-amber-900/20">End</button>
                    )}
                    {ev.status !== "live" && (
                      <button onClick={() => remove(ev.id)} className="border border-border px-2 py-0.5 text-[9px] text-muted transition-colors hover:border-red-800 hover:text-red-400">Delete</button>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-dim">
                  <span>HP {ev.boss_max_hp.toLocaleString()}</span>
                  <span>DMG {ev.total_damage.toLocaleString()}</span>
                  <span>{ev.total_participants} devs</span>
                  {ev.outcome && <span>{ev.outcome}</span>}
                  <span>{new Date(ev.starts_at).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RewardRow({ label, hint, value, onChange }: { label: string; hint: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11px] text-cream-dark">
        {label} <span className="text-dim">· {hint}</span>
      </span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-52 shrink-0 border border-border bg-bg px-2 py-1.5 text-[11px] text-cream outline-none focus:border-lime">
        {DUCK_OPTS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
      </select>
    </div>
  );
}
