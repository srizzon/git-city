"use client";
/* eslint-disable @next/next/no-img-element -- card thumbnails are generated
   data: URLs (already client-side bitmaps); next/image adds nothing here. */

import "@/lib/silenceThreeClockWarning";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { PREVIEW_THEMES, PreviewSky, PreviewGround, PreviewLights, PreviewBuilding, PreviewVehicle } from "@/components/cosmetics/previewScene";
import { cosmeticVisual, classifyItem, PREVIEW_BD, PREVIEW_VIEWS, type PreviewKind } from "@/components/cosmetics/itemRenderers";
import type { Cosmetic } from "@/lib/cosmetics/types";
import ThumbnailFactory, { type ThumbItem } from "@/components/cosmetics/ThumbnailFactory";
import RaidTag3D from "@/components/RaidTag3D";
import { PixelSelect } from "@/components/ui/PixelSelect";

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
  // Catalog/render metadata (migration 101)
  shop_section?: string | null;
  render_kind?: string | null;
  render_spec?: Record<string, unknown> | null;
  set_id?: string | null;
  season_id?: string | null;
  tags?: string[] | null;
  thumbnail_url?: string | null;
  available_from?: string | null;
  available_until?: string | null;
}

interface Taxonomy { id: string; name: string }

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

// ISO → value for <input type="datetime-local"> (local time, no seconds).
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

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
  const [sets, setSets] = useState<Taxonomy[]>([]);
  const [seasons, setSeasons] = useState<Taxonomy[]>([]);
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
  const [specDraft, setSpecDraft] = useState("");
  const [tagsDraft, setTagsDraft] = useState("");
  const [specError, setSpecError] = useState<string | null>(null);
  const [metaDraft, setMetaDraft] = useState("");
  const [metaError, setMetaError] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/cosmetics");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setItems(data.items ?? []);
      setSets(data.sets ?? []);
      setSeasons(data.seasons ?? []);
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

  async function patchItem(id: string, patch: Record<string, unknown>) {
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

  // Create a new (draft) cosmetic, then select it for editing.
  async function createCosmetic() {
    const id = window.prompt("New cosmetic id (lowercase a-z 0-9 _):")?.trim();
    if (!id) return;
    const res = await fetch("/api/admin/cosmetics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name: id, render_kind: "asset", zone: "roof" }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Create failed"); return; }
    await fetchItems();
    setTab("building");
    setSelectedId(id);
  }

  // Save an offscreen-baked PNG as a cosmetic's card thumbnail (Storage).
  const saveThumbnailData = useCallback(async (id: string, dataUrl: string) => {
    const res = await fetch(`/api/admin/cosmetics/${id}/thumbnail`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataUrl }),
    });
    const data = await res.json();
    if (res.ok) setItems((arr) => arr.map((x) => (x.id === id ? { ...x, thumbnail_url: data.thumbnail_url } : x)));
    else setError(data.error ?? "Thumbnail save failed");
    return res.ok;
  }, []);

  function saveThumbnail(id: string) {
    const dataUrl = thumbs[id];
    if (dataUrl) saveThumbnailData(id, dataUrl);
  }

  // Bake & upload every cosmetic's thumbnail in one pass. The factory already
  // generates them progressively into `thumbs`; this uploads the ones we have
  // and flips on auto-upload so the rest save as they finish rendering.
  const [autoBake, setAutoBake] = useState(false);
  async function bakeAll() {
    setAutoBake(true);
    for (const it of visualItems) {
      const url = thumbs[it.id];
      if (url) await saveThumbnailData(it.id, url);
    }
  }

  // Thumbnail generated by the offscreen factory: cache it, and upload too when
  // a "bake all" pass is running.
  const handleThumb = useCallback((id: string, url: string) => {
    setThumbs((t) => ({ ...t, [id]: url }));
    if (autoBake) saveThumbnailData(id, url);
  }, [autoBake, saveThumbnailData]);

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
    () => items.filter((i) => classifyItem(i) !== "utility").map((i) => ({ id: i.id, zone: i.zone, shop_section: i.shop_section, render_kind: i.render_kind, render_spec: i.render_spec })),
    [items]
  );
  const nextThumb = visualItems.find((i) => !thumbs[i.id]) ?? null;

  // Reset the editable drafts when switching items.
  useEffect(() => {
    setPriceDraft(selected ? String(selected.price_pixels ?? selected.price_usd_cents ?? 0) : "");
    setSpecDraft(selected ? JSON.stringify(selected.render_spec ?? { key: selected.id }, null, 2) : "");
    setTagsDraft(selected ? (selected.tags ?? []).join(", ") : "");
    setSpecError(null);
    setMetaDraft(selected ? JSON.stringify(selected.metadata ?? {}, null, 2) : "");
    setMetaError(null);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const resetView = useCallback(() => {
    const c = controlsRef.current;
    if (!c) return;
    c.target.set(...view.target);
    c.object.position.set(...view.cam);
    c.update();
  }, [view]);

  const liveCount = items.filter((i) => i.is_active).length;

  return (
    <div className="min-h-screen bg-bg p-4 text-cream sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-sm text-cream">Cosmetics</h1>
          <div className="flex items-center gap-3">
            <p className="text-[11px] text-muted">
              {items.length} total · <span className="text-lime">{liveCount} live</span> · {items.filter((i) => i.thumbnail_url).length}/{items.filter((i) => classifyItem(i) !== "utility").length} thumbs
            </p>
            <button onClick={bakeAll} className={`border-2 px-2.5 py-1 text-[10px] uppercase ${autoBake ? "border-lime bg-lime/10 text-lime" : "border-border text-muted hover:border-cream hover:text-cream"}`}>
              {autoBake ? "Baking…" : "Bake all"}
            </button>
            <button onClick={createCosmetic} className="border-2 border-lime px-2.5 py-1 text-[10px] uppercase text-lime hover:bg-lime/10">+ New</button>
          </div>
        </div>

        {error && <div className="mt-4 border border-red-800/30 bg-red-900/20 px-3 py-2 text-xs text-red-400">{error}</div>}

        {/* Offscreen: generates one card thumbnail at a time (WebGL ctx limit) */}
        <ThumbnailFactory next={nextThumb} onThumb={handleThumb} />

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
            <PixelSelect
              value={String(zoneFilter)}
              onChange={(v) => setZoneFilter(v)}
              options={zones.map((z) => ({ value: z, label: z === "all" ? "all zones" : z }))}
              ariaLabel="Zone filter"
              className="w-36"
            />
          )}
          <PixelSelect
            value={String(rarityFilter)}
            onChange={(v) => setRarityFilter(v)}
            options={[{ value: "all", label: "all rarity" }, ...RARITIES.map((r) => ({ value: r, label: r })), { value: "none", label: "none" }]}
            ariaLabel="Rarity filter"
            className="w-36"
          />
          <PixelSelect
            value={String(statusFilter)}
            onChange={(v) => setStatusFilter(v)}
            options={[{ value: "all", label: "all status" }, { value: "live", label: "live" }, { value: "draft", label: "draft" }]}
            ariaLabel="Status filter"
            className="w-36"
          />
          <PixelSelect
            value={String(sortKey)}
            onChange={(v) => setSortKey(v as SortKey)}
            options={[
              { value: "zone", label: "sort: zone" },
              { value: "name", label: "sort: name" },
              { value: "rarity", label: "sort: rarity" },
              { value: "price", label: "sort: price" },
              { value: "status", label: "sort: status" },
            ]}
            ariaLabel="Sort key"
            className="w-36"
          />
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
                      <PixelSelect
                        value={String(it.rarity ?? "")}
                        onChange={(v) => patchItem(it.id, { rarity: v || null })}
                        options={[{ value: "", label: "none" }, ...RARITIES.map((r) => ({ value: r, label: r }))]}
                        ariaLabel="Rarity"
                        className="w-28"
                      />
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
                      {kind === "building" && cosmeticVisual(
                        {
                          id: selected.id,
                          slot: (selected.zone ?? null) as Cosmetic["slot"],
                          render_kind: (selected.render_kind ?? "code") as Cosmetic["render_kind"],
                          render_spec: (selected.render_spec ?? { key: selected.id }) as unknown as Cosmetic["render_spec"],
                        },
                        { width: PREVIEW_BD.width, height: PREVIEW_BD.height, depth: PREVIEW_BD.depth, color: theme.accent, billboardImages: [] }
                      )}
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
                      <div className="pointer-events-auto flex items-center gap-1.5 border border-border bg-bg/70 px-1.5 py-1 backdrop-blur-sm">
                        {PREVIEW_THEMES.map((th, i) => (
                          <button
                            key={th.name}
                            title={th.name}
                            onClick={() => setThemeIdx(i)}
                            className={`h-3.5 w-3.5 rounded-full border ${themeIdx === i ? "border-cream" : "border-transparent"}`}
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
                        <PixelSelect
                          value={String(selected.rarity ?? "")}
                          onChange={(v) => patchItem(selected.id, { rarity: v || null })}
                          options={[{ value: "", label: "none" }, ...RARITIES.map((r) => ({ value: r, label: r }))]}
                          ariaLabel="Rarity"
                          className="w-full"
                        />
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

                    {/* ── Catalog / render (migration 101) ── */}
                    <div className="mt-4 space-y-3 border-t border-border/60 pt-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="mb-1 block text-[9px] uppercase tracking-wide text-dim">Slot</label>
                          <PixelSelect
                            value={String(selected.zone ?? "")}
                            onChange={(v) => patchItem(selected.id, { zone: v || null })}
                            options={[{ value: "", label: "none" }, ...["crown", "roof", "aura", "faces"].map((s) => ({ value: s, label: s }))]}
                            ariaLabel="Slot"
                            className="w-full"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[9px] uppercase tracking-wide text-dim">Render kind</label>
                          <PixelSelect
                            value={String(selected.render_kind ?? "code")}
                            onChange={(v) => patchItem(selected.id, { render_kind: v })}
                            options={["code", "asset", "template"].map((k) => ({ value: k, label: k }))}
                            ariaLabel="Render kind"
                            className="w-full"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[9px] uppercase tracking-wide text-dim">Shop section</label>
                          <PixelSelect
                            value={String(selected.shop_section ?? "")}
                            onChange={(v) => patchItem(selected.id, { shop_section: v || null })}
                            options={[{ value: "", label: "none" }, ...["building", "battle", "boost"].map((s) => ({ value: s, label: s }))]}
                            ariaLabel="Shop section"
                            className="w-full"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="mb-1 block text-[9px] uppercase tracking-wide text-dim">render_spec (JSON)</label>
                        <textarea
                          value={specDraft}
                          onChange={(e) => setSpecDraft(e.target.value)}
                          onBlur={() => {
                            try {
                              const parsed = JSON.parse(specDraft || "{}");
                              setSpecError(null);
                              patchItem(selected.id, { render_spec: parsed });
                            } catch { setSpecError("invalid JSON"); }
                          }}
                          rows={4}
                          spellCheck={false}
                          className="w-full resize-y border border-border bg-bg px-2 py-1.5 font-mono text-[10px] normal-case text-cream outline-none focus:border-lime"
                        />
                        {specError ? (
                          <p className="mt-1 text-[9px] text-red-400 normal-case">{specError}</p>
                        ) : (
                          <p className="mt-1 text-[9px] text-dim normal-case">asset: {`{model,attach,offset,scale,tint,animation}`} · template: {`{template,params}`} · code: {`{key}`}</p>
                        )}
                      </div>

                      <div>
                        <label className="mb-1 block text-[9px] uppercase tracking-wide text-dim">metadata (JSON)</label>
                        <textarea
                          value={metaDraft}
                          onChange={(e) => setMetaDraft(e.target.value)}
                          onBlur={() => {
                            try {
                              const parsed = JSON.parse(metaDraft || "{}");
                              setMetaError(null);
                              patchItem(selected.id, { metadata: parsed });
                            } catch { setMetaError("invalid JSON"); }
                          }}
                          rows={3}
                          spellCheck={false}
                          className="w-full resize-y border border-border bg-bg px-2 py-1.5 font-mono text-[10px] normal-case text-cream outline-none focus:border-lime"
                        />
                        {metaError ? (
                          <p className="mt-1 text-[9px] text-red-400 normal-case">{metaError}</p>
                        ) : (
                          <p className="mt-1 text-[9px] text-dim normal-case">vehicle: {`{"type":"raid_vehicle","emoji":"🏦"}`} · boost: {`{"type":"raid_boost","bonus":10}`}</p>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="mb-1 block text-[9px] uppercase tracking-wide text-dim">Set</label>
                          <PixelSelect
                            value={String(selected.set_id ?? "")}
                            onChange={(v) => patchItem(selected.id, { set_id: v })}
                            options={[{ value: "", label: "none" }, ...sets.map((s) => ({ value: s.id, label: s.name }))]}
                            ariaLabel="Set"
                            className="w-full"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[9px] uppercase tracking-wide text-dim">Season</label>
                          <PixelSelect
                            value={String(selected.season_id ?? "")}
                            onChange={(v) => patchItem(selected.id, { season_id: v })}
                            options={[{ value: "", label: "none" }, ...seasons.map((s) => ({ value: s.id, label: s.name }))]}
                            ariaLabel="Season"
                            className="w-full"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="mb-1 block text-[9px] uppercase tracking-wide text-dim">Tags (comma-separated)</label>
                        <input
                          value={tagsDraft}
                          onChange={(e) => setTagsDraft(e.target.value)}
                          onBlur={() => patchItem(selected.id, { tags: tagsDraft.split(",").map((t) => t.trim()).filter(Boolean) })}
                          placeholder="neon, glow, animated"
                          className="w-full border border-border bg-bg px-2 py-1.5 text-[11px] normal-case text-cream outline-none focus:border-lime"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="mb-1 block text-[9px] uppercase tracking-wide text-dim">Available from</label>
                          <input type="datetime-local" value={toLocalInput(selected.available_from)} onChange={(e) => patchItem(selected.id, { available_from: e.target.value ? new Date(e.target.value).toISOString() : null })} className="w-full border border-border bg-bg px-2 py-1.5 text-[10px] text-cream outline-none focus:border-lime" />
                        </div>
                        <div>
                          <label className="mb-1 block text-[9px] uppercase tracking-wide text-dim">Available until</label>
                          <input type="datetime-local" value={toLocalInput(selected.available_until)} onChange={(e) => patchItem(selected.id, { available_until: e.target.value ? new Date(e.target.value).toISOString() : null })} className="w-full border border-border bg-bg px-2 py-1.5 text-[10px] text-cream outline-none focus:border-lime" />
                        </div>
                      </div>

                      <button
                        onClick={() => saveThumbnail(selected.id)}
                        disabled={!thumbs[selected.id]}
                        className="w-full border border-border px-3 py-1.5 text-[10px] uppercase text-muted hover:border-cream hover:text-cream disabled:opacity-40"
                      >
                        {selected.thumbnail_url ? "Re-bake thumbnail" : "Bake & save thumbnail"}
                      </button>
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
