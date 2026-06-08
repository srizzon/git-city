"use client";
/* eslint-disable @next/next/no-img-element -- card thumbnails are generated
   data: URLs (already client-side bitmaps); next/image adds nothing here. */

import "@/lib/silenceThreeClockWarning";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { PREVIEW_THEMES, PreviewSky, PreviewGround, PreviewLights, PreviewBuilding, PreviewVehicle } from "@/components/cosmetics/previewScene";
import { buildingItemVisual, classifyItem, PREVIEW_BD, PREVIEW_VIEWS, type PreviewKind } from "@/components/cosmetics/itemRenderers";
import ThumbnailFactory, { type ThumbItem } from "@/components/cosmetics/ThumbnailFactory";
import RaidTag3D from "@/components/RaidTag3D";

// ─── Cosmetics Gallery (admin) ─────────────────────────────────
// Locker-style management + validation tool. Items are split into tabs by
// kind (Cosmetics / Vehicles / Tags / Utility). Visual kinds show a card
// grid + a single live 3D preview (one Canvas — WebGL context limit).
// Utility items (boosters/consumables) have no model, so they get a plain
// editable list instead of a faked 3D card.

interface CosmeticItem {
  id: string;
  name: string;
  description: string | null;
  category: string;
  zone: string | null;
  rarity: string | null;
  price_usd_cents: number;
  price_pixels: number | null;
  is_active: boolean;
  metadata: Record<string, unknown> | null;
}

const RARITY_ORDER: Record<string, number> = { legendary: 4, epic: 3, rare: 2, common: 1 };
const RARITY_STYLES: Record<string, string> = {
  common: "border-zinc-500/40 text-zinc-300",
  rare: "border-sky-500/40 text-sky-400",
  epic: "border-purple-500/40 text-purple-400",
  legendary: "border-amber-500/40 text-amber-400",
};
const RARITIES = ["common", "rare", "epic", "legendary"];
const RARITY_HEX: Record<string, string> = {
  common: "#9aa0aa", rare: "#38bdf8", epic: "#c084fc", legendary: "#fbbf24",
};
function rarityHex(r: string | null): string { return RARITY_HEX[r ?? ""] ?? "#3b414d"; }

const TABS: { key: PreviewKind; label: string }[] = [
  { key: "building", label: "Cosmetics" },
  { key: "vehicle", label: "Vehicles" },
  { key: "tag", label: "Tags" },
  { key: "utility", label: "Utility" },
];

// Emerald is the city's signature theme — default to it.
const DEFAULT_THEME_IDX = Math.max(0, PREVIEW_THEMES.findIndex((t) => t.name === "Emerald"));

function sourceLabel(it: CosmeticItem): string {
  if (it.metadata?.event_reward) return "Event reward";
  if (it.price_usd_cents > 0) return `$${(it.price_usd_cents / 100).toFixed(2)}${it.price_pixels ? ` · ${it.price_pixels}px` : ""}`;
  if (it.price_pixels) return `${it.price_pixels} px`;
  return "earned / free";
}

type SortKey = "name" | "rarity" | "zone" | "price" | "status";

export default function CosmeticsGallery() {
  const [items, setItems] = useState<CosmeticItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<PreviewKind>("building");

  // Filters / sort
  const [q, setQ] = useState("");
  const [zoneFilter, setZoneFilter] = useState("all");
  const [rarityFilter, setRarityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("zone");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Preview controls
  const [themeIdx, setThemeIdx] = useState(DEFAULT_THEME_IDX);
  const [showBuilding, setShowBuilding] = useState(true);
  const [autoRotate, setAutoRotate] = useState(true);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const theme = PREVIEW_THEMES[themeIdx];

  // Price draft (in pixels). USD is fixed-derived: 100 pixels = $1.00.
  const [priceDraft, setPriceDraft] = useState("");

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/cosmetics");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setItems(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const counts = useMemo(() => {
    const c: Record<PreviewKind, number> = { building: 0, vehicle: 0, tag: 0, utility: 0 };
    for (const i of items) c[classifyItem(i)]++;
    return c;
  }, [items]);

  // Zones present in the Cosmetics tab (for the zone filter dropdown).
  const zones = useMemo(
    () => ["all", ...Array.from(new Set(items.filter((i) => classifyItem(i) === "building").map((i) => i.zone ?? "other"))).sort()],
    [items]
  );

  const filtered = useMemo(() => {
    let list = items.filter((i) => {
      if (classifyItem(i) !== tab) return false;
      if (tab === "building" && zoneFilter !== "all" && (i.zone ?? "other") !== zoneFilter) return false;
      if (rarityFilter !== "all" && (i.rarity ?? "none") !== rarityFilter) return false;
      if (statusFilter === "live" && !i.is_active) return false;
      if (statusFilter === "draft" && i.is_active) return false;
      if (q && !`${i.name} ${i.id}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "rarity") cmp = (RARITY_ORDER[b.rarity ?? ""] ?? 0) - (RARITY_ORDER[a.rarity ?? ""] ?? 0);
      else if (sortKey === "zone") cmp = (a.zone ?? "z").localeCompare(b.zone ?? "z") || a.name.localeCompare(b.name);
      else if (sortKey === "price") cmp = (b.price_usd_cents || 0) - (a.price_usd_cents || 0);
      else if (sortKey === "status") cmp = Number(b.is_active) - Number(a.is_active);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [items, tab, zoneFilter, rarityFilter, statusFilter, q, sortKey, sortDir]);

  // Keep the selected item inside the current tab / filter (visual tabs).
  useEffect(() => {
    if (tab === "utility") return;
    if (!filtered.some((i) => i.id === selectedId)) {
      setSelectedId(filtered[0]?.id ?? null);
    }
  }, [tab, filtered, selectedId]);

  // Keyboard nav (↑/↓ move selection within the current grid)
  useEffect(() => {
    if (tab === "utility") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const idx = filtered.findIndex((i) => i.id === selectedId);
      const next = e.key === "ArrowDown" ? Math.min(filtered.length - 1, idx + 1) : Math.max(0, idx - 1);
      if (filtered[next]) setSelectedId(filtered[next].id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtered, selectedId, tab]);

  async function patchItem(id: string, patch: { is_active?: boolean; rarity?: string | null; price_usd_cents?: number; price_pixels?: number | null }) {
    setItems((arr) => arr.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    try {
      await fetch(`/api/admin/cosmetics/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
    } catch {
      fetchItems(); // resync on failure
    }
  }

  const selected = tab !== "utility" ? items.find((i) => i.id === selectedId) ?? null : null;
  const kind: PreviewKind = selected ? classifyItem(selected) : "building";

  // Focus the camera on the cosmetic: crown/roof items live near the top, so
  // raise the orbit target there instead of centering the whole tower.
  const view = useMemo(() => {
    const base = PREVIEW_VIEWS[kind];
    if (kind === "building" && selected) {
      if (selected.zone === "crown") return { ...base, cam: [40, 56, 56] as [number, number, number], target: [0, 46, 0] as [number, number, number], fov: 40, min: 18 };
      if (selected.zone === "roof") return { ...base, cam: [42, 54, 56] as [number, number, number], target: [0, 41, 0] as [number, number, number], fov: 40, min: 18 };
    }
    return base;
  }, [kind, selected]);

  // Card thumbnails: generated once per visual item by the offscreen factory.
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const visualItems = useMemo<ThumbItem[]>(
    () => items.filter((i) => classifyItem(i) !== "utility").map((i) => ({ id: i.id, zone: i.zone })),
    [items]
  );
  const nextThumb = visualItems.find((i) => !thumbs[i.id]) ?? null;

  // Reset the price draft when switching items.
  useEffect(() => {
    setPriceDraft(selected ? String(selected.price_pixels ?? selected.price_usd_cents ?? 0) : "");
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const resetView = useCallback(() => {
    const c = controlsRef.current;
    if (!c) return;
    c.target.set(...view.target);
    c.object.position.set(...view.cam);
    c.update();
  }, [view]);

  const liveCount = items.filter((i) => i.is_active).length;
  const selectClass = "border border-border bg-bg px-2 py-1 text-[11px] text-cream outline-none focus:border-lime";

  return (
    <div className="min-h-screen bg-bg p-4 text-cream sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-sm text-cream">Cosmetics</h1>
          <p className="text-[11px] text-muted">
            {items.length} total · <span className="text-lime">{liveCount} live</span>
          </p>
        </div>

        {error && <div className="mt-4 border border-red-800/30 bg-red-900/20 px-3 py-2 text-xs text-red-400">{error}</div>}

        {/* Offscreen: generates one card thumbnail at a time (WebGL ctx limit) */}
        <ThumbnailFactory next={nextThumb} onThumb={(id, url) => setThumbs((t) => ({ ...t, [id]: url }))} />

        {/* Tabs by kind */}
        <div className="mt-4 flex flex-wrap gap-1 border-b border-border">
          {TABS.map((t) => {
            const active = t.key === tab;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`-mb-px border-b-2 px-3 py-2 text-[10px] uppercase tracking-wide transition-colors ${active ? "border-lime text-lime" : "border-transparent text-muted hover:text-cream"}`}
              >
                {t.label} <span className={active ? "text-lime/60" : "text-dim"}>{counts[t.key]}</span>
              </button>
            );
          })}
        </div>

        {/* Toolbar */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="search name or id…"
            className="min-w-[160px] flex-1 border border-border bg-bg px-3 py-1.5 text-xs text-cream outline-none focus:border-lime"
          />
          {tab === "building" && (
            <select value={zoneFilter} onChange={(e) => setZoneFilter(e.target.value)} className={selectClass}>
              {zones.map((z) => <option key={z} value={z}>{z === "all" ? "all zones" : z}</option>)}
            </select>
          )}
          <select value={rarityFilter} onChange={(e) => setRarityFilter(e.target.value)} className={selectClass}>
            <option value="all">all rarity</option>
            {RARITIES.map((r) => <option key={r} value={r}>{r}</option>)}
            <option value="none">none</option>
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectClass}>
            <option value="all">all status</option>
            <option value="live">live</option>
            <option value="draft">draft</option>
          </select>
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} className={selectClass}>
            <option value="zone">sort: zone</option>
            <option value="name">sort: name</option>
            <option value="rarity">sort: rarity</option>
            <option value="price">sort: price</option>
            <option value="status">sort: status</option>
          </select>
          <button onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))} className="border border-border px-2 py-1 text-[11px] text-muted hover:text-cream">
            {sortDir === "asc" ? "↑" : "↓"}
          </button>
        </div>

        {loading ? (
          <div className="mt-4 border border-border bg-bg-raised p-4"><div className="h-4 w-32 animate-pulse bg-border" /></div>
        ) : tab === "utility" ? (
          /* ── Utility: plain editable list (no 3D) ── */
          <div className="mt-4">
            <div className="mb-1 px-1 text-[10px] text-dim">{filtered.length} shown</div>
            {filtered.length === 0 ? (
              <div className="border border-border bg-bg-raised p-6 text-center text-xs text-muted">No matches</div>
            ) : (
              <div className="border border-border">
                {filtered.map((it, i) => (
                  <div key={it.id} className={`flex flex-wrap items-center justify-between gap-3 bg-bg-raised px-3 py-2.5 ${i > 0 ? "border-t border-border" : ""}`}>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-xs text-cream">{it.name}</span>
                        <span className="shrink-0 text-[9px] uppercase text-dim">{it.category}</span>
                      </div>
                      {it.description && <div className="truncate text-[10px] text-dim normal-case">{it.description}</div>}
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-[10px]">
                      <span className="text-dim">{sourceLabel(it)}</span>
                      <select
                        value={it.rarity ?? ""}
                        onChange={(e) => patchItem(it.id, { rarity: e.target.value || null })}
                        className="border border-border bg-bg px-1.5 py-1 text-[10px] text-cream outline-none focus:border-lime"
                      >
                        <option value="">none</option>
                        {RARITIES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                      <button
                        onClick={() => patchItem(it.id, { is_active: !it.is_active })}
                        className={`border px-2 py-0.5 uppercase ${it.is_active ? "border-lime/40 text-lime" : "border-border text-muted hover:text-cream"}`}
                      >
                        {it.is_active ? "live" : "draft"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* ── Visual kinds: card grid + live preview ── */
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]">
            {/* Card grid */}
            <div>
              <div className="mb-1 px-1 text-[10px] text-dim">{filtered.length} shown · ↑↓ to navigate</div>
              {filtered.length === 0 ? (
                <div className="border border-border bg-bg-raised p-6 text-center text-xs text-muted">No matches</div>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {filtered.map((it) => {
                    const sel = it.id === selectedId;
                    const rc = rarityHex(it.rarity);
                    const thumb = thumbs[it.id];
                    return (
                      <button
                        key={it.id}
                        onClick={() => setSelectedId(it.id)}
                        className={`group relative flex aspect-square flex-col overflow-hidden border-2 text-left transition-colors ${sel ? "border-lime" : "border-border hover:border-cream/25"}`}
                      >
                        {thumb ? (
                          <img src={thumb} alt="" className="absolute inset-0 h-full w-full object-cover" />
                        ) : (
                          <div className="absolute inset-0" style={{ background: `linear-gradient(155deg, ${rc}26, #0b0f17 72%)` }} />
                        )}
                        <span className="absolute inset-x-0 top-0 z-10 h-[3px]" style={{ background: rc }} />
                        <div className="relative z-10 flex items-start justify-between gap-2 p-2">
                          <span className="border bg-bg/70 px-1 py-0.5 text-[8px] uppercase leading-none" style={{ borderColor: `${rc}66`, color: rc }}>
                            {it.rarity ?? "—"}
                          </span>
                          <span
                            role="button"
                            tabIndex={-1}
                            title={it.is_active ? "live — click to draft" : "draft — click to go live"}
                            onClick={(e) => { e.stopPropagation(); patchItem(it.id, { is_active: !it.is_active }); }}
                            className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full border ${it.is_active ? "border-lime bg-lime" : "border-border bg-bg/70 hover:border-cream"}`}
                          />
                        </div>
                        <div className="relative z-10 mt-auto min-w-0 bg-gradient-to-t from-black/85 to-transparent p-2 pt-6">
                          <div className="truncate text-xs text-cream">{it.name}</div>
                          <div className="truncate text-[9px] uppercase text-dim">{it.zone ?? tab}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Preview panel */}
            <div className="lg:sticky lg:top-6 lg:self-start">
              <div className="border border-border bg-bg-raised">
                {/* Canvas with overlaid controls */}
                <div className="relative aspect-square w-full" style={{ background: theme.fogColor }}>
                  {selected ? (
                    <Canvas key={`${selectedId}:${kind}`} camera={{ position: view.cam, fov: view.fov, near: 0.5, far: 2000 }}>
                      <fog attach="fog" args={[theme.fogColor, 400, 3500]} />
                      <PreviewSky stops={theme.sky} />
                      <PreviewLights theme={theme} />
                      {(kind === "building" || kind === "tag") && (
                        <PreviewGround color={theme.groundColor} grid={theme.grid} />
                      )}

                      {(kind === "building" || kind === "tag") && showBuilding && (
                        <PreviewBuilding theme={theme} faceOverride={selected.id === "custom_color" ? theme.accent : undefined} />
                      )}
                      {kind === "building" && buildingItemVisual(selected.id, { width: PREVIEW_BD.width, height: PREVIEW_BD.height, depth: PREVIEW_BD.depth, color: theme.accent, billboardImages: [] })}
                      {kind === "tag" && (
                        <RaidTag3D width={PREVIEW_BD.width} height={PREVIEW_BD.height} depth={PREVIEW_BD.depth} attackerLogin="preview" tagStyle={selected.id} />
                      )}
                      {kind === "vehicle" && <PreviewVehicle type={selected.id} />}

                      <OrbitControls
                        ref={controlsRef as never}
                        enableDamping
                        dampingFactor={0.06}
                        target={view.target}
                        minDistance={view.min}
                        maxDistance={view.max}
                        maxPolarAngle={Math.PI / 2.05}
                        autoRotate={autoRotate}
                        autoRotateSpeed={0.35}
                      />
                    </Canvas>
                  ) : (
                    <div className="flex h-full items-center justify-center text-[11px] text-dim">select a cosmetic</div>
                  )}

                  {/* Floating controls over the 3D (like a player) */}
                  {selected && (
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/70 to-transparent p-2">
                      <div className="pointer-events-auto flex flex-wrap gap-1.5">
                        <button onClick={() => setAutoRotate((v) => !v)} className={`border bg-bg/70 px-2 py-0.5 text-[9px] uppercase backdrop-blur-sm ${autoRotate ? "border-lime/50 text-lime" : "border-border text-muted hover:text-cream"}`}>
                          {autoRotate ? "rotating" : "rotate"}
                        </button>
                        <button onClick={resetView} className="border border-border bg-bg/70 px-2 py-0.5 text-[9px] uppercase text-muted backdrop-blur-sm hover:text-cream">
                          reset
                        </button>
                        {(kind === "building" || kind === "tag") && (
                          <button onClick={() => setShowBuilding((v) => !v)} className={`border bg-bg/70 px-2 py-0.5 text-[9px] uppercase backdrop-blur-sm ${showBuilding ? "border-lime/50 text-lime" : "border-border text-muted hover:text-cream"}`}>
                            building
                          </button>
                        )}
                      </div>
                      <div className="pointer-events-auto flex flex-wrap max-w-[120px] sm:max-w-[180px] md:max-w-none items-center justify-end gap-1 border border-border bg-bg/70 px-1.5 py-1 backdrop-blur-sm">
                        {PREVIEW_THEMES.map((th, i) => (
                          <button
                            key={th.name}
                            title={th.name}
                            onClick={() => setThemeIdx(i)}
                            className={`h-3 w-3 rounded-full border ${themeIdx === i ? "border-cream scale-110" : "border-transparent opacity-70 hover:opacity-100"}`}
                            style={{ background: th.accent }}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Detail + management */}
                {selected && (
                  <div className="border-t border-border p-4">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm leading-tight text-cream">{selected.name}</div>
                        <div className="mt-1 font-mono text-[9px] normal-case text-dim">{selected.id}</div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span className={`border px-1.5 py-0.5 text-[9px] uppercase ${selected.is_active ? "border-lime/40 text-lime" : "border-border text-muted"}`}>
                          {selected.is_active ? "live" : "draft"}
                        </span>
                        <span className={`border px-1.5 py-0.5 text-[9px] uppercase ${RARITY_STYLES[selected.rarity ?? ""] ?? "border-border text-dim"}`}>
                          {selected.rarity ?? "—"}
                        </span>
                      </div>
                    </div>

                    {selected.description && (
                      <p className="mt-2.5 text-[11px] leading-relaxed text-cream-dark normal-case">{selected.description}</p>
                    )}

                    {/* Read-only attributes */}
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {([["Zone", selected.zone ?? "—"], ["Category", selected.category]] as [string, string][]).map(([k, v]) => (
                        <div key={k} className="border border-border/60 px-3 py-2">
                          <div className="text-[9px] uppercase tracking-wide text-dim">{k}</div>
                          <div className="truncate text-[11px] text-cream normal-case">{v}</div>
                        </div>
                      ))}
                    </div>

                    {/* Editable fields */}
                    <div className="mt-3 space-y-3">
                      <div>
                        <label className="mb-1 block text-[9px] uppercase tracking-wide text-dim">Rarity</label>
                        <select
                          value={selected.rarity ?? ""}
                          onChange={(e) => patchItem(selected.id, { rarity: e.target.value || null })}
                          className="w-full border border-border bg-bg px-2 py-1.5 text-[11px] text-cream outline-none focus:border-lime"
                        >
                          <option value="">none</option>
                          {RARITIES.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-[9px] uppercase tracking-wide text-dim">Price (pixels)</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number" min="0" step="10"
                            value={priceDraft}
                            placeholder="0"
                            onChange={(e) => setPriceDraft(e.target.value)}
                            onBlur={() => {
                              const px = Math.max(0, Math.round(Number(priceDraft) || 0));
                              setPriceDraft(String(px));
                              if (px !== (selected.price_pixels ?? 0) || px !== (selected.price_usd_cents ?? 0)) {
                                patchItem(selected.id, { price_pixels: px, price_usd_cents: px });
                              }
                            }}
                            className="w-full border border-border bg-bg px-2 py-1.5 text-[11px] text-cream outline-none focus:border-lime"
                          />
                          <span className="shrink-0 whitespace-nowrap border border-border bg-bg px-2 py-1.5 text-[11px] text-cream-dark">
                            = ${((Math.max(0, Math.round(Number(priceDraft) || 0))) / 100).toFixed(2)}
                          </span>
                        </div>
                        <p className="mt-1 text-[9px] normal-case text-dim">Fixed rate: 100 pixels = $1.00. USD is set automatically.</p>
                      </div>
                    </div>

                    {/* Primary action */}
                    <button
                      onClick={() => patchItem(selected.id, { is_active: !selected.is_active })}
                      className={`mt-4 w-full border-2 px-4 py-2 text-[10px] uppercase tracking-widest transition-colors ${
                        selected.is_active
                          ? "border-border text-muted hover:border-red-800 hover:text-red-400"
                          : "border-lime bg-lime/10 text-lime hover:bg-lime/20"
                      }`}
                    >
                      {selected.is_active ? "Set to draft" : "Approve · go live"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
