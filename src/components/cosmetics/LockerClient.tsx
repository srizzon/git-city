"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { Cosmetic } from "@/lib/cosmetics/types";
import { resolveLook } from "@/lib/cosmetics/look";
import type { LoadoutPreset } from "@/app/api/loadout/presets/route";
import type { ThumbItem } from "./ThumbnailFactory";
import { RAID_VEHICLE_ITEMS, RAID_TAG_ITEMS, RAID_BOOST_ITEMS } from "@/lib/zones";

const CosmeticStage = dynamic(() => import("./CosmeticStage"), {
  ssr: false,
  loading: () => <div className="h-72 animate-pulse border-[3px] border-border bg-bg-raised sm:h-96 lg:h-[34rem]" />,
});
const ThumbnailFactory = dynamic(() => import("./ThumbnailFactory"), { ssr: false });

const ACCENT = "#c8e64a";
const RARITY_HEX: Record<string, string> = { common: "#9aa0aa", rare: "#38bdf8", epic: "#c084fc", legendary: "#fbbf24" };
const rarityHex = (r: string | null) => RARITY_HEX[r ?? ""] ?? "#3b414d";

// Free defaults. The raid "airplane" id renders the CRT Terminal mesh.
const DEFAULT_VEHICLE = { id: "airplane", name: "CRT Terminal" };
const DEFAULT_TAG = { id: "default", name: "No Tag" };

type Loadout = { crown: string | null; roof: string | null; aura: string | null };
type RaidLoadout = { vehicle: string; tag: string };
type SlotKey = "crown" | "roof" | "aura" | "face" | "vehicle" | "tag";

const SLOTS: { key: SlotKey; label: string }[] = [
  { key: "crown", label: "Crown" },
  { key: "roof", label: "Roof" },
  { key: "aura", label: "Aura" },
  { key: "face", label: "Face" },
  { key: "vehicle", label: "Vehicle" },
  { key: "tag", label: "Tag" },
];

export default function LockerClient({
  dims,
  ownedCosmetics,
  initialLoadout,
  customColor: initialCustomColor,
  billboardImages,
  initialPresets,
  initialRaidLoadout,
  streakFreezes,
}: {
  dims: { width: number; height: number; depth: number };
  ownedCosmetics: Cosmetic[];
  initialLoadout: Loadout;
  customColor: string | null;
  billboardImages: string[];
  initialPresets: LoadoutPreset[];
  initialRaidLoadout: RaidLoadout;
  streakFreezes: number;
}) {
  const [slot, setSlot] = useState<SlotKey>("crown");
  const [loadout, setLoadout] = useState<Loadout>(initialLoadout);
  const [raidLoadout, setRaidLoadout] = useState<RaidLoadout>(initialRaidLoadout);
  const [hovered, setHovered] = useState<Cosmetic | null>(null);
  const [battleHover, setBattleHover] = useState<string | null>(null);
  const [customColor, setCustomColor] = useState<string | null>(initialCustomColor);
  const [presets, setPresets] = useState<LoadoutPreset[]>(initialPresets);
  const [presetName, setPresetName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [localThumbs, setLocalThumbs] = useState<Record<string, string>>({});

  const byId = useMemo(() => Object.fromEntries(ownedCosmetics.map((c) => [c.id, c])) as Record<string, Cosmetic>, [ownedCosmetics]);
  const owned = useMemo(() => ownedCosmetics.map((c) => c.id), [ownedCosmetics]);

  const optionsFor = useCallback((s: SlotKey) => {
    if (s === "vehicle") return ownedCosmetics.filter((c) => RAID_VEHICLE_ITEMS.includes(c.id));
    if (s === "tag") return ownedCosmetics.filter((c) => RAID_TAG_ITEMS.includes(c.id));
    return ownedCosmetics.filter((c) => c.slot === s);
  }, [ownedCosmetics]);

  const consumables = useMemo(() => ownedCosmetics.filter((c) => RAID_BOOST_ITEMS.includes(c.id) || c.id === "streak_freeze"), [ownedCosmetics]);
  // Billboard is temporarily disabled (no image upload yet) — exclude it.
  const facesOwned = useMemo(() => ownedCosmetics.filter((c) => c.slot === "faces" && c.id !== "custom_color" && c.id !== "billboard"), [ownedCosmetics]);
  const ownsCustomColor = owned.includes("custom_color");

  const thumbOf = useCallback((id?: string) => {
    if (!id) return undefined;
    return byId[id]?.thumbnail_url ?? localThumbs[id];
  }, [byId, localThumbs]);

  // What's equipped per slot (rail thumbnails / setup-at-a-glance).
  const equipped = useMemo(() => ({
    crown: loadout.crown ? { thumb: byId[loadout.crown]?.thumbnail_url ?? localThumbs[loadout.crown], name: byId[loadout.crown]?.name } : null,
    roof: loadout.roof ? { thumb: byId[loadout.roof]?.thumbnail_url ?? localThumbs[loadout.roof], name: byId[loadout.roof]?.name } : null,
    aura: loadout.aura ? { thumb: byId[loadout.aura]?.thumbnail_url ?? localThumbs[loadout.aura], name: byId[loadout.aura]?.name } : null,
    face: customColor ? { color: customColor } : facesOwned[0] ? { name: facesOwned[0].name } : null,
    vehicle: { thumb: byId[raidLoadout.vehicle]?.thumbnail_url ?? localThumbs[raidLoadout.vehicle], name: byId[raidLoadout.vehicle]?.name ?? DEFAULT_VEHICLE.name },
    tag: { thumb: byId[raidLoadout.tag]?.thumbnail_url ?? localThumbs[raidLoadout.tag], name: byId[raidLoadout.tag]?.name ?? DEFAULT_TAG.name },
  }), [byId, loadout, raidLoadout, customColor, facesOwned, localThumbs]);

  const look = useMemo(() => resolveLook({ byId, loadout, owned, billboardImages, customColor, preview: hovered }), [byId, loadout, owned, billboardImages, customColor, hovered]);

  // Bake thumbnails for building/vehicle/tag cards + the default CRT vehicle.
  const bakeTargets = useMemo<ThumbItem[]>(() => {
    const list = ownedCosmetics
      .filter((x) => !x.thumbnail_url && (["crown", "roof", "aura"].includes(x.slot ?? "") || RAID_VEHICLE_ITEMS.includes(x.id) || RAID_TAG_ITEMS.includes(x.id)))
      .map((x) => ({ id: x.id, zone: x.slot, render_kind: x.render_kind, render_spec: x.render_spec as unknown as Record<string, unknown> }));
    list.push({ id: DEFAULT_VEHICLE.id, zone: null, render_kind: "code", render_spec: {} });
    return list;
  }, [ownedCosmetics]);
  const nextThumb = useMemo<ThumbItem | null>(() => bakeTargets.find((t) => !localThumbs[t.id]) ?? null, [bakeTargets, localThumbs]);

  function flash(msg: string) { setToast(msg); setTimeout(() => setToast(null), 2400); }

  // Debounced loadout save: the UI updates instantly (optimistic), but rapid
  // try-on clicks are coalesced into one POST of the final state ~450ms after
  // you stop. This keeps the screen snappy and stays well under the per-IP
  // rate limit (no more 429s from clicking through items).
  const loadoutRef = useRef(loadout);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushLoadout = useCallback(async () => {
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    try {
      const res = await fetch("/api/loadout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(loadoutRef.current) });
      if (res.status === 429) { saveTimerRef.current = setTimeout(() => { flushLoadout(); }, 2500); return; } // coalesced too fast — retry shortly
      if (!res.ok) throw new Error();
    } catch { flash("Couldn't save — try again"); }
  }, []);

  const saveLoadout = useCallback((next: Loadout) => {
    setLoadout(next);
    loadoutRef.current = next;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { flushLoadout(); }, 450);
  }, [flushLoadout]);

  // Flush any pending save when leaving the screen (sendBeacon survives nav).
  useEffect(() => () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      try { navigator.sendBeacon?.("/api/loadout", new Blob([JSON.stringify(loadoutRef.current)], { type: "application/json" })); } catch { /* ignore */ }
    }
  }, []);

  const saveRaid = useCallback(async (next: RaidLoadout, label: string) => {
    const prev = raidLoadout; setRaidLoadout(next);
    try {
      const res = await fetch("/api/raid/loadout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
      if (!res.ok) throw new Error();
      flash(label);
    } catch { setRaidLoadout(prev); flash("Couldn't save — try again"); }
  }, [raidLoadout]);

  async function saveColor(color: string | null) {
    const prev = customColor; setCustomColor(color);
    try {
      const res = await fetch("/api/customizations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item_id: "custom_color", color }) });
      if (!res.ok) throw new Error();
    } catch { setCustomColor(prev); flash("Couldn't save color"); }
  }

  function pick(s: SlotKey, id: string | null) {
    if (s === "vehicle") saveRaid({ ...raidLoadout, vehicle: id ?? DEFAULT_VEHICLE.id }, "Vehicle equipped");
    else if (s === "tag") saveRaid({ ...raidLoadout, tag: id ?? DEFAULT_TAG.id }, id ? "Tag equipped" : "Tag removed");
    else if (s === "crown" || s === "roof" || s === "aura") {
      const unequipping = loadout[s] === id || id === null;
      saveLoadout({ ...loadout, [s]: loadout[s] === id ? null : id });
      flash(unequipping ? `${s[0].toUpperCase() + s.slice(1)} cleared` : `Equipped ${byId[id!]?.name ?? ""}`);
    }
  }
  function isActive(s: SlotKey, id: string): boolean {
    if (s === "vehicle") return raidLoadout.vehicle === id;
    if (s === "tag") return raidLoadout.tag === id;
    if (s === "crown" || s === "roof" || s === "aura") return loadout[s] === id;
    return false;
  }

  // A preset can reference items the developer no longer owns (or never did, from
  // older data). Resolve it to only what's currently owned so applying always
  // succeeds instead of failing the server ownership check and reverting.
  const ownedLoadout = useCallback((p: LoadoutPreset): Loadout => ({
    crown: p.crown && owned.includes(p.crown) ? p.crown : null,
    roof: p.roof && owned.includes(p.roof) ? p.roof : null,
    aura: p.aura && owned.includes(p.aura) ? p.aura : null,
  }), [owned]);

  // Which saved look matches what's equipped right now (for the active marker).
  const activePresetName = useMemo(() => {
    const match = presets.find((p) => {
      const f = ownedLoadout(p);
      return f.crown === loadout.crown && f.roof === loadout.roof && f.aura === loadout.aura;
    });
    return match?.name ?? null;
  }, [presets, loadout, ownedLoadout]);

  async function applyPreset(p: LoadoutPreset) {
    setConfirmDelete(null);
    const resolved = ownedLoadout(p);
    const dropped = (["crown", "roof", "aura"] as const).some((z) => p[z] && !resolved[z]);
    await saveLoadout(resolved);
    flash(dropped ? `Applied "${p.name}" (some items not owned)` : `Applied "${p.name}"`);
  }
  async function savePreset() {
    const name = presetName.trim(); if (!name) return;
    const next = [...presets.filter((p) => p.name !== name), { name, crown: loadout.crown, roof: loadout.roof, aura: loadout.aura }];
    setPresets(next); setPresetName("");
    const res = await fetch("/api/loadout/presets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ presets: next }) });
    if (res.ok) flash(`Saved "${name}"`); else { setPresets(presets); flash("Couldn't save"); }
  }
  async function deletePreset(name: string) {
    const prev = presets;
    const next = presets.filter((p) => p.name !== name); setPresets(next);
    try {
      const res = await fetch("/api/loadout/presets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ presets: next }) });
      if (!res.ok) throw new Error();
    } catch { setPresets(prev); flash("Couldn't delete"); }
  }

  // The Customize preview always frames the WHOLE building, so you see your full
  // setup (crown + roof + aura + face together), not just the focused slot.
  const stage = (() => {
    if (slot === "vehicle") return { kind: "vehicle" as const, focusId: battleHover ?? raidLoadout.vehicle, cosmetics: [], faceColor: null as string | null, focusSlot: null };
    if (slot === "tag") return { kind: "tag" as const, focusId: battleHover ?? raidLoadout.tag, cosmetics: look.cosmetics, faceColor: look.faceColor, focusSlot: null };
    return { kind: "building" as const, focusId: undefined, cosmetics: look.cosmetics, faceColor: look.faceColor, focusSlot: null };
  })();
  const isBattle = slot === "vehicle" || slot === "tag";

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[400px_1fr]">
      {/* ── Left: adaptive preview + saved looks ── */}
      <div className="lg:sticky lg:top-4 lg:self-start">
        <CosmeticStage dims={dims} cosmetics={stage.cosmetics} faceColor={stage.faceColor} kind={stage.kind} focusId={stage.focusId} focusSlot={stage.focusSlot} hint="YOUR SETUP" />

        <div className="mt-3 border-[3px] border-border bg-bg-raised p-4">
          <h2 className="text-xs text-cream">Saved Looks</h2>
          <p className="mt-0.5 text-[9px] text-muted normal-case">Save your building style and swap it in one click.</p>
          {presets.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {presets.map((p) => {
                const active = activePresetName === p.name;
                const confirming = confirmDelete === p.name;
                return (
                  <div
                    key={p.name}
                    onClick={() => applyPreset(p)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); applyPreset(p); } }}
                    title={active ? "Currently equipped" : `Apply "${p.name}"`}
                    className={`group relative cursor-pointer border-2 p-2.5 outline-none transition-colors ${active ? "border-lime bg-lime/10" : "border-border hover:border-cream/30 hover:bg-bg-card focus-visible:border-cream/40"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className={`truncate text-xs ${active ? "text-lime" : "text-cream"}`}>{p.name}</span>
                        {active ? (
                          <span className="shrink-0 border border-lime bg-lime/15 px-1.5 py-0.5 text-[8px] uppercase tracking-wide text-lime">Active</span>
                        ) : (
                          <span className="shrink-0 text-[8px] uppercase tracking-wide text-lime opacity-0 transition-opacity group-hover:opacity-100">Apply &rarr;</span>
                        )}
                      </div>
                      {confirming ? (
                        <div className="flex shrink-0 items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <span className="text-[8px] uppercase text-muted">Delete?</span>
                          <button onClick={() => { deletePreset(p.name); setConfirmDelete(null); }} className="border border-red-800 bg-red-900/30 px-2 py-0.5 text-[8px] uppercase text-red-400 hover:bg-red-900/50">Yes</button>
                          <button onClick={() => setConfirmDelete(null)} className="px-1 text-[8px] uppercase text-dim hover:text-cream">No</button>
                        </div>
                      ) : (
                        <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(p.name); }} title="Delete this look" className="shrink-0 border border-border px-1.5 py-0.5 text-[8px] uppercase text-dim transition-colors hover:border-red-800 hover:text-red-400">Del</button>
                      )}
                    </div>
                    {/* Mini-thumbnails of the look's crown / roof / aura. */}
                    <div className="mt-2 flex items-center gap-1">
                      {(["crown", "roof", "aura"] as const).map((z) => {
                        const id = p[z];
                        const thumb = id ? thumbOf(id) : undefined;
                        return (
                          <span key={z} className="flex h-7 w-7 items-center justify-center overflow-hidden border border-border bg-bg" title={`${z}: ${id ?? "none"}`}>
                            {thumb ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={thumb} alt={z} className="h-full w-full object-cover" />
                            ) : (
                              <span className="text-[8px] text-dim">{id ? "?" : "—"}</span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <input value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="name this look…" className="min-w-0 flex-1 border border-border bg-bg px-2 py-1.5 text-[11px] text-cream outline-none focus:border-lime" />
            <button onClick={savePreset} disabled={!presetName.trim()} className="shrink-0 border-2 px-3 py-1.5 text-[10px] uppercase disabled:opacity-40" style={{ borderColor: ACCENT, color: ACCENT }}>Save</button>
          </div>
        </div>
      </div>

      {/* ── Right: slot rail (setup at a glance) + focused slot ── */}
      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-xs uppercase text-cream">Your Setup</h2>
          <span className="text-[9px] uppercase text-dim">tap a slot to change it</span>
        </div>
        <div className="flex gap-2 overflow-x-auto border-b border-border pb-3">
          {SLOTS.map((s) => {
            const eq = equipped[s.key];
            const sel = slot === s.key;
            const thumb = eq && "thumb" in eq ? eq.thumb : undefined;
            const color = eq && "color" in eq ? eq.color : undefined;
            const name = eq && "name" in eq ? eq.name : undefined;
            return (
              <button key={s.key} title={`${s.label}: ${name ?? (color ? "color" : "empty")}`} onClick={() => setSlot(s.key)} className={`group flex w-[68px] shrink-0 flex-col items-center gap-1 ${sel ? "" : "opacity-80 hover:opacity-100"}`}>
                <div className={`relative flex h-14 w-14 items-center justify-center overflow-hidden border-2 ${sel ? "border-lime" : "border-border group-hover:border-cream/30"}`}>
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  ) : color ? (
                    <span className="h-7 w-7 rounded-full border border-border" style={{ background: color }} />
                  ) : name ? (
                    <span className="px-1 text-center text-[8px] uppercase leading-tight text-cream/70">{name}</span>
                  ) : (
                    <span className="text-xl text-dim group-hover:text-cream/50">+</span>
                  )}
                </div>
                <span className={`text-[9px] uppercase ${sel ? "text-lime" : "text-muted"}`}>{s.label}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-4">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-xs uppercase text-cream">{SLOTS.find((s) => s.key === slot)!.label}</h2>
            <span className="text-[9px] uppercase text-dim">{isBattle ? "shown when you raid" : "on your building"}</span>
          </div>

          {slot === "face" ? (
            <FaceControls ownsCustomColor={ownsCustomColor} customColor={customColor} onColor={saveColor} facesOwned={facesOwned} ownsBillboard={false} />
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
              {slot === "vehicle" && (
                <PickCard active={raidLoadout.vehicle === DEFAULT_VEHICLE.id} thumb={localThumbs[DEFAULT_VEHICLE.id]} name={DEFAULT_VEHICLE.name} sub="default" onClick={() => pick("vehicle", DEFAULT_VEHICLE.id)} onHover={() => setBattleHover(DEFAULT_VEHICLE.id)} onLeave={() => setBattleHover(null)} />
              )}
              {slot === "tag" && (
                <PickCard active={raidLoadout.tag === DEFAULT_TAG.id} name={DEFAULT_TAG.name} sub="default" onClick={() => pick("tag", DEFAULT_TAG.id)} onHover={() => setBattleHover(DEFAULT_TAG.id)} onLeave={() => setBattleHover(null)} />
              )}
              {(slot === "crown" || slot === "roof" || slot === "aura") && optionsFor(slot).length > 0 && (
                <PickCard active={!loadout[slot]} name="None" sub="unequip" onClick={() => pick(slot, null)} />
              )}

              {optionsFor(slot).map((c) => (
                <PickCard
                  key={c.id}
                  active={isActive(slot, c.id)}
                  thumb={thumbOf(c.id)}
                  rarity={c.rarity}
                  name={c.name}
                  onClick={() => pick(slot, c.id)}
                  onHover={() => isBattle ? setBattleHover(c.id) : setHovered(c)}
                  onLeave={() => isBattle ? setBattleHover(null) : setHovered(null)}
                />
              ))}

              {optionsFor(slot).length === 0 && !isBattle && (
                <div className="col-span-full border-2 border-border bg-bg-raised p-6 text-center text-[11px] text-muted normal-case">
                  No {SLOTS.find((s) => s.key === slot)!.label.toLowerCase()} items yet. <Link href="/shop" className="text-lime">Shop &rarr;</Link>
                </div>
              )}
            </div>
          )}

          {consumables.length > 0 && (
            <div className="mt-6 border-t border-border/60 pt-4">
              <div className="mb-2 flex items-baseline gap-2">
                <h3 className="text-[11px] uppercase text-cream">Consumables</h3>
                <span className="text-[9px] uppercase text-dim">used up in a raid</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {consumables.map((c) => {
                  const qty = c.id === "streak_freeze" ? streakFreezes : 1;
                  return (
                    <span key={c.id} className="flex items-center gap-2 border-2 border-border bg-bg-raised px-3 py-2 text-[10px] uppercase text-cream">
                      {c.name}
                      <span className="border border-lime/40 px-1 text-lime">×{qty}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <ThumbnailFactory next={nextThumb} onThumb={(id, url) => setLocalThumbs((t) => ({ ...t, [id]: url }))} />

      {toast && (
        <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
          <div className="border-2 border-lime bg-bg-raised px-4 py-2 text-[11px] text-lime shadow-lg">{toast}</div>
        </div>
      )}
    </div>
  );
}

function FaceControls({ ownsCustomColor, customColor, onColor, facesOwned, ownsBillboard }: {
  ownsCustomColor: boolean; customColor: string | null; onColor: (c: string | null) => void; facesOwned: Cosmetic[]; ownsBillboard: boolean;
}) {
  if (!ownsCustomColor && facesOwned.length === 0) {
    return <div className="border-2 border-border bg-bg-raised p-6 text-center text-[11px] text-muted normal-case">No face items yet. <Link href="/shop" className="text-lime">Shop &rarr;</Link></div>;
  }
  return (
    <div>
      <p className="mb-2 text-[9px] text-dim normal-case">Face decorations stay on your building while you own them. Custom Color tints your windows.</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
        {/* Custom color: a card whose face IS the chosen colour; click to pick. */}
        {ownsCustomColor && (
          <label className={`group relative flex aspect-square cursor-pointer flex-col overflow-hidden border-2 ${customColor ? "border-lime" : "border-border hover:border-cream/25"}`}>
            <div className="absolute inset-0" style={{ background: customColor ?? "linear-gradient(155deg, #c8e64a26, #0b0f17 72%)" }} />
            {customColor && <span className="absolute right-1.5 top-1.5 z-10 border border-lime bg-bg/80 px-1 py-0.5 text-[8px] uppercase text-lime">on</span>}
            <div className="relative z-10 mt-auto bg-gradient-to-t from-black/85 to-transparent p-2 pt-6">
              <div className="truncate text-xs text-cream">Custom Color</div>
              <div className="truncate text-[9px] uppercase text-dim">{customColor ?? "pick a color"}</div>
            </div>
            <input type="color" value={customColor ?? "#c8e64a"} onChange={(e) => onColor(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Custom color" />
          </label>
        )}
        {ownsCustomColor && customColor && (
          <button onClick={() => onColor(null)} className="flex aspect-square flex-col items-center justify-center gap-0.5 border-2 border-border text-[10px] uppercase text-muted transition-colors hover:border-red-800 hover:text-red-400">
            <span>Clear</span><span className="text-[8px] text-dim">color</span>
          </button>
        )}
        {/* LED banner / billboard: always-on decorations while owned. */}
        {facesOwned.map((c) => (
          <div key={c.id} className="relative flex aspect-square flex-col overflow-hidden border-2 border-lime">
            <div className="absolute inset-0" style={{ background: "linear-gradient(155deg, #c8e64a26, #0b0f17 72%)" }} />
            <span className="absolute right-1.5 top-1.5 z-10 border border-lime bg-bg/80 px-1 py-0.5 text-[8px] uppercase text-lime">on</span>
            <div className="relative z-10 mt-auto bg-gradient-to-t from-black/85 to-transparent p-2 pt-6">
              <div className="truncate text-xs text-cream">{c.name}</div>
              <div className="truncate text-[9px] uppercase text-dim">always on</div>
            </div>
          </div>
        ))}
      </div>
      {ownsBillboard && <p className="mt-2 text-[9px] text-dim normal-case">Billboard image management is coming here — your existing images stay live.</p>}
    </div>
  );
}

function PickCard({ active, thumb, rarity = null, name, sub, onClick, onHover, onLeave }: {
  active: boolean; thumb?: string; rarity?: string | null; name: string; sub?: string; onClick: () => void; onHover?: () => void; onLeave?: () => void;
}) {
  const rc = rarityHex(rarity);
  return (
    <button onClick={onClick} onMouseEnter={onHover} onMouseLeave={onLeave} className={`group relative flex aspect-square flex-col overflow-hidden border-2 text-left transition-colors ${active ? "border-lime" : "border-border hover:border-cream/25"}`}>
      {thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumb} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0" style={{ background: `linear-gradient(155deg, ${rc}26, #0b0f17 72%)` }} />
      )}
      <span className="absolute inset-x-0 top-0 z-10 h-[3px]" style={{ background: rc }} />
      {active && <span className="absolute right-1.5 top-1.5 z-10 border border-lime bg-bg/80 px-1 py-0.5 text-[8px] uppercase text-lime">active</span>}
      <div className="relative z-10 mt-auto bg-gradient-to-t from-black/85 to-transparent p-2 pt-6">
        <div className="truncate text-xs text-cream">{name}</div>
        {sub && <div className="truncate text-[9px] uppercase text-dim">{sub}</div>}
      </div>
    </button>
  );
}
