"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import EmblemBadge from "@/components/profile/EmblemBadge";
import { PixelSelect } from "@/components/ui/PixelSelect";
import { Field, Section, inputCls } from "@/components/ui/form";
import { TIER_COLORS, TIER_ORDER } from "@/lib/achievement-tiers";

// ─── Types ───────────────────────────────────────────────────
interface Emblem {
  id: string;
  name: string;
  description: string;
  family: string;
  tier: string;
  glyph: string;
  is_counter: boolean;
  milestones: { count: number; tier: string }[] | null;
  criteria: { type: string; metric: string; gte: number } | null;
  xp_reward: number;
  unlock_item_id: string | null;
  active: boolean;
  sort_order: number;
}
interface Stats {
  holders: number;
  total_grants: number;
}
interface Meta {
  glyphs: string[];
  metrics: string[];
  tiers: string[];
  items: { id: string; name: string }[];
}
interface Form {
  id: string;
  name: string;
  description: string;
  family: string;
  tier: string;
  glyph: string;
  is_counter: boolean;
  milestones: { count: number; tier: string }[];
  criteriaMode: "push" | "threshold";
  metric: string;
  gte: number;
  xp_reward: number;
  unlock_item_id: string;
  active: boolean;
  sort_order: number;
}

const TIERS = ["bronze", "silver", "gold", "diamond"];

function emblemType(e: { is_counter: boolean; criteria: unknown }): "counter" | "auto" | "manual" {
  if (e.criteria) return "auto";
  if (e.is_counter) return "counter";
  return "manual";
}

function emptyForm(metrics: string[]): Form {
  return {
    id: "", name: "", description: "", family: "", tier: "bronze", glyph: "sparkle",
    is_counter: false, milestones: [], criteriaMode: "push",
    metric: metrics[0] ?? "contributions", gte: 100, xp_reward: 0,
    unlock_item_id: "", active: false, sort_order: 0,
  };
}
function toForm(e: Emblem, metrics: string[]): Form {
  return {
    id: e.id, name: e.name, description: e.description ?? "", family: e.family, tier: e.tier, glyph: e.glyph,
    is_counter: e.is_counter, milestones: e.milestones ?? [],
    criteriaMode: e.criteria ? "threshold" : "push",
    metric: e.criteria?.metric ?? metrics[0] ?? "contributions", gte: e.criteria?.gte ?? 100,
    xp_reward: e.xp_reward ?? 0, unlock_item_id: e.unlock_item_id ?? "", active: e.active, sort_order: e.sort_order ?? 0,
  };
}
function formPayload(f: Form) {
  return {
    id: f.id, name: f.name, description: f.description, family: f.family, tier: f.tier, glyph: f.glyph,
    is_counter: f.is_counter, milestones: f.is_counter ? f.milestones : null,
    criteria: f.criteriaMode === "threshold" ? { type: "threshold", metric: f.metric, gte: f.gte } : null,
    xp_reward: f.xp_reward, unlock_item_id: f.unlock_item_id || null, active: f.active, sort_order: f.sort_order,
  };
}

// ─── Component ───────────────────────────────────────────────
export default function EmblemsAdmin() {
  const [emblems, setEmblems] = useState<Emblem[]>([]);
  const [stats, setStats] = useState<Record<string, Stats>>({});
  const [meta, setMeta] = useState<Meta>({ glyphs: [], metrics: [], tiers: TIERS, items: [] });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [familyFilter, setFamilyFilter] = useState("");
  const [tierFilter, setTierFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [sort, setSort] = useState("family");

  const [editing, setEditing] = useState<Form | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [grantOpen, setGrantOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/emblems");
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const j = await res.json();
      setEmblems(j.emblems ?? []);
      setStats(j.stats ?? {});
      setMeta(j.meta ?? { glyphs: [], metrics: [], tiers: TIERS, items: [] });
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const families = useMemo(() => [...new Set(emblems.map((e) => e.family))].sort(), [emblems]);

  const summary = useMemo(() => {
    const live = emblems.filter((e) => e.active).length;
    const grants = Object.values(stats).reduce((a, s) => a + (s.total_grants ?? 0), 0);
    return { total: emblems.length, live, draft: emblems.length - live, grants };
  }, [emblems, stats]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return emblems.filter((e) => {
      if (familyFilter && e.family !== familyFilter) return false;
      if (tierFilter && e.tier !== tierFilter) return false;
      if (statusFilter === "live" && !e.active) return false;
      if (statusFilter === "draft" && e.active) return false;
      if (typeFilter && emblemType(e) !== typeFilter) return false;
      if (q && !e.id.includes(q) && !e.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [emblems, query, familyFilter, tierFilter, statusFilter, typeFilter]);

  const sortRows = useCallback(
    (arr: Emblem[]) => {
      const out = [...arr];
      if (sort === "name") out.sort((a, b) => a.name.localeCompare(b.name));
      else if (sort === "holders") out.sort((a, b) => (stats[b.id]?.holders ?? 0) - (stats[a.id]?.holders ?? 0));
      else if (sort === "tier") out.sort((a, b) => (TIER_ORDER[b.tier] ?? 0) - (TIER_ORDER[a.tier] ?? 0));
      else out.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
      return out;
    },
    [sort, stats],
  );

  const groups = useMemo(() => {
    if (sort !== "family") return null;
    const map = new Map<string, Emblem[]>();
    for (const e of filtered) {
      if (!map.has(e.family)) map.set(e.family, []);
      map.get(e.family)!.push(e);
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([family, list]) => ({ family, list: sortRows(list) }));
  }, [filtered, sort, sortRows]);

  const flat = useMemo(() => (sort === "family" ? [] : sortRows(filtered)), [filtered, sort, sortRows]);

  const openNew = () => { setEditing(emptyForm(meta.metrics)); setIsNew(true); setFormError(null); };
  const openEdit = (e: Emblem) => { setEditing(toForm(e, meta.metrics)); setIsNew(false); setFormError(null); };

  const toggleActive = async (e: Emblem) => {
    setEmblems((prev) => prev.map((x) => (x.id === e.id ? { ...x, active: !x.active } : x)));
    const res = await fetch(`/api/admin/emblems/${e.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !e.active }),
    });
    if (!res.ok) void load();
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true); setFormError(null);
    try {
      const res = isNew
        ? await fetch("/api/admin/emblems", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(formPayload(editing)) })
        : await fetch(`/api/admin/emblems/${editing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(formPayload(editing)) });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      setEditing(null);
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!editing || isNew) return;
    if (!confirm(`Delete emblem "${editing.id}"? This can't be undone.`)) return;
    setSaving(true); setFormError(null);
    try {
      const res = await fetch(`/api/admin/emblems/${editing.id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      setEditing(null);
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-base text-cream">Emblems</h1>
            <p className="mt-1 text-[11px] text-muted">Merit-honors catalog. Create, preview, organize, and grant.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setGrantOpen(true)} className="border border-border px-3 py-2 text-[11px] text-muted transition-colors hover:border-border-light hover:text-cream">
              Grant to dev
            </button>
            <button onClick={openNew} className="border border-lime bg-lime/10 px-3 py-2 text-[11px] text-lime transition-colors hover:bg-lime/20">
              + New emblem
            </button>
          </div>
        </div>

        {/* Stats strip */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Emblems" value={summary.total} />
          <Stat label="Live" value={summary.live} accent="text-lime" />
          <Stat label="Drafts" value={summary.draft} accent="text-dim" />
          <Stat label="Total grants" value={summary.grants} />
        </div>

        {/* Filter toolbar */}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search id or name…"
            className={`${inputCls} w-52`}
          />
          <PixelSelect value={familyFilter} onChange={setFamilyFilter} className="w-40" ariaLabel="Family"
            options={[{ value: "", label: "All families" }, ...families.map((f) => ({ value: f, label: f }))]} />
          <PixelSelect value={tierFilter} onChange={setTierFilter} className="w-32" ariaLabel="Tier"
            options={[{ value: "", label: "All tiers" }, ...TIERS.map((t) => ({ value: t, label: cap(t) }))]} />
          <PixelSelect value={statusFilter} onChange={setStatusFilter} className="w-36" ariaLabel="Status"
            options={[{ value: "", label: "Live + draft" }, { value: "live", label: "Live" }, { value: "draft", label: "Drafts" }]} />
          <PixelSelect value={typeFilter} onChange={setTypeFilter} className="w-32" ariaLabel="Type"
            options={[{ value: "", label: "All types" }, { value: "auto", label: "Auto" }, { value: "manual", label: "Manual" }, { value: "counter", label: "Counter" }]} />
          <PixelSelect value={sort} onChange={setSort} className="w-36" ariaLabel="Sort"
            options={[{ value: "family", label: "By family" }, { value: "name", label: "Name" }, { value: "holders", label: "Most held" }, { value: "tier", label: "Tier" }, { value: "order", label: "Sort order" }]} />
          <span className="ml-auto text-[10px] text-dim">{filtered.length} shown</span>
        </div>

        {loadError && <p className="mt-4 text-[11px] text-red-400">{loadError}</p>}

        {/* Body */}
        {loading ? (
          <p className="mt-10 text-[11px] text-muted">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="mt-10 text-[11px] text-muted">No emblems match these filters.</p>
        ) : sort === "family" ? (
          <div className="mt-5 space-y-6">
            {groups!.map(({ family, list }) => (
              <section key={family}>
                <div className="mb-2 flex items-center gap-2 border-b border-border pb-1.5">
                  <h2 className="text-[11px] uppercase tracking-wider text-cream-dark">{family}</h2>
                  <span className="text-[10px] text-dim">{list.length}</span>
                </div>
                <div className="space-y-1.5">
                  {list.map((e) => (
                    <EmblemRow key={e.id} e={e} s={stats[e.id]} onEdit={() => openEdit(e)} onToggle={() => toggleActive(e)} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="mt-5 space-y-1.5">
            {flat.map((e) => (
              <EmblemRow key={e.id} e={e} s={stats[e.id]} onEdit={() => openEdit(e)} onToggle={() => toggleActive(e)} />
            ))}
          </div>
        )}
      </div>

      {editing && (
        <EmblemSheet
          form={editing} setForm={setEditing} isNew={isNew} meta={meta} saving={saving}
          error={formError} onSave={save} onDelete={remove} onClose={() => setEditing(null)} stats={stats[editing.id]}
        />
      )}
      {grantOpen && <GrantPanel emblems={emblems} onClose={() => setGrantOpen(false)} />}
    </div>
  );
}

// ─── Pieces ──────────────────────────────────────────────────
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Stat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="border border-border bg-bg-raised px-3 py-2">
      <div className={`text-base ${accent ?? "text-cream"}`}>{value}</div>
      <div className="text-[9px] uppercase tracking-wider text-dim">{label}</div>
    </div>
  );
}

function TierChip({ tier }: { tier: string }) {
  const color = TIER_COLORS[tier] ?? "#8c8c9c";
  return (
    <span className="inline-flex items-center gap-1 text-[9px] text-muted">
      <span className="h-1.5 w-1.5" style={{ background: color }} />
      {cap(tier)}
    </span>
  );
}

function EmblemRow({ e, s, onEdit, onToggle }: { e: Emblem; s?: Stats; onEdit: () => void; onToggle: () => void }) {
  const type = emblemType(e);
  return (
    <div className="flex items-center gap-3 border border-border bg-bg-raised px-3 py-2 transition-colors hover:border-border-light">
      <button onClick={onEdit} className="shrink-0" title="Edit">
        <EmblemBadge tier={e.tier} glyph={e.glyph} count={e.is_counter ? Math.max(1, s?.total_grants ?? 1) : undefined} showCount={e.is_counter} size={40} />
      </button>
      <button onClick={onEdit} className="min-w-0 flex-1 text-left">
        <div className="truncate text-xs text-cream">{e.name}</div>
        <div className="truncate text-[9px] text-dim">{e.id}</div>
      </button>
      <div className="hidden shrink-0 items-center gap-3 sm:flex">
        <TierChip tier={e.tier} />
        <span className="w-14 text-[9px] uppercase tracking-wide text-dim">
          {type === "auto" ? "Auto" : type === "counter" ? "Counter" : "Manual"}
        </span>
        <span className="w-16 text-right text-[10px] text-muted" title="developers holding · total grants">
          {s?.holders ?? 0} held
        </span>
      </div>
      <button
        onClick={onToggle}
        className={`shrink-0 border px-2 py-1 text-[8px] uppercase tracking-wider transition-colors ${
          e.active ? "border-lime/50 text-lime hover:bg-lime/10" : "border-border text-dim hover:text-cream"
        }`}
        title="Toggle live/draft"
      >
        {e.active ? "Live" : "Draft"}
      </button>
      <button onClick={onEdit} className="shrink-0 text-[11px] text-dim hover:text-cream" title="Edit">
        Edit →
      </button>
    </div>
  );
}

// ─── Editor sheet ────────────────────────────────────────────
function EmblemSheet({
  form, setForm, isNew, meta, saving, error, onSave, onDelete, onClose, stats,
}: {
  form: Form; setForm: (f: Form) => void; isNew: boolean; meta: Meta; saving: boolean;
  error: string | null; onSave: () => void; onDelete: () => void; onClose: () => void; stats?: Stats;
}) {
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm({ ...form, [k]: v });

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => { if (ev.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-xl flex-col border-l-2 border-border-light bg-bg shadow-[-8px_0_0_0_rgba(0,0,0,0.4)]"
        onClick={(ev) => ev.stopPropagation()}
      >
        {/* Sticky header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div>
            <h2 className="text-xs text-cream">{isNew ? "New emblem" : form.name || form.id}</h2>
            {!isNew && <p className="text-[9px] text-dim">{form.id}</p>}
          </div>
          <button onClick={onClose} className="text-[11px] text-dim hover:text-cream">✕ close</button>
        </div>

        {/* Scrollable body */}
        <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-4">
          {/* Pinned preview */}
          <div className="mb-5 flex items-center gap-4 border border-border bg-bg-raised p-4">
            <EmblemBadge tier={form.tier} glyph={form.glyph} count={form.is_counter ? 3 : undefined} showCount={form.is_counter} size={72} />
            <div className="min-w-0">
              <div className="text-sm text-cream">{form.name || form.id || "Untitled"}</div>
              <div className="mt-0.5 text-[10px] text-dim">
                <span className="capitalize">{form.tier}</span> · {form.glyph}
                {form.is_counter ? " · counter (preview ×3)" : ""}
              </div>
              {!isNew && stats && (
                <div className="mt-1 text-[10px] text-muted">{stats.holders} dev(s) hold this · {stats.total_grants} total</div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <Section title="Identity">
              <div className="space-y-3">
                <Field label="ID" hint={isNew ? "lowercase a-z 0-9 _ · permanent" : "can't change"}>
                  <input value={form.id} disabled={!isNew} onChange={(e) => set("id", e.target.value.toLowerCase())} placeholder="commits_god" className={`${inputCls} disabled:opacity-50`} />
                </Field>
                <Field label="Name">
                  <input value={form.name} onChange={(e) => set("name", e.target.value)} className={inputCls} />
                </Field>
                <Field label="Description">
                  <textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} className={inputCls} />
                </Field>
                <Field label="Family" hint="groups it in the Trophy Case + here">
                  <input value={form.family} onChange={(e) => set("family", e.target.value)} placeholder="events" className={inputCls} />
                </Field>
              </div>
            </Section>

            <Section title="Appearance">
              <div className="space-y-3">
                <Field label="Tier" hint="frame color">
                  <PixelSelect value={form.tier} onChange={(v) => set("tier", v)} options={meta.tiers.map((t) => ({ value: t, label: cap(t) }))} ariaLabel="Tier" />
                </Field>
                <Field label="Glyph" hint="pick the icon">
                  <div className="scrollbar-thin grid max-h-44 grid-cols-7 gap-1.5 overflow-y-auto border border-border bg-bg p-2">
                    {meta.glyphs.map((g) => (
                      <button key={g} onClick={() => set("glyph", g)} title={g}
                        className={`flex items-center justify-center border p-1 transition-colors ${form.glyph === g ? "border-lime bg-lime/10" : "border-transparent hover:border-border-light"}`}>
                        <EmblemBadge tier={form.tier} glyph={g} size={26} />
                      </button>
                    ))}
                  </div>
                </Field>
              </div>
            </Section>

            <Section title="Behavior">
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-[11px] text-cream">
                  <input type="checkbox" checked={form.is_counter} onChange={(e) => set("is_counter", e.target.checked)} />
                  Counter emblem — shows a live number (e.g. &quot;3×&quot;)
                </label>
                {form.is_counter && (
                  <div className="border-l-2 border-border pl-3">
                    <div className="mb-1.5 text-[9px] uppercase tracking-wider text-dim">Milestones — frame upgrades as the count grows</div>
                    {form.milestones.map((m, i) => (
                      <div key={i} className="mb-1.5 flex items-center gap-2">
                        <input type="number" value={m.count} onChange={(e) => { const ms = [...form.milestones]; ms[i] = { ...m, count: parseInt(e.target.value || "0", 10) }; set("milestones", ms); }} className={`${inputCls} w-20`} placeholder="count" />
                        <PixelSelect value={m.tier} onChange={(v) => { const ms = [...form.milestones]; ms[i] = { ...m, tier: v }; set("milestones", ms); }} options={meta.tiers.map((t) => ({ value: t, label: cap(t) }))} className="w-28" ariaLabel="Milestone tier" />
                        <button onClick={() => set("milestones", form.milestones.filter((_, j) => j !== i))} className="text-[11px] text-dim hover:text-red-400">✕</button>
                      </div>
                    ))}
                    <button onClick={() => set("milestones", [...form.milestones, { count: 1, tier: "bronze" }])} className="mt-1 border border-border px-2 py-0.5 text-[9px] text-muted hover:text-cream">+ milestone</button>
                  </div>
                )}
                <Field label="Unlock rule" hint="how a dev earns it">
                  <div className="flex flex-col gap-1.5 text-[11px] text-cream">
                    <label className="flex items-center gap-1.5">
                      <input type="radio" checked={form.criteriaMode === "push"} onChange={() => set("criteriaMode", "push")} />
                      Push-only — granted by events or admin
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input type="radio" checked={form.criteriaMode === "threshold"} onChange={() => set("criteriaMode", "threshold")} />
                      Auto threshold — unlocks when a stat hits a value
                    </label>
                  </div>
                </Field>
                {form.criteriaMode === "threshold" && (
                  <div className="flex items-center gap-2 border-l-2 border-border pl-3">
                    <PixelSelect value={form.metric} onChange={(v) => set("metric", v)} options={meta.metrics.map((m) => ({ value: m, label: m }))} className="flex-1" ariaLabel="Metric" />
                    <span className="text-[11px] text-dim">≥</span>
                    <input type="number" value={form.gte} onChange={(e) => set("gte", parseInt(e.target.value || "0", 10))} className={`${inputCls} w-28`} />
                  </div>
                )}
              </div>
            </Section>

            <Section title="Rewards & status">
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="XP reward">
                    <input type="number" value={form.xp_reward} onChange={(e) => set("xp_reward", parseInt(e.target.value || "0", 10))} className={inputCls} />
                  </Field>
                  <Field label="Sort order">
                    <input type="number" value={form.sort_order} onChange={(e) => set("sort_order", parseInt(e.target.value || "0", 10))} className={inputCls} />
                  </Field>
                </div>
                <Field label="Unlocks item" hint="optional — also grants this free item">
                  <PixelSelect
                    value={form.unlock_item_id}
                    onChange={(v) => set("unlock_item_id", v)}
                    placeholder="None"
                    ariaLabel="Unlocks item"
                    options={[{ value: "", label: "None" }, ...meta.items.map((it) => ({ value: it.id, label: it.name, hint: it.id }))]}
                  />
                </Field>
                <label className="flex items-center gap-2 text-[11px] text-cream">
                  <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} />
                  Active — live & grantable (off = draft, hidden from players)
                </label>
              </div>
            </Section>
          </div>
        </div>

        {/* Sticky footer */}
        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          {!isNew ? (
            <button onClick={onDelete} disabled={saving} className="text-[10px] text-red-400/70 hover:text-red-400 disabled:opacity-40">Delete</button>
          ) : <span />}
          <div className="flex items-center gap-3">
            {error && <span className="text-[10px] text-red-400">{error}</span>}
            <button onClick={onClose} className="border border-border px-3 py-2 text-[10px] text-muted hover:text-cream">Cancel</button>
            <button onClick={onSave} disabled={saving} className="border border-lime bg-lime/10 px-3 py-2 text-[10px] text-lime hover:bg-lime/20 disabled:opacity-50">
              {saving ? "Saving…" : isNew ? "Create emblem" : "Save changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Manual grant / revoke ───────────────────────────────────
function GrantPanel({ emblems, onClose }: { emblems: Emblem[]; onClose: () => void }) {
  const [emblemId, setEmblemId] = useState(emblems[0]?.id ?? "");
  const [login, setLogin] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (action: "grant" | "revoke") => {
    setBusy(true); setResult(null); setError(null);
    try {
      const res = await fetch("/api/admin/emblems/grant", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, emblem_id: emblemId, github_login: login.trim() }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((j as { error?: string }).error ?? `HTTP ${res.status}`);
      if (action === "revoke") setResult(`Revoked ${emblemId} from @${login}.`);
      else setResult((j as { already_had?: boolean }).already_had ? `@${login} already had ${emblemId}.` : `Granted ${emblemId} to @${login}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-sm border-2 border-border-light bg-bg p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-xs text-cream">Grant emblem to a dev</h2>
          <button onClick={onClose} className="text-[11px] text-dim hover:text-cream">✕</button>
        </div>
        <p className="mt-1 text-[10px] text-muted">For gifts, partnerships or fixes. Idempotent per dev.</p>
        <div className="mt-4 space-y-3">
          <Field label="Emblem">
            <PixelSelect value={emblemId} onChange={setEmblemId} ariaLabel="Emblem"
              options={emblems.map((e) => ({ value: e.id, label: `${e.name} (${e.id})`, hint: e.active ? undefined : "draft" }))} />
          </Field>
          <Field label="GitHub login">
            <input value={login} onChange={(e) => setLogin(e.target.value)} placeholder="octocat" className={inputCls} />
          </Field>
        </div>
        {result && <p className="mt-3 text-[11px] text-lime">{result}</p>}
        {error && <p className="mt-3 text-[11px] text-red-400">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={() => submit("revoke")} disabled={busy || !login.trim()} className="border border-border px-3 py-2 text-[10px] text-red-400/70 hover:text-red-400 disabled:opacity-40">Revoke</button>
          <button onClick={() => submit("grant")} disabled={busy || !login.trim()} className="border border-lime bg-lime/10 px-3 py-2 text-[10px] text-lime hover:bg-lime/20 disabled:opacity-50">{busy ? "…" : "Grant"}</button>
        </div>
      </div>
    </div>
  );
}
