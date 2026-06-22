"use client";

import { useState, useEffect, useCallback } from "react";
import type { Rail, Selector, ScoringMetric } from "@/lib/events/schema";
import { getEventType, listEventTypes } from "@/lib/events/registry";
import { PixelSelect } from "@/components/ui/PixelSelect";
import { Section, NumField, inputCls as input, labelCls as label } from "@/components/ui/form";

interface EventRow {
  id: string;
  slug: string;
  kind: string;
  status: string;
  starts_at: string;
  ends_at: string;
  boss_max_hp: number;
  total_damage: number;
  total_participants: number;
  outcome: string | null;
  auto_distribute: boolean;
  theme_config: { boss_name?: string; lore?: string; variant?: string } | null;
  boss_config: Record<string, unknown> | null;
  rewards_config: { scoring?: { metric?: ScoringMetric }; rails?: Rail[] } | null;
  sponsor_brand: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  scheduled: "border-border text-muted",
  live: "border-lime/40 bg-lime/10 text-lime",
  wrap: "border-amber-700/40 bg-amber-900/20 text-amber-400",
  archived: "border-border text-dim",
};

type Opt = { value: string; label: string };
// Fallback until the live items catalog loads (/api/items).
const DEFAULT_ITEM_OPTS: Opt[] = [
  { value: "", label: "No item" },
  { value: "companion_duck", label: "Companion Duck" },
  { value: "duck_combatant", label: "Combatant Duck" },
  { value: "duck_gold_animated", label: "Golden Slayer Duck" },
];

const SELECTOR_OPTS: { value: Selector["type"]; label: string }[] = [
  { value: "rank", label: "Rank band" },
  { value: "all", label: "Everyone" },
  { value: "threshold", label: "Score threshold" },
  { value: "percentile", label: "Top percentile" },
  { value: "collective_goal", label: "If boss defeated" },
];

const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

function railSummary(r: Rail, labelFor: (v: string | null) => string, emblemLabelFor: (v: string | null) => string): { who: string; medal?: string; reward: string } {
  const s = r.selector;
  let who = "";
  let medal: string | undefined;
  if (s.type === "rank") {
    const min = s.min_rank ?? 1;
    who = min === s.max_rank ? `Rank ${s.max_rank}` : `Rank ${min}–${s.max_rank}`;
    medal = MEDAL[min === s.max_rank ? s.max_rank : 0];
  } else if (s.type === "all") {
    who = (s.min_score ?? 0) > 1 ? `Everyone ≥ ${s.min_score}` : "Everyone";
  } else if (s.type === "threshold") {
    who = `Score ≥ ${s.min_score.toLocaleString()}`;
  } else if (s.type === "percentile") {
    who = `Top ${Math.round(s.cutoff_pct * 100)}%`;
  } else {
    who = "If boss defeated";
  }
  const parts: string[] = [];
  if (r.bundle.pixels > 0) parts.push(`${r.bundle.pixels} px`);
  if (r.bundle.item_id) parts.push(labelFor(r.bundle.item_id));
  if (r.bundle.xp > 0) parts.push(`+${r.bundle.xp} XP`);
  if (r.bundle.emblem_id) parts.push(`🎖 ${emblemLabelFor(r.bundle.emblem_id)}`);
  return { who, medal, reward: parts.length ? parts.join(" · ") : "nothing" };
}

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

export default function AdminEventsPage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [kind, setKind] = useState("boss_raid");
  const [slug, setSlug] = useState("duck-boss-1");
  const [bossName, setBossName] = useState("The Original Bug");
  const [lore, setLore] = useState("A rubber duck that absorbed every bug ever debugged. It came back.");
  const [startsAt, setStartsAt] = useState(defaultStart());
  const [endsAt, setEndsAt] = useState(defaultEnd());
  const [bossMaxHp, setBossMaxHp] = useState(50000);
  const [sponsorBrand, setSponsorBrand] = useState("");
  const [autoDistribute, setAutoDistribute] = useState(false);
  const [metric, setMetric] = useState<ScoringMetric>("damage_dealt");
  const [rails, setRails] = useState<Rail[]>(() => getEventType("boss_raid")!.defaultConfig().rails);
  const [creating, setCreating] = useState(false);
  const [itemOpts, setItemOpts] = useState<Opt[]>(DEFAULT_ITEM_OPTS);
  const [emblemOpts, setEmblemOpts] = useState<Opt[]>([{ value: "", label: "No emblem" }]);

  // Advanced combat tuning (progressive disclosure)
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [dmgPerHit, setDmgPerHit] = useState(30);
  const [minionBonus, setMinionBonus] = useState(50);

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
    // Pull the live cosmetics catalog so any item is grantable as a reward
    // (new cosmetics show up here automatically — no code change per event).
    fetch("/api/items")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.items)) {
          setItemOpts([
            { value: "", label: "No item" },
            ...d.items.map((it: { id: string; name: string }) => ({ value: it.id, label: it.name })),
          ]);
        }
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    // Active emblems — any can be auto-granted to a reward rail (no deploy).
    fetch("/api/admin/emblems")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.emblems)) {
          setEmblemOpts([
            { value: "", label: "No emblem" },
            ...d.emblems
              .filter((e: { active: boolean }) => e.active)
              .map((e: { id: string; name: string }) => ({ value: e.id, label: e.name })),
          ]);
        }
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!error && !success) return;
    const t = setTimeout(() => { setError(null); setSuccess(null); }, 4000);
    return () => clearTimeout(t);
  }, [error, success]);

  function resetRewardsForKind(k: string) {
    const def = getEventType(k);
    if (def) { setRails(def.defaultConfig().rails); setMetric(def.defaultConfig().scoring.metric); }
  }

  async function createEvent(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true); setError(null); setSuccess(null);
    try {
      const res = await fetch("/api/admin/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind, slug,
          theme: { boss_name: bossName, lore },
          starts_at: new Date(startsAt).toISOString(),
          ends_at: new Date(endsAt).toISOString(),
          boss_max_hp: bossMaxHp,
          boss_config: { damage_per_hit: dmgPerHit, minion_kill_bonus: minionBonus },
          sponsor_brand: sponsorBrand || undefined,
          auto_distribute: autoDistribute,
          rewards: { scoring: { metric, aggregation: "competitive" }, rails },
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

  function cloneFrom(ev: EventRow) {
    setKind(ev.kind);
    setSlug(`${ev.slug}-copy`);
    setBossName(ev.theme_config?.boss_name ?? "");
    setLore(ev.theme_config?.lore ?? "");
    setBossMaxHp(ev.boss_max_hp);
    setSponsorBrand(ev.sponsor_brand ?? "");
    setAutoDistribute(ev.auto_distribute);
    setMetric(ev.rewards_config?.scoring?.metric ?? "damage_dealt");
    if (ev.rewards_config?.rails?.length) setRails(ev.rewards_config.rails);
    setStartsAt(defaultStart());
    setEndsAt(defaultEnd());
    setSuccess(`Cloned "${ev.slug}" — adjust & create`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function action(id: string, act: "start" | "end" | "cancel" | "release") {
    if (act === "end" && !confirm("End event now? (auto events pay out; held events wait for Release)")) return;
    if (act === "release" && !confirm("Release rewards now? This grants Pixels/items to winners.")) return;
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
  const totalPixels = rails.reduce((s, r) => s + (r.bundle.pixels || 0), 0);

  return (
    <div className="min-h-screen bg-bg p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-base text-cream">Events</h1>
        <p className="mt-1.5 text-[11px] leading-relaxed text-muted">Schedule live events. Cron opens at start; rewards distribute (or hold for review) at end. Everything is config-driven — no deploy needed.</p>

        <div className="mb-7 mt-5 grid grid-cols-3 gap-3">
          {[{ k: "Live", v: liveCount, accent: true }, { k: "Scheduled", v: scheduledCount }, { k: "Total", v: events.length }].map((s) => (
            <div key={s.k} className="border border-border bg-bg-raised p-4 shadow-[3px_3px_0_0_rgba(0,0,0,0.4)]">
              <p className="text-[10px] uppercase tracking-wide text-muted">{s.k}</p>
              <p className={`mt-1 text-2xl ${s.accent ? "text-lime" : "text-cream"}`}>{s.v}</p>
            </div>
          ))}
        </div>

        {(error || success) && (
          <div className="fixed right-4 top-4 z-[100]">
            <div className={`border-[3px] px-4 py-3 text-xs shadow-[4px_4px_0_0_rgba(0,0,0,0.5)] ${success ? "border-lime/40 bg-lime/10 text-lime" : "border-red-800/50 bg-red-900/20 text-red-400"}`}>
              {success ?? error}
            </div>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1.55fr_1fr] lg:items-start">
        {/* ─── Create form ─── */}
        <form onSubmit={createEvent} className="border border-border bg-bg-raised shadow-[4px_4px_0_0_rgba(0,0,0,0.4)]">
          <div className="border-b border-border px-5 py-3">
            <h2 className="text-xs uppercase tracking-wide text-cream">Create event</h2>
          </div>

          <div className="space-y-6 p-5">
            {/* Basics */}
            <Section title="Basics">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={label}>Type</label>
                  <PixelSelect value={kind} onChange={(v) => { setKind(v); resetRewardsForKind(v); }}
                    options={listEventTypes().map((t) => ({ value: t.kind, label: t.label }))} ariaLabel="Event type" />
                </div>
                <div>
                  <label className={label}>Slug</label>
                  <input value={slug} onChange={(e) => setSlug(e.target.value)} className={input} required placeholder="duck-boss-1" />
                </div>
                <div>
                  <label className={label}>Boss name</label>
                  <input value={bossName} onChange={(e) => setBossName(e.target.value)} className={input} />
                </div>
                <div>
                  <label className={label}>Sponsor <span className="text-dim normal-case">· optional</span></label>
                  <input value={sponsorBrand} onChange={(e) => setSponsorBrand(e.target.value)} className={input} placeholder="house" />
                </div>
              </div>
              <div className="mt-4">
                <label className={label}>Lore</label>
                <textarea value={lore} onChange={(e) => setLore(e.target.value)} rows={2} className={input} />
              </div>
            </Section>

            {/* Schedule */}
            <Section title="Schedule & combat">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={label}>Starts</label>
                  <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={input} required />
                </div>
                <div>
                  <label className={label}>Ends</label>
                  <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={input} required />
                </div>
                <div>
                  <label className={label}>Boss HP</label>
                  <input type="number" value={bossMaxHp} onChange={(e) => setBossMaxHp(Number(e.target.value))} className={input} min={5000} max={20000000} />
                  <p className="mt-1.5 text-[9px] leading-relaxed text-dim normal-case">≈ players × 100 × seconds of fight</p>
                </div>
                <div>
                  <label className={label}>Distribution</label>
                  <div className="flex">
                    {[{ v: false, l: "Hold → review" }, { v: true, l: "Auto pay" }].map((o, i) => (
                      <button key={String(o.v)} type="button" onClick={() => setAutoDistribute(o.v)}
                        className={`cursor-pointer border px-3 py-2 text-[10px] transition-colors ${autoDistribute === o.v ? "relative z-10 border-lime bg-lime/10 text-lime" : "border-border text-muted hover:text-cream"} ${i > 0 ? "-ml-px" : ""}`}>
                        {o.l}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[9px] leading-relaxed text-dim normal-case">{autoDistribute ? "Pays winners automatically at end" : "Computes standings, you review then Release"}</p>
                </div>
              </div>

              {/* Advanced (progressive disclosure) */}
              <button type="button" onClick={() => setShowAdvanced((s) => !s)}
                className="mt-4 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted transition-colors hover:text-cream">
                <span className={`text-[8px] transition-transform ${showAdvanced ? "rotate-90" : ""}`}>▶</span> Advanced combat tuning
              </button>
              {showAdvanced && (
                <div className="mt-3 grid grid-cols-2 gap-4 border-l-2 border-border pl-4">
                  <div>
                    <label className={label}>Damage / hit</label>
                    <input type="number" value={dmgPerHit} onChange={(e) => setDmgPerHit(Number(e.target.value))} className={input} min={1} max={100000} />
                  </div>
                  <div>
                    <label className={label}>Minion kill bonus</label>
                    <input type="number" value={minionBonus} onChange={(e) => setMinionBonus(Number(e.target.value))} className={input} min={0} max={100000} />
                  </div>
                  <p className="col-span-2 text-[9px] leading-relaxed text-dim normal-case">Tunable live without a deploy. Lower damage = longer, harder fight.</p>
                </div>
              )}
            </Section>

            {/* Rewards */}
            <Section title="Rewards" right={<span className="text-[10px] text-dim">{totalPixels.toLocaleString()} px · {rails.length} rails</span>}>
              <div className="mb-3 flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wide text-muted">Rank by</span>
                <PixelSelect value={metric} onChange={(v) => setMetric(v as ScoringMetric)} className="w-44"
                  options={[{ value: "damage_dealt", label: "Damage dealt" }, { value: "score", label: "Score" }]} ariaLabel="Scoring metric" />
              </div>
              <RailsEditor rails={rails} setRails={setRails} itemOpts={itemOpts} emblemOpts={emblemOpts} />
            </Section>
          </div>

          <div className="border-t border-border px-5 py-4">
            <button type="submit" disabled={creating}
              className="btn-press border-[3px] border-lime bg-lime/10 px-5 py-2.5 text-xs uppercase tracking-wide text-lime shadow-[4px_4px_0_0_#5a7a00] transition-colors hover:bg-lime/20 disabled:opacity-50">
              {creating ? "Creating…" : "Create scheduled event"}
            </button>
          </div>
        </form>

        {/* ─── Event list ─── */}
        <div className="lg:sticky lg:top-6">
        <h2 className="mb-3 text-xs uppercase tracking-wide text-cream">Events ({events.length})</h2>
        {loading ? (
          <div className="border border-border bg-bg-raised p-4"><div className="h-4 w-32 animate-pulse bg-border" /></div>
        ) : events.length === 0 ? (
          <div className="border border-border bg-bg-raised p-8 text-center"><p className="text-xs text-muted">No events yet</p></div>
        ) : (
          <div className="space-y-2">
            {events.map((ev) => (
              <div key={ev.id} className="border border-border bg-bg-raised px-4 py-3 shadow-[3px_3px_0_0_rgba(0,0,0,0.4)] transition-colors hover:border-border-light">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className={`shrink-0 border px-2 py-0.5 text-[10px] uppercase ${STATUS_STYLES[ev.status] ?? "border-border text-muted"}`}>{ev.status}</span>
                    <span className="truncate text-xs text-cream">{ev.slug}</span>
                    {!ev.auto_distribute && <span className="shrink-0 text-[9px] uppercase text-amber-400">hold</span>}
                    {ev.sponsor_brand && <span className="shrink-0 text-[10px] text-lime">· {ev.sponsor_brand}</span>}
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <a href={`/admin/events/${ev.id}`} className="border border-border px-2 py-0.5 text-[9px] uppercase text-muted transition-colors hover:border-lime/40 hover:text-lime">Manage</a>
                    <button onClick={() => cloneFrom(ev)} className="border border-border px-2 py-0.5 text-[9px] uppercase text-muted transition-colors hover:border-lime/40 hover:text-lime">Clone</button>
                    {ev.status === "scheduled" && <button onClick={() => action(ev.id, "start")} className="border border-lime/40 px-2 py-0.5 text-[9px] uppercase text-lime transition-colors hover:bg-lime/10">Start</button>}
                    {ev.status === "live" && <button onClick={() => action(ev.id, "end")} className="border border-amber-700/40 px-2 py-0.5 text-[9px] uppercase text-amber-400 transition-colors hover:bg-amber-900/20">End</button>}
                    {ev.status === "wrap" && <button onClick={() => action(ev.id, "release")} className="border border-lime/40 px-2 py-0.5 text-[9px] uppercase text-lime transition-colors hover:bg-lime/10">Release</button>}
                    {ev.status !== "live" && <button onClick={() => remove(ev.id)} className="border border-border px-2 py-0.5 text-[9px] uppercase text-muted transition-colors hover:border-red-800 hover:text-red-400">Delete</button>}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-dim">
                  <span>{ev.kind}</span>
                  <span>HP {ev.boss_max_hp.toLocaleString()}</span>
                  <span>DMG {ev.total_damage.toLocaleString()}</span>
                  <span>{ev.total_participants} devs</span>
                  {ev.outcome && <span className="uppercase">{ev.outcome}</span>}
                  <span>{new Date(ev.starts_at).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        </div>
        </div>
      </div>
    </div>
  );
}

// ─── Rails editor: collapsible cards with readable summaries ─────
function RailsEditor({ rails, setRails, itemOpts, emblemOpts }: { rails: Rail[]; setRails: (r: Rail[]) => void; itemOpts: Opt[]; emblemOpts: Opt[] }) {
  const [editing, setEditing] = useState<number | null>(null);
  const labelFor = (v: string | null) => itemOpts.find((o) => o.value === (v ?? ""))?.label ?? v ?? "No item";
  const emblemLabelFor = (v: string | null) => emblemOpts.find((o) => o.value === (v ?? ""))?.label ?? v ?? "";

  const update = (idx: number, patch: Partial<Rail>) => setRails(rails.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const updateSel = (idx: number, sel: Selector) => update(idx, { selector: sel });
  const updateBundle = (idx: number, patch: Partial<Rail["bundle"]>) => update(idx, { bundle: { ...rails[idx].bundle, ...patch } });
  const addRail = () => {
    const n = rails.length + 1;
    setRails([...rails, { id: `rail${n}`, selector: { type: "rank", min_rank: n, max_rank: n }, bundle: { pixels: 0, item_id: null, xp: 0 } }]);
    setEditing(rails.length);
  };
  const removeRail = (idx: number) => { setRails(rails.filter((_, i) => i !== idx)); setEditing(null); };

  return (
    <div className="space-y-2">
      {rails.map((r, idx) => {
        const sum = railSummary(r, labelFor, emblemLabelFor);
        const open = editing === idx;
        return (
          <div key={idx} className={`border bg-bg ${open ? "border-lime/40" : "border-border"}`}>
            {/* Header / summary */}
            <button type="button" onClick={() => setEditing(open ? null : idx)}
              className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-bg-raised">
              <span className="flex min-w-0 items-center gap-2">
                {sum.medal && <span className="text-sm">{sum.medal}</span>}
                <span className="truncate text-[11px] text-cream">{sum.who}</span>
                <span className="text-dim">→</span>
                <span className="truncate text-[11px] text-lime">{sum.reward}</span>
              </span>
              <span className={`shrink-0 text-[8px] text-muted transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
            </button>

            {/* Editor body */}
            {open && (
              <div className="space-y-3 border-t border-border px-3 py-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-[9px] uppercase text-muted">Rail id</label>
                    <input value={r.id} onChange={(e) => update(idx, { id: e.target.value })}
                      className="w-full border border-border bg-bg px-2 py-1.5 text-[11px] text-cream outline-none focus:border-lime" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[9px] uppercase text-muted">Who qualifies</label>
                    <PixelSelect value={r.selector.type} onChange={(v) => updateSel(idx, defaultSelector(v as Selector["type"]))}
                      options={SELECTOR_OPTS} ariaLabel="Selector type" />
                  </div>
                </div>

                <SelectorFields sel={r.selector} onChange={(s) => updateSel(idx, s)} />

                <div className="grid grid-cols-3 gap-3">
                  <NumField label="Pixels" value={r.bundle.pixels} onChange={(v) => updateBundle(idx, { pixels: v })} />
                  <NumField label="XP" value={r.bundle.xp} onChange={(v) => updateBundle(idx, { xp: v })} />
                  <div>
                    <label className="mb-1 block text-[9px] uppercase text-muted">Item</label>
                    <PixelSelect value={r.bundle.item_id ?? ""} onChange={(v) => updateBundle(idx, { item_id: v || null })}
                      options={itemOpts} ariaLabel="Reward item" />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-[9px] uppercase text-muted">Emblem · auto-granted to everyone on this rail</label>
                  <PixelSelect value={r.bundle.emblem_id ?? ""} onChange={(v) => updateBundle(idx, { emblem_id: v || null })}
                    options={emblemOpts} ariaLabel="Reward emblem" />
                </div>

                <button type="button" onClick={() => removeRail(idx)}
                  className="text-[10px] uppercase tracking-wide text-muted transition-colors hover:text-red-400">Remove rail</button>
              </div>
            )}
          </div>
        );
      })}

      <button type="button" onClick={addRail}
        className="w-full border border-dashed border-border py-2 text-[10px] uppercase tracking-wide text-muted transition-colors hover:border-lime/40 hover:text-lime">
        + Add rail
      </button>
    </div>
  );
}

function defaultSelector(type: Selector["type"]): Selector {
  switch (type) {
    case "all": return { type: "all", min_score: 1 };
    case "threshold": return { type: "threshold", min_score: 1000 };
    case "rank": return { type: "rank", min_rank: 1, max_rank: 1 };
    case "percentile": return { type: "percentile", cutoff_pct: 0.1 };
    case "collective_goal": return { type: "collective_goal" };
  }
}

function SelectorFields({ sel, onChange }: { sel: Selector; onChange: (s: Selector) => void }) {
  if (sel.type === "all")
    return <div className="grid grid-cols-2 gap-3"><NumField label="Min score" value={sel.min_score ?? 0} onChange={(v) => onChange({ type: "all", min_score: v })} /></div>;
  if (sel.type === "threshold")
    return <div className="grid grid-cols-2 gap-3"><NumField label="Min score" value={sel.min_score} onChange={(v) => onChange({ type: "threshold", min_score: v })} /></div>;
  if (sel.type === "rank")
    return (
      <div className="grid grid-cols-2 gap-3">
        <NumField label="From rank" value={sel.min_rank ?? 1} onChange={(v) => onChange({ type: "rank", min_rank: v, max_rank: sel.max_rank })} />
        <NumField label="To rank" value={sel.max_rank} onChange={(v) => onChange({ type: "rank", min_rank: sel.min_rank ?? 1, max_rank: v })} />
      </div>
    );
  if (sel.type === "percentile")
    return (
      <div className="grid grid-cols-2 gap-3">
        <NumField label="Top %" value={Math.round(sel.cutoff_pct * 100)} onChange={(v) => onChange({ type: "percentile", cutoff_pct: Math.max(1, Math.min(100, v)) / 100, min_qualified: sel.min_qualified })} />
        <NumField label="Min winners" value={sel.min_qualified ?? 0} onChange={(v) => onChange({ type: "percentile", cutoff_pct: sel.cutoff_pct, min_qualified: v })} />
      </div>
    );
  return <p className="text-[10px] leading-relaxed text-dim normal-case">Granted to every participant when the boss is defeated.</p>;
}
