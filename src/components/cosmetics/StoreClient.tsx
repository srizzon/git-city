"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { Cosmetic, CosmeticSet, CosmeticSlot, ShopSection } from "@/lib/cosmetics/types";
import { msUntilLeaving, isNewCosmetic } from "@/lib/cosmetics/types";
import { resolveLook } from "@/lib/cosmetics/look";
import type { ViewerContext } from "@/lib/cosmetics/viewer";
import type { ThumbItem } from "./ThumbnailFactory";
import { classifyItem } from "./itemRenderers";
import CurrencyIcon from "@/components/CurrencyIcon";
import { PixelSelect } from "@/components/ui/PixelSelect";

const CosmeticStage = dynamic(() => import("./CosmeticStage"), {
  ssr: false,
  loading: () => <div className="h-72 animate-pulse border-[3px] border-border bg-bg-raised sm:h-96 lg:h-[34rem]" />,
});
const ThumbnailFactory = dynamic(() => import("./ThumbnailFactory"), { ssr: false });

const ACCENT = "#c8e64a";
const SECTIONS: { key: ShopSection; label: string; blurb: string }[] = [
  { key: "building", label: "Building", blurb: "Make your tower stand out in the city." },
  { key: "battle", label: "Battle", blurb: "Gear you show off when you raid other cities." },
  { key: "boost", label: "Boosts", blurb: "Consumables that give you an edge in a raid." },
];
const BUILDING_SLOTS: { key: CosmeticSlot; label: string }[] = [
  { key: "crown", label: "Crown" },
  { key: "roof", label: "Roof" },
  { key: "aura", label: "Aura" },
  { key: "faces", label: "Faces" },
];
const RARITIES = ["common", "rare", "epic", "legendary"];
const RARITY_HEX: Record<string, string> = { common: "#9aa0aa", rare: "#38bdf8", epic: "#c084fc", legendary: "#fbbf24" };
const rarityHex = (r: string | null) => RARITY_HEX[r ?? ""] ?? "#3b414d";
// PX price at/above which a buy asks for a second confirming click.
const CONFIRM_THRESHOLD = 200;

export default function StoreClient({
  viewer,
  initialItems,
  initialCursor,
  sets,
  ownedLookCosmetics,
  onBalanceDelta,
  onTopUp,
}: {
  viewer: ViewerContext | null;
  initialItems: Cosmetic[];
  initialCursor: string | null;
  sets: CosmeticSet[];
  ownedLookCosmetics: Cosmetic[];
  /** Notify the parent (wallet pill) when PX is spent here. */
  onBalanceDelta?: (delta: number) => void;
  /** Open the in-place wallet/bank to top up PX. */
  onTopUp?: () => void;
}) {
  const [section, setSection] = useState<ShopSection>("building");
  const [items, setItems] = useState<Cosmetic[]>(initialItems);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [slot, setSlot] = useState<CosmeticSlot | "">("");
  const [rarity, setRarity] = useState("");
  const [setId, setSetId] = useState("");
  const [q, setQ] = useState("");
  const [hideOwned, setHideOwned] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(initialItems[0]?.id ?? null);
  const [owned, setOwned] = useState<Set<string>>(new Set(viewer?.ownedItems ?? []));
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; href?: string } | null>(null);
  const [localThumbs, setLocalThumbs] = useState<Record<string, string>>({});
  // Two-step confirm for pricier buys (id of the item awaiting confirmation).
  const [confirmId, setConfirmId] = useState<string | null>(null);

  // Persist the rarity / hide-owned filters across visits (Valorant lesson).
  useEffect(() => {
    try {
      const raw = localStorage.getItem("gc_store_filters");
      if (raw) { const f = JSON.parse(raw); if (typeof f.rarity === "string") setRarity(f.rarity); if (typeof f.hideOwned === "boolean") setHideOwned(f.hideOwned); }
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem("gc_store_filters", JSON.stringify({ rarity, hideOwned })); } catch { /* ignore */ }
  }, [rarity, hideOwned]);

  const fetchPage = useCallback(async (reset: boolean, nextCursor: string | null) => {
    const p = new URLSearchParams({ available: "1", limit: "24", section });
    if (section === "building" && slot) p.set("slot", slot);
    if (rarity) p.set("rarity", rarity);
    if (section === "building" && setId) p.set("set", setId);
    if (q.trim()) p.set("q", q.trim());
    if (!reset && nextCursor) p.set("cursor", nextCursor);
    if (reset) { setLoading(true); setError(null); }
    try {
      const res = await fetch(`/api/cosmetics?${p.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Couldn't load (${res.status})`);
      setItems((prev) => (reset ? data.items ?? [] : [...prev, ...(data.items ?? [])]));
      setCursor(data.nextCursor ?? null);
    } catch (e) {
      if (reset) setError(e instanceof Error ? e.message : "Couldn't load the shop");
    } finally {
      if (reset) setLoading(false);
    }
  }, [section, slot, rarity, setId, q]);

  const retry = () => fetchPage(true, null);

  // Refetch the first page whenever the section / filters change (debounced).
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    const t = setTimeout(() => { fetchPage(true, null); }, 200);
    return () => clearTimeout(t);
  }, [fetchPage]);

  // Keep a sensible selection inside the current section.
  useEffect(() => {
    if (items.length && !items.some((i) => i.id === selectedId)) setSelectedId(items[0].id);
  }, [items, selectedId]);

  // Cancel a pending buy-confirm when the selection or section changes.
  useEffect(() => { setConfirmId(null); }, [selectedId, section]);

  const sentinel = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !cursor) return;
    const io = new IntersectionObserver(async (entries) => {
      if (entries[0]?.isIntersecting && !loadingMore && cursor) {
        setLoadingMore(true);
        await fetchPage(false, cursor);
        setLoadingMore(false);
      }
    }, { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [cursor, loadingMore, fetchPage]);

  const visible = useMemo(() => (hideOwned ? items.filter((i) => !owned.has(i.id)) : items), [items, hideOwned, owned]);

  const nextThumb = useMemo<ThumbItem | null>(() => {
    const it = visible.find((i) => !i.thumbnail_url && !localThumbs[i.id] && classifyItem({ id: i.id, zone: i.slot }) !== "utility");
    return it ? { id: it.id, zone: it.slot, render_kind: it.render_kind, render_spec: it.render_spec as unknown as Record<string, unknown> } : null;
  }, [visible, localThumbs]);

  const byId = useMemo(() => {
    const m: Record<string, Cosmetic> = {};
    for (const c of [...ownedLookCosmetics, ...items]) m[c.id] = c;
    return m;
  }, [ownedLookCosmetics, items]);

  const selected = useMemo(() => items.find((i) => i.id === selectedId) ?? byId[selectedId ?? ""] ?? null, [items, byId, selectedId]);
  const selectedKind = useMemo(() => (selected ? classifyItem({ id: selected.id, zone: selected.slot }) : "building"), [selected]);

  const look = useMemo(() => resolveLook({
    byId,
    loadout: viewer?.loadout ?? { crown: null, roof: null, aura: null },
    owned: viewer?.ownedItems ?? [],
    billboardImages: viewer?.billboardImages ?? [],
    customColor: viewer?.customColor ?? null,
    preview: selectedKind === "building" || selectedKind === "tag" ? selected : null,
  }), [byId, viewer, selected, selectedKind]);

  function flash(msg: string, href?: string) { setToast({ msg, href }); setTimeout(() => setToast(null), href ? 5000 : 2800); }

  async function buyWithPixels(item: Cosmetic) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/pixels/spend", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item_id: item.id }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { flash(data?.error ?? "Purchase failed"); return; }
      setOwned((s) => new Set(s).add(item.id));
      onBalanceDelta?.(-(item.price_pixels ?? 0));
      flash(`Unlocked ${item.name}!`, viewer ? `/shop/${viewer.githubLogin}/customize` : undefined);
    } catch {
      flash("Network error — try again");
    } finally { setBusy(false); }
  }
  async function buyWithMoney(item: Cosmetic) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item_id: item.id, provider: "stripe" }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { flash(data?.error ?? "Checkout failed"); return; }
      if (data.url) window.location.href = data.url;
    } catch {
      flash("Network error — try again");
    } finally { setBusy(false); }
  }

  function changeSection(s: ShopSection) {
    if (s === section) return;
    setSection(s);
    setSlot(""); setSetId("");
    setItems([]); setCursor(null);
  }

  return (
    <div>
      {/* Category nav — the primary organiser (Valorant/League pattern). */}
      <div className="mb-4 flex flex-wrap items-center gap-x-1 gap-y-2 border-b border-border">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            onClick={() => changeSection(s.key)}
            className={`-mb-px border-b-2 px-4 py-2 text-[12px] uppercase tracking-wide transition-colors ${section === s.key ? "border-lime text-lime" : "border-transparent text-muted hover:text-cream"}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className={`grid grid-cols-1 gap-4 ${section === "boost" ? "" : "lg:grid-cols-[1fr_400px]"}`}>
        {/* ── Catalog ── */}
        <div>
          <p className="mb-3 text-[10px] text-muted normal-case">{SECTIONS.find((s) => s.key === section)!.blurb}</p>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="search…" className="min-w-[140px] flex-1 border-2 border-border bg-bg px-3 py-1.5 text-xs text-cream outline-none focus:border-lime" />
            {section === "building" && (
              <Select value={slot} onChange={(v) => setSlot(v as CosmeticSlot | "")} options={[["", "all slots"], ...BUILDING_SLOTS.map((s) => [s.key, s.label] as [string, string])]} />
            )}
            <Select value={rarity} onChange={setRarity} options={[["", "all rarity"], ...RARITIES.map((r) => [r, r] as [string, string])]} />
            {section === "building" && sets.length > 0 && (
              <Select value={setId} onChange={setSetId} options={[["", "all sets"], ...sets.map((s) => [s.id, s.name] as [string, string])]} />
            )}
            {viewer && (
              <button onClick={() => setHideOwned((v) => !v)} className={`border-2 px-2 py-1.5 text-[10px] uppercase ${hideOwned ? "border-lime text-lime" : "border-border text-muted hover:text-cream"}`}>hide owned</button>
            )}
          </div>

          {error ? (
            <div className="border-2 border-red-800/40 bg-red-900/10 p-8 text-center">
              <p className="text-xs text-red-400 normal-case">{error}</p>
              <button onClick={retry} className="mt-3 border-2 border-border px-4 py-1.5 text-[10px] uppercase text-cream hover:border-cream">Retry</button>
            </div>
          ) : loading ? (
            section === "boost" ? <BoostSkeleton /> : <SkeletonGrid />
          ) : visible.length === 0 ? (
            <div className="border-2 border-border bg-bg-raised p-8 text-center text-xs text-muted">Nothing here matches.</div>
          ) : section === "boost" ? (
            // Functional items have no 3D preview — info-rich cards with inline buy.
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {visible.map((it) => (
                <BoostCard key={it.id} item={it} owned={owned.has(it.id)} viewer={viewer} busy={busy} onBuyPixels={buyWithPixels} onBuyMoney={buyWithMoney} onTopUp={onTopUp} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
              {visible.map((it) => (
                <Card key={it.id} item={it} thumb={it.thumbnail_url ?? localThumbs[it.id]} selected={it.id === selectedId} owned={owned.has(it.id)} onClick={() => setSelectedId(it.id)} />
              ))}
            </div>
          )}
          <div ref={sentinel} className="h-10" />
          {loadingMore && <div className="py-3 text-center text-[10px] text-dim">loading more…</div>}
        </div>

        {/* ── Preview + buy (visual sections only) ── */}
        {section !== "boost" && (
          <div className="lg:sticky lg:top-4 lg:self-start">
            <CosmeticStage
              dims={viewer?.dims}
              cosmetics={look.cosmetics}
              faceColor={look.faceColor}
              focusSlot={selectedKind === "building" ? selected?.slot ?? null : null}
              kind={selectedKind === "utility" ? "building" : selectedKind}
              focusId={selected?.id}
              hint={selected ? "PREVIEW" : "SELECT AN ITEM"}
            />

            {selected && (
              <div className="mt-3 border-[3px] border-border bg-bg-raised p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm text-cream">{selected.name}</div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="border px-1.5 py-0.5 text-[9px] uppercase" style={{ borderColor: `${rarityHex(selected.rarity)}66`, color: rarityHex(selected.rarity) }}>{selected.rarity ?? "—"}</span>
                      {selected.slot && <span className="text-[9px] uppercase text-dim">{selected.slot}</span>}
                    </div>
                  </div>
                </div>
                {selected.description && <p className="mt-2.5 text-[11px] leading-relaxed text-cream-dark normal-case">{selected.description}</p>}

                <LeavingBadge cosmetic={selected} />

                <div className="mt-4">
                  {owned.has(selected.id) ? (
                    viewer ? (
                      <Link href={`/shop/${viewer.githubLogin}/customize`} className="block w-full border-2 border-lime bg-lime/10 px-4 py-2.5 text-center text-[10px] uppercase tracking-widest text-lime">Owned — Equip in Customize &rarr;</Link>
                    ) : (
                      <div className="border-2 border-lime/40 px-4 py-2.5 text-center text-[10px] uppercase text-lime">Owned</div>
                    )
                  ) : !viewer ? (
                    <Link href="/api/auth/github?redirect=/shop" className="block w-full px-4 py-2.5 text-center text-[10px] uppercase tracking-widest text-bg btn-press" style={{ backgroundColor: ACCENT, boxShadow: "3px 3px 0 0 #5a7a00" }}>Sign in to buy</Link>
                  ) : !viewer.claimed ? (
                    <div className="border-2 border-border px-4 py-2.5 text-center text-[10px] uppercase text-muted">Claim your building to buy</div>
                  ) : selected.price_pixels != null ? (
                    viewer.pxBalance < selected.price_pixels ? (
                      <div className="space-y-2">
                        <button onClick={() => onTopUp?.()} className="block w-full px-4 py-2.5 text-center text-[10px] uppercase tracking-widest text-bg btn-press" style={{ backgroundColor: ACCENT, boxShadow: "3px 3px 0 0 #5a7a00" }}>Get Pixels to unlock</button>
                        <BalanceLine price={selected.price_pixels} balance={viewer.pxBalance} />
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {confirmId === selected.id ? (
                          <button onClick={() => { buyWithPixels(selected); setConfirmId(null); }} disabled={busy} className="flex w-full items-center justify-center gap-1.5 border-2 border-lime bg-lime/15 px-4 py-2.5 text-[10px] uppercase tracking-widest text-lime disabled:opacity-40">
                            Tap again to confirm · <CurrencyIcon currency="pixels" size={12} /> {selected.price_pixels}
                          </button>
                        ) : (
                          <button onClick={() => (selected.price_pixels! >= CONFIRM_THRESHOLD ? setConfirmId(selected.id) : buyWithPixels(selected))} disabled={busy} className="flex w-full items-center justify-center gap-1.5 px-4 py-2.5 text-[10px] uppercase tracking-widest text-bg btn-press disabled:opacity-40" style={{ backgroundColor: ACCENT, boxShadow: "3px 3px 0 0 #5a7a00" }}>
                            Buy · <CurrencyIcon currency="pixels" size={13} /> {selected.price_pixels}
                          </button>
                        )}
                        <BalanceLine price={selected.price_pixels} balance={viewer.pxBalance} />
                      </div>
                    )
                  ) : selected.price_usd_cents > 0 ? (
                    <button onClick={() => buyWithMoney(selected)} disabled={busy} className="w-full px-4 py-2.5 text-[10px] uppercase tracking-widest text-bg btn-press disabled:opacity-40" style={{ backgroundColor: ACCENT, boxShadow: "3px 3px 0 0 #5a7a00" }}>Buy · ${(selected.price_usd_cents / 100).toFixed(2)}</button>
                  ) : (
                    <div className="border-2 border-border px-4 py-2.5 text-center text-[10px] uppercase text-muted">Earned through gameplay</div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <ThumbnailFactory next={nextThumb} onThumb={(id, url) => setLocalThumbs((t) => ({ ...t, [id]: url }))} />

      {toast && (
        <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
          <div className="flex items-center gap-3 border-2 border-lime bg-bg-raised px-4 py-2 text-[11px] text-lime shadow-lg">
            <span>{toast.msg}</span>
            {toast.href && <Link href={toast.href} className="shrink-0 border border-lime px-2 py-0.5 uppercase tracking-wide hover:bg-lime/10">Equip now &rarr;</Link>}
          </div>
        </div>
      )}
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="aspect-square animate-pulse border-2 border-border bg-bg-raised" />
      ))}
    </div>
  );
}

function BoostSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 animate-pulse border-2 border-border bg-bg-raised" />)}
    </div>
  );
}

function BalanceLine({ price, balance }: { price: number; balance: number }) {
  return (
    <p className="flex items-center justify-center gap-1 text-center text-[9px] normal-case text-dim">
      ≈ ${(price / 100).toFixed(2)} · you have <CurrencyIcon currency="pixels" size={11} /> {balance.toLocaleString()}
    </p>
  );
}

// Consumables are re-buyable; cosmetics are one-time. Mirrors the server rule.
const MULTI_BUY = new Set(["streak_freeze", "billboard"]);

// Functional item: no 3D, so the card itself carries effect + price + buy.
function BoostCard({ item, owned, viewer, busy, onBuyPixels, onBuyMoney, onTopUp }: {
  item: Cosmetic;
  owned: boolean;
  viewer: ViewerContext | null;
  busy: boolean;
  onBuyPixels: (item: Cosmetic) => void;
  onBuyMoney: (item: Cosmetic) => void;
  onTopUp?: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const rc = rarityHex(item.rarity);
  const showOwned = owned && !MULTI_BUY.has(item.id);
  const short = !!viewer && item.price_pixels != null && viewer.pxBalance < item.price_pixels;
  const buyStyle = { backgroundColor: ACCENT, boxShadow: "3px 3px 0 0 #5a7a00" };

  return (
    <div className="relative flex flex-col border-2 border-border bg-bg-raised p-4">
      <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: rc }} />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm text-cream">{item.name}</div>
          {item.description && <div className="mt-1 text-[11px] leading-snug text-cream-dark normal-case">{item.description}</div>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {isNewCosmetic(item) && <span className="border border-lime bg-lime/15 px-1 py-0.5 text-[8px] uppercase text-lime">new</span>}
          <span className="border px-1.5 py-0.5 text-[9px] uppercase" style={{ borderColor: `${rc}66`, color: rc }}>{item.rarity ?? "—"}</span>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/60 pt-3">
        <span className="flex items-center gap-1.5 text-[11px] text-cream">
          <span className="flex items-center gap-1">
            {item.price_pixels != null ? <><CurrencyIcon currency="pixels" size={12} /> {item.price_pixels}</> : item.price_usd_cents > 0 ? `$${(item.price_usd_cents / 100).toFixed(2)}` : "free"}
          </span>
          {item.remaining != null && <span className={`text-[9px] uppercase ${item.remaining > 0 ? "text-amber-400" : "text-red-400"}`}>{item.remaining > 0 ? `${item.remaining} left` : "sold out"}</span>}
        </span>
        {showOwned ? (
          <span className="border-2 border-lime/40 px-3 py-1.5 text-[9px] uppercase text-lime">Owned</span>
        ) : !viewer ? (
          <Link href="/api/auth/github?redirect=/shop" className="border-2 border-border px-3 py-1.5 text-[9px] uppercase text-cream hover:border-cream">Sign in</Link>
        ) : !viewer.claimed ? (
          <span className="text-[9px] uppercase text-muted">claim to buy</span>
        ) : item.price_pixels != null ? (
          short ? (
            <button onClick={() => onTopUp?.()} className="px-3 py-1.5 text-[9px] uppercase tracking-wide text-bg btn-press" style={buyStyle}>Get PX</button>
          ) : confirm ? (
            <button onClick={() => { onBuyPixels(item); setConfirm(false); }} disabled={busy} className="border-2 border-lime bg-lime/15 px-3 py-1.5 text-[9px] uppercase tracking-wide text-lime disabled:opacity-40">Confirm?</button>
          ) : (
            <button onClick={() => (item.price_pixels! >= CONFIRM_THRESHOLD ? setConfirm(true) : onBuyPixels(item))} disabled={busy} className="flex items-center gap-1 px-3 py-1.5 text-[9px] uppercase tracking-wide text-bg btn-press disabled:opacity-40" style={buyStyle}>
              Buy · <CurrencyIcon currency="pixels" size={10} /> {item.price_pixels}
            </button>
          )
        ) : item.price_usd_cents > 0 ? (
          <button onClick={() => onBuyMoney(item)} disabled={busy} className="px-3 py-1.5 text-[9px] uppercase tracking-wide text-bg btn-press disabled:opacity-40" style={buyStyle}>Buy · ${(item.price_usd_cents / 100).toFixed(2)}</button>
        ) : (
          <span className="text-[9px] uppercase text-muted">earned</span>
        )}
      </div>
    </div>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <PixelSelect
      value={String(value)}
      onChange={(v) => onChange(v)}
      options={options.map(([v, label]) => ({ value: v, label }))}
      className="w-36"
    />
  );
}

function Card({ item, thumb, selected, owned, onClick }: { item: Cosmetic; thumb?: string; selected: boolean; owned: boolean; onClick: () => void }) {
  const rc = rarityHex(item.rarity);
  return (
    <button onClick={onClick} className={`group relative flex aspect-square flex-col overflow-hidden border-2 text-left transition-colors ${selected ? "border-lime" : "border-border hover:border-cream/25"}`}>
      {thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumb} alt="" className={`absolute inset-0 h-full w-full object-cover ${owned ? "opacity-60" : ""}`} />
      ) : (
        <div className="absolute inset-0" style={{ background: `linear-gradient(155deg, ${rc}26, #0b0f17 72%)` }} />
      )}
      <span className="absolute inset-x-0 top-0 z-10 h-[3px]" style={{ background: rc }} />
      {owned ? (
        <span className="absolute right-1.5 top-1.5 z-10 border border-lime bg-bg/80 px-1 py-0.5 text-[8px] uppercase text-lime">owned</span>
      ) : isNewCosmetic(item) ? (
        <span className="absolute right-1.5 top-1.5 z-10 border border-lime bg-lime/15 px-1 py-0.5 text-[8px] uppercase text-lime">new</span>
      ) : null}
      <div className="relative z-10 mt-auto min-w-0 bg-gradient-to-t from-black/85 to-transparent p-2 pt-6">
        <div className="truncate text-xs text-cream">{item.name}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[9px] uppercase text-dim">
          <span className="flex items-center gap-1">
            {item.price_pixels != null ? (
              <><CurrencyIcon currency="pixels" size={10} /> {item.price_pixels}</>
            ) : item.price_usd_cents > 0 ? `$${(item.price_usd_cents / 100).toFixed(2)}` : "free"}
          </span>
          {item.remaining != null && (
            <span className={item.remaining > 0 ? "text-amber-400" : "text-red-400"}>· {item.remaining > 0 ? `${item.remaining} left` : "sold out"}</span>
          )}
        </div>
      </div>
    </button>
  );
}

function LeavingBadge({ cosmetic }: { cosmetic: Cosmetic }) {
  const ms = msUntilLeaving(cosmetic);
  if (ms == null) return null;
  const days = Math.ceil(ms / 86_400_000);
  return <div className="mt-3 border border-amber-500/40 bg-amber-500/5 px-2 py-1 text-[9px] uppercase text-amber-400">Leaving in {days}d</div>;
}
