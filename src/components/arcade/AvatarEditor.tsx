"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { AvatarLoadout } from "@/lib/arcade/types";
import { cozyUrl } from "@/lib/arcade/assetBase";

// ─── Types ──────────────────────────────────────────────────
interface ShopItem {
  id: string;
  category: string;
  name: string;
  file: string | null;
  rarity: string;
  price_px: number;
  default_color: string | null;
  no_tint: boolean;
  tags: string[];
  slot: string;
  owned: boolean;
}

interface CategoryDef {
  id: string;
  label: string;
  slot: string | string[]; // which slot(s) to filter from shop items
  loadoutKey: string;      // key in AvatarLoadout for the item id
  colorKey?: string;       // key in AvatarLoadout for the color
  optional?: boolean;      // can be unequipped (accessories, makeup)
}

const CATEGORIES: CategoryDef[] = [
  { id: "skin", label: "Skin", slot: "__skin", loadoutKey: "skin_color" },
  { id: "hair", label: "Hair", slot: "hair", loadoutKey: "hair_id", colorKey: "hair_color" },
  { id: "top", label: "Top", slot: "top", loadoutKey: "clothes_top_id", colorKey: "clothes_top_color" },
  { id: "bottom", label: "Bottom", slot: "bottom", loadoutKey: "clothes_bottom_id", colorKey: "clothes_bottom_color" },
  { id: "shoes", label: "Shoes", slot: "shoes", loadoutKey: "shoes_id", colorKey: "shoes_color" },
  { id: "costume", label: "Costumes", slot: "costume", loadoutKey: "clothes_full_id", colorKey: "clothes_full_color", optional: true },
  { id: "hat", label: "Hat", slot: "hat", loadoutKey: "acc_hat_id", colorKey: "acc_hat_color", optional: true },
  { id: "glasses", label: "Glasses", slot: ["face", "mask"], loadoutKey: "acc_face_id", colorKey: "acc_face_color", optional: true },
  { id: "facial", label: "Facial", slot: "facial", loadoutKey: "acc_facial_id", colorKey: "acc_facial_color", optional: true },
  { id: "jewelry", label: "Jewelry", slot: "jewelry", loadoutKey: "acc_jewelry_id", colorKey: "acc_jewelry_color", optional: true },
  { id: "face", label: "Face", slot: ["blush", "lipstick", "eyes"], loadoutKey: "__face" },
  { id: "pets", label: "Pets", slot: "pet", loadoutKey: "pet_id", optional: true },
];

const SKIN_TONES = [
  { color: "#e8c4a0", label: "1" },
  { color: "#c4956a", label: "2" },
  { color: "#a0714f", label: "3" },
  { color: "#6b4226", label: "4" },
];

// Pre-defined color palettes
const COLOR_PALETTE = [
  "#1a1a1a", "#2c1810", "#4a3728", "#8B4513", "#D2691E",
  "#B22222", "#e74c3c", "#e91e63", "#FF69B4", "#9b59b6",
  "#4169E1", "#1a5276", "#4a9eff", "#2e7d32", "#c8e64a",
  "#FFD700", "#ff6600", "#f5d5b8", "#c0c0c0", "#ffd700",
];

const CELL = 32;
const DIR_ROW: Record<string, number> = { down: 0, up: 1, left: 3, right: 2 };

// PX packages for inline "Get PX" view
const PX_PACKAGES = [
  { id: "starter", name: "Starter", px: 100, price: "$1", priceBrl: "R$5" },
  { id: "value", name: "Value Pack", px: 525, price: "$5", priceBrl: "R$25", bonus: "+25 (5%)" },
  { id: "popular", name: "Popular", px: 1200, price: "$10", priceBrl: "R$50", bonus: "+200 (20%)", badge: "Most Popular" },
  { id: "mega", name: "Mega Pack", px: 2750, price: "$20", priceBrl: "R$99", bonus: "+750 (38%)", badge: "Best Value" },
];

// ─── Canvas tinting ─────────────────────────────────────────
// ─── Atlas-based sprite loading (1 request instead of 61) ───
let atlasImg: HTMLImageElement | null = null;
let atlasMap: Record<string, { x: number; y: number; w: number; h: number }> = {};
let atlasReady = false;
let atlasPromise: Promise<void> | null = null;

const tintCache = new Map<string, OffscreenCanvas>();

// Pet images loaded separately (different cell size)
const petImgCache = new Map<string, HTMLImageElement>();

function loadAtlas(): Promise<void> {
  if (atlasReady) return Promise.resolve();
  if (atlasPromise) return atlasPromise;

  atlasPromise = Promise.all([
    // Load atlas image
    new Promise<void>((res) => {
      const img = new Image();
      img.onload = () => { atlasImg = img; res(); };
      img.onerror = () => res();
      img.src = cozyUrl("walk/atlas.png");
    }),
    // Load atlas map
    fetch(cozyUrl("walk/atlas.json")).then((r) => r.json()).then((map) => { atlasMap = map; }).catch(() => {}),
  ]).then(() => { atlasReady = true; });

  return atlasPromise;
}

function loadPetImg(file: string): Promise<HTMLImageElement> {
  if (petImgCache.has(file)) return Promise.resolve(petImgCache.get(file)!);
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => { petImgCache.set(file, img); res(img); };
    img.onerror = rej;
    img.src = cozyUrl(file);
  });
}

function getTintedRegion(file: string, color: string, sx: number, sy: number, sw: number, sh: number): OffscreenCanvas | null {
  if (!atlasImg) return null;
  const entry = atlasMap[file];
  if (!entry) return null;

  const key = `${file}|${color}|${sx}|${sy}`;
  if (tintCache.has(key)) return tintCache.get(key)!;

  const oc = new OffscreenCanvas(sw, sh);
  const ctx = oc.getContext("2d")!;
  // Source: atlas position + offset within the item sprite
  ctx.drawImage(atlasImg, entry.x + sx, entry.y + sy, sw, sh, 0, 0, sw, sh);
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, sw, sh);
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(atlasImg, entry.x + sx, entry.y + sy, sw, sh, 0, 0, sw, sh);

  tintCache.set(key, oc);
  return oc;
}

// Draw a sprite from the atlas onto a target canvas
function drawFromAtlas(
  ctx: CanvasRenderingContext2D,
  file: string,
  color: string | null,
  noTint: boolean,
  sx: number, sy: number, sw: number, sh: number,
  dx: number, dy: number, dw: number, dh: number,
) {
  if (!atlasImg) return;
  const entry = atlasMap[file];
  if (!entry) return;

  if (noTint || !color) {
    ctx.drawImage(atlasImg, entry.x + sx, entry.y + sy, sw, sh, dx, dy, dw, dh);
  } else {
    const tinted = getTintedRegion(file, color, sx, sy, sw, sh);
    if (tinted) ctx.drawImage(tinted, 0, 0, sw, sh, dx, dy, dw, dh);
  }
}


// ─── Sidebar icon (static, renders once) ────────────────────
// Shows a representative sprite for each category
const SIDEBAR_ICONS: Record<string, string> = {
  skin: "__skin",
  hair: "buzzcut",
  top: "basic",
  bottom: "pants",
  shoes: "shoes",
  costume: "clown_red",
  hat: "hat_cowboy",
  glasses: "glasses",
  facial: "beard",
  jewelry: "earring_emerald",
  face: "blush",
  pets: "cat",
};

function SidebarIcon({ catId, items, skinColor, ready }: { catId: string; items: ShopItem[]; skinColor: string; ready: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawnRef = useRef(false);

  useEffect(() => {
    if (drawnRef.current || !ready || !items.length) return;
    if (catId === "skin") return;

    const iconId = SIDEBAR_ICONS[catId];
    const item = items.find((i) => i.id === iconId);
    if (!item?.file) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    if (item.slot === "pet") {
      // Pets loaded separately
      loadPetImg(item.file).then((img) => {
        ctx.drawImage(img, 0, 0, 18, 18, 0, 0, 24, 24);
        drawnRef.current = true;
      }).catch(() => {});
    } else {
      drawFromAtlas(ctx, item.file, item.default_color, item.no_tint, 0, 0, CELL, CELL, 0, 0, 24, 24);
      drawnRef.current = true;
    }
  }, [catId, items, ready]);

  if (catId === "skin") {
    return <div className="w-6 h-6 rounded-full flex-shrink-0 border border-gray-300" style={{ background: skinColor }} />;
  }

  return (
    <canvas
      ref={canvasRef}
      width={24} height={24}
      className="flex-shrink-0"
      style={{ imageRendering: "pixelated" }}
    />
  );
}

// ─── Purchase Summary ───────────────────────────────────────
function PurchaseSummary({
  loadout, items, balance, buying, saving, showPxPacks,
  onBuyAll, onGetPx, onSave, onCancel,
}: {
  loadout: AvatarLoadout;
  items: ShopItem[];
  balance: number;
  buying: string | null;
  saving: boolean;
  showPxPacks: boolean;
  onBuyAll: (items: ShopItem[]) => void;
  onGetPx: () => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  // Find unowned items that are ACTUALLY VISIBLE on the character
  // If costume is equipped, top/bottom/shoes are hidden (costume covers them)
  const hasCostume = !!loadout.clothes_full_id;
  const visibleSlotKeys: (keyof AvatarLoadout)[] = [
    "hair_id",
    // Clothes: costume OR top+bottom+shoes, not both
    ...(hasCostume
      ? ["clothes_full_id" as keyof AvatarLoadout]
      : ["clothes_top_id" as keyof AvatarLoadout, "clothes_bottom_id" as keyof AvatarLoadout, "shoes_id" as keyof AvatarLoadout]
    ),
    "acc_hat_id", "acc_face_id", "acc_facial_id", "acc_jewelry_id",
    "blush_id", "lipstick_id", "pet_id",
  ];

  const toBuy: ShopItem[] = [];
  const seen = new Set<string>();
  for (const key of visibleSlotKeys) {
    const id = loadout[key] as string | null;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const item = items.find((i) => i.id === id);
    if (item && !item.owned && item.price_px > 0) toBuy.push(item);
  }

  const totalCost = toBuy.reduce((sum, i) => sum + i.price_px, 0);
  const remaining = balance - totalCost;
  const canAfford = remaining >= 0;
  const hasPurchases = toBuy.length > 0;

  return (
    <div className="border-t border-gray-200 px-4 py-3">
      {/* Balance */}
      <div className="flex justify-between items-center mb-2">
        <span className="text-[10px] text-gray-400 uppercase">Balance</span>
        <span className="text-xs font-bold text-gray-800">{balance.toLocaleString()} PX</span>
      </div>

      {/* Items to buy */}
      {hasPurchases && (
        <div className="mb-2 space-y-0.5">
          <span className="text-[10px] text-gray-400 uppercase">To buy ({toBuy.length})</span>
          {toBuy.map((item) => (
            <div key={item.id} className="flex justify-between items-center text-[10px]">
              <span className="text-gray-600 truncate">{item.name}</span>
              <span className="text-amber-600 font-bold flex-shrink-0 ml-2">-{item.price_px}</span>
            </div>
          ))}
          <div className="flex justify-between items-center pt-1.5 border-t border-gray-200 mt-1">
            <span className="text-[10px] text-gray-500 font-bold">Total</span>
            <span className={`text-xs font-bold ${canAfford ? "text-gray-800" : "text-red-500"}`}>
              {canAfford ? `${remaining.toLocaleString()} PX left` : `Need ${Math.abs(remaining).toLocaleString()} more`}
            </span>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-col gap-1.5 mt-3">
        {hasPurchases ? (
          canAfford ? (
            confirming ? (
              <>
                <div className="text-[10px] text-center text-amber-700 mb-1">
                  Buy {toBuy.length} item{toBuy.length > 1 ? "s" : ""} for {totalCost} PX?
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setConfirming(false)}
                    className="flex-1 px-2 py-2 text-xs text-gray-500 border border-gray-200 rounded hover:bg-gray-100 cursor-pointer"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => { onBuyAll(toBuy); setConfirming(false); }}
                    disabled={!!buying}
                    className="flex-1 px-2 py-2 bg-green-600 text-white text-xs font-medium rounded hover:bg-green-700 disabled:opacity-50 cursor-pointer"
                  >
                    {buying ? "Buying..." : "Confirm"}
                  </button>
                </div>
              </>
            ) : (
              <button
                onClick={() => setConfirming(true)}
                className="w-full px-3 py-2 bg-blue-500 text-white text-xs font-medium rounded hover:bg-blue-600 cursor-pointer"
              >
                Buy & Save ({totalCost} PX)
              </button>
            )
          ) : (
            <button
              onClick={onGetPx}
              className="w-full px-3 py-2 bg-amber-500 text-white text-xs font-medium rounded hover:bg-amber-600 cursor-pointer"
            >
              Get PX
            </button>
          )
        ) : (
          <button
            onClick={onSave}
            disabled={saving}
            className="w-full px-3 py-2 bg-blue-500 text-white text-xs font-medium rounded hover:bg-blue-600 disabled:opacity-50 cursor-pointer"
          >
            {saving ? "Saving..." : "Done"}
          </button>
        )}
        <button
          onClick={onCancel}
          className="w-full px-3 py-1.5 text-[10px] text-gray-400 hover:text-gray-600 cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────
interface AvatarEditorProps {
  onClose: () => void;
  onSave: (loadout: AvatarLoadout) => void;
  initialLoadout: AvatarLoadout;
  playerName: string;
}

export default function AvatarEditor({ onClose, onSave, initialLoadout, playerName }: AvatarEditorProps) {
  const [items, setItems] = useState<ShopItem[]>([]);
  const [balance, setBalance] = useState(0);
  const [loadout, setLoadout] = useState<AvatarLoadout>({ ...initialLoadout });
  const [activeCategory, setActiveCategory] = useState("skin");
  const [previewDir, setPreviewDir] = useState<"down" | "left" | "up" | "right">("down");
  const [saving, setSaving] = useState(false);
  const [buying, setBuying] = useState<string | null>(null);
  const [showPxPacks, setShowPxPacks] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const itemCanvasRefs = useRef<Map<string, HTMLCanvasElement>>(new Map());

  const [imagesReady, setImagesReady] = useState(false);

  // Load shop data + atlas (2 requests total: API + atlas PNG+JSON)
  useEffect(() => {
    Promise.all([
      fetch("/api/arcade/shop").then((r) => r.json()),
      loadAtlas(),
      // Preload pet sprites (only 2, not in atlas)
      loadPetImg("cat_animation.png").catch(() => {}),
      loadPetImg("yorkie_animation.png").catch(() => {}),
    ]).then(([data]) => {
      setItems(data.items ?? []);
      setBalance(data.balance ?? 0);
      setImagesReady(true);
    }).catch(() => {});
  }, []);

  // Draw preview whenever loadout or direction changes (only after preload)
  const drawPreview = useCallback(() => {
    if (!imagesReady) return;
    const canvas = previewRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const scale = 6;
    const row = DIR_ROW[previewDir];

    function drawLayer(file: string, color: string | null, noTint: boolean) {
      drawFromAtlas(ctx!, file, color, noTint, 0, row * CELL, CELL, CELL, 0, 0, CELL * scale, CELL * scale);
    }

    // Body
    drawLayer("body/body_grey.png", loadout.skin_color, false);
    // Eyes
    drawLayer("eyes/eyes_grey.png", loadout.eyes_color, false);

    // Blush/Lipstick
    if (loadout.blush_id) {
      const info = items.find((i) => i.id === loadout.blush_id);
      if (info?.file) drawLayer(info.file, loadout.blush_color ?? info.default_color, info.no_tint);
    }
    if (loadout.lipstick_id) {
      const info = items.find((i) => i.id === loadout.lipstick_id);
      if (info?.file) drawLayer(info.file, loadout.lipstick_color ?? info.default_color, info.no_tint);
    }

    // Clothes
    if (loadout.clothes_full_id) {
      const info = items.find((i) => i.id === loadout.clothes_full_id);
      if (info?.file) drawLayer(info.file, loadout.clothes_full_color ?? info.default_color, info.no_tint);
    } else {
      for (const [key, colorKey] of [
        ["clothes_bottom_id", "clothes_bottom_color"],
        ["shoes_id", "shoes_color"],
        ["clothes_top_id", "clothes_top_color"],
      ] as const) {
        const id = loadout[key];
        if (!id) continue;
        const info = items.find((i) => i.id === id);
        if (info?.file) drawLayer(info.file, loadout[colorKey] ?? info.default_color, info.no_tint);
      }
    }

    // Hair
    if (loadout.hair_id) {
      const info = items.find((i) => i.id === loadout.hair_id);
      if (info?.file) drawLayer(info.file, loadout.hair_color ?? info.default_color, info.no_tint);
    }

    // Accessories
    for (const [key, colorKey] of [
      ["acc_facial_id", "acc_facial_color"],
      ["acc_jewelry_id", "acc_jewelry_color"],
      ["acc_face_id", "acc_face_color"],
      ["acc_hat_id", "acc_hat_color"],
    ] as const) {
      const id = loadout[key];
      if (!id) continue;
      const info = items.find((i) => i.id === id);
      if (info?.file) drawLayer(info.file, loadout[colorKey] ?? info.default_color, info.no_tint);
    }
  }, [loadout, previewDir, items, imagesReady]);

  useEffect(() => { drawPreview(); }, [drawPreview]);

  // Draw a thumbnail on a canvas for a given item (from atlas or pet cache)
  const drawThumbnail = useCallback((canvas: HTMLCanvasElement, item: ShopItem) => {
    if (!item.file) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (item.slot === "pet") {
      const img = petImgCache.get(item.file);
      if (img) ctx.drawImage(img, 0, 0, 18, 18, 0, 0, canvas.width, canvas.height);
    } else {
      drawFromAtlas(ctx, item.file, item.default_color, item.no_tint, 0, 0, CELL, CELL, 0, 0, canvas.width, canvas.height);
    }
  }, []);

  // Ref callback: draw immediately if atlas is loaded
  const setItemCanvasRef = useCallback((el: HTMLCanvasElement | null, item: ShopItem) => {
    if (!el) return;
    itemCanvasRefs.current.set(item.id, el);
    if (atlasReady) drawThumbnail(el, item);
  }, [drawThumbnail]);

  // Draw all visible thumbnails once preload is done
  useEffect(() => {
    if (!imagesReady) return;
    for (const item of items) {
      const canvas = itemCanvasRefs.current.get(item.id);
      if (canvas) drawThumbnail(canvas, item);
    }
  }, [imagesReady, items, drawThumbnail, activeCategory]);

  // Get items for current category
  const getCategoryItems = (): ShopItem[] => {
    const cat = CATEGORIES.find((c) => c.id === activeCategory);
    if (!cat) return [];

    if (cat.id === "skin" || cat.id === "face") return []; // handled specially

    const slots = Array.isArray(cat.slot) ? cat.slot : [cat.slot];
    return items.filter((i) => slots.includes(i.slot));
  };

  // Check if item is equipped
  const isEquipped = (item: ShopItem): boolean => {
    const cat = CATEGORIES.find((c) => c.id === activeCategory);
    if (!cat) return false;
    const key = cat.loadoutKey as keyof AvatarLoadout;
    if (item.id === "bald") return loadout[key] === null;
    return loadout[key] === item.id;
  };

  // Get current color for active category
  const getCurrentColor = (): string | null => {
    const cat = CATEGORIES.find((c) => c.id === activeCategory);
    if (!cat?.colorKey) return null;
    return (loadout[cat.colorKey as keyof AvatarLoadout] as string) ?? null;
  };

  // Equip item
  const equipItem = (item: ShopItem) => {
    const cat = CATEGORIES.find((c) => c.id === activeCategory);
    if (!cat) return;

    const newLoadout = { ...loadout };
    const key = cat.loadoutKey as keyof AvatarLoadout;

    // Toggle off if already equipped (optional slots only)
    if (cat.optional && newLoadout[key] === item.id) {
      (newLoadout as Record<string, unknown>)[key] = null;
      if (cat.colorKey) (newLoadout as Record<string, unknown>)[cat.colorKey] = null;
    } else {
      // "bald" = no hair (null in DB, rendered as no layer)
      const value = item.id === "bald" ? null : item.id;
      (newLoadout as Record<string, unknown>)[key] = value;
      if (cat.colorKey) {
        (newLoadout as Record<string, unknown>)[cat.colorKey] = item.default_color ?? null;
      }
    }

    setLoadout(newLoadout);
  };

  // Handle face items (blush, lipstick — special case with sub-slots)
  const equipFaceItem = (item: ShopItem) => {
    const newLoadout = { ...loadout };
    if (item.slot === "blush") {
      newLoadout.blush_id = newLoadout.blush_id === item.id ? null : item.id;
      newLoadout.blush_color = newLoadout.blush_id ? item.default_color : null;
    } else if (item.slot === "lipstick") {
      newLoadout.lipstick_id = newLoadout.lipstick_id === item.id ? null : item.id;
      newLoadout.lipstick_color = newLoadout.lipstick_id ? item.default_color : null;
    }
    setLoadout(newLoadout);
  };

  // Set color
  const setColor = (color: string) => {
    const cat = CATEGORIES.find((c) => c.id === activeCategory);
    if (!cat) return;

    const newLoadout = { ...loadout };
    if (cat.id === "skin") {
      newLoadout.skin_color = color;
    } else if (cat.colorKey) {
      (newLoadout as Record<string, unknown>)[cat.colorKey] = color;
    }
    setLoadout(newLoadout);
  };

  // Buy item — just purchases, does NOT change equip state (item stays previewed)
  const buyItem = async (item: ShopItem) => {
    if (buying) return;
    setBuying(item.id);
    try {
      const res = await fetch("/api/arcade/shop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: item.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 402) {
          setShowPxPacks(true);
        }
        setMessage(data.error ?? "Failed");
        setTimeout(() => setMessage(null), 3000);
        return;
      }
      // Update local state — mark as owned, keep it equipped (already previewed)
      setBalance(data.balance);
      setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, owned: true } : i));
      setMessage(`Bought ${item.name}!`);
      setTimeout(() => setMessage(null), 2000);
    } catch {
      setMessage("Connection error");
      setTimeout(() => setMessage(null), 3000);
    } finally {
      setBuying(null);
    }
  };

  // Confirm buy with a second click
  const [confirmBuyId, setConfirmBuyId] = useState<string | null>(null);
  // Track which items the user actively selected (vs what was in initial loadout)
  const [userSelectedIds, setUserSelectedIds] = useState<Set<string>>(new Set());

  // Save loadout
  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/arcade/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loadout),
      });
      if (res.ok) {
        onSave(loadout);
      } else {
        const data = await res.json();
        setMessage(data.error ?? "Failed to save");
        setTimeout(() => setMessage(null), 3000);
      }
    } catch {
      setMessage("Connection error");
      setTimeout(() => setMessage(null), 3000);
    } finally {
      setSaving(false);
    }
  };

  // Buy PX checkout
  const buyPx = async (packageId: string) => {
    try {
      const res = await fetch("/api/pixels/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ package_id: packageId, provider: "stripe" }),
      });
      const data = await res.json();
      if (data.url) {
        window.open(data.url, "_blank");
        setMessage("Complete payment in the new tab, then come back");
      }
    } catch {
      setMessage("Failed to start checkout");
    }
    setTimeout(() => setMessage(null), 5000);
  };

  // Refresh balance (after returning from checkout)
  useEffect(() => {
    const onFocus = () => {
      fetch("/api/arcade/shop")
        .then((r) => r.json())
        .then((data) => { if (data.balance !== undefined) setBalance(data.balance); })
        .catch(() => {});
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const catItems = getCategoryItems();
  const currentColor = getCurrentColor();
  const activeCat = CATEGORIES.find((c) => c.id === activeCategory);

  // Get equipped item icon for sidebar
  const getEquippedIcon = (cat: CategoryDef): ShopItem | null => {
    if (cat.id === "skin" || cat.id === "face") return null;
    const key = cat.loadoutKey as keyof AvatarLoadout;
    const id = loadout[key];
    if (!id) return null;
    return items.find((i) => i.id === id) ?? null;
  };

  return (
    <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/50">
      <div
        className="flex flex-col rounded-xl overflow-hidden shadow-2xl"
        style={{ width: 860, height: 600, background: "#fff" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <span className="font-bold text-sm text-gray-800">Edit Avatar</span>
          {message && (
            <span className="text-xs text-amber-600 font-medium">{message}</span>
          )}
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none cursor-pointer">
            &times;
          </button>
        </div>

        {/* Body: 3 columns */}
        <div className="flex flex-1 min-h-0">
          {/* Left: Category sidebar */}
          <div className="w-[160px] border-r border-gray-200 py-2 overflow-y-auto overflow-x-hidden flex-shrink-0">
            {CATEGORIES.map((cat) => {
              const equipped = getEquippedIcon(cat);
              return (
                <button
                  key={cat.id}
                  onClick={() => { setActiveCategory(cat.id); setShowPxPacks(false); }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors cursor-pointer ${
                    activeCategory === cat.id
                      ? "bg-blue-500 text-white rounded-r-lg mr-2"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <SidebarIcon catId={cat.id} items={items} skinColor={loadout.skin_color} ready={imagesReady} />
                  {cat.label}
                </button>
              );
            })}
          </div>

          {/* Center: Items grid + colors */}
          <div className="flex-1 flex flex-col min-w-0 border-r border-gray-200">
            <div className="flex-1 overflow-y-auto p-3">
              {!imagesReady ? (
              <div className="flex-1 flex items-center justify-center">
                <span className="text-xs text-gray-400 animate-pulse">Loading items...</span>
              </div>
            ) : activeCategory === "skin" ? (
                /* Skin tone selector */
                <div className="grid grid-cols-4 gap-2">
                  {SKIN_TONES.map((tone) => (
                    <button
                      key={tone.color}
                      onClick={() => setColor(tone.color)}
                      className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all cursor-pointer ${
                        loadout.skin_color === tone.color
                          ? "border-blue-500 bg-blue-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <div className="w-10 h-10 rounded-full" style={{ background: tone.color }} />
                      <span className="text-[10px] text-gray-500">Tone {tone.label}</span>
                    </button>
                  ))}
                </div>
              ) : activeCategory === "face" ? (
                /* Face items (blush, lipstick) */
                <div className="grid grid-cols-3 gap-2">
                  {items.filter((i) => ["blush", "lipstick", "eyes"].includes(i.slot)).map((item) => {
                    const isActive = item.slot === "blush" ? loadout.blush_id === item.id
                      : item.slot === "lipstick" ? loadout.lipstick_id === item.id
                      : true;
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          equipFaceItem(item);
                          setConfirmBuyId(null);
                          setUserSelectedIds((s) => new Set(s).add(item.id));
                        }}
                        className={`relative flex flex-col items-center gap-1 p-2 rounded-lg border-2 transition-all cursor-pointer ${
                          isActive ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <canvas
                          ref={(el) => setItemCanvasRef(el, item)}
                          width={64} height={64}
                          style={{ imageRendering: "pixelated" }}
                        />
                        <span className="text-[10px] text-gray-600">{item.name}</span>
                        {!item.owned && item.price_px > 0 && (
                          <span className="text-[9px] font-bold text-amber-600">{item.price_px} PX</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : showPxPacks ? (
                /* PX Packs inline */
                <div className="space-y-2">
                  <p className="text-xs text-gray-500 mb-3">Get more PX to unlock items</p>
                  {PX_PACKAGES.map((pkg) => (
                    <button
                      key={pkg.id}
                      onClick={() => buyPx(pkg.id)}
                      className="w-full flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-all cursor-pointer"
                    >
                      <div>
                        <span className="text-sm font-bold text-gray-800">{pkg.px} PX</span>
                        {pkg.bonus && <span className="ml-2 text-[10px] text-green-600">{pkg.bonus}</span>}
                        {pkg.badge && <span className="ml-2 text-[9px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded">{pkg.badge}</span>}
                      </div>
                      <span className="text-xs font-medium text-gray-600">{pkg.price}</span>
                    </button>
                  ))}
                  <button
                    onClick={() => setShowPxPacks(false)}
                    className="text-xs text-gray-400 hover:text-gray-600 mt-2 cursor-pointer"
                  >
                    &larr; Back to items
                  </button>
                </div>
              ) : (
                /* Regular items grid */
                <div className="grid grid-cols-4 gap-2">
                  {/* "None" option for optional categories */}
                  {activeCat?.optional && (
                    <button
                      onClick={() => {
                        const key = activeCat.loadoutKey as keyof AvatarLoadout;
                        const newLoadout = { ...loadout };
                        (newLoadout as Record<string, unknown>)[key] = null;
                        if (activeCat.colorKey) (newLoadout as Record<string, unknown>)[activeCat.colorKey] = null;
                        setLoadout(newLoadout);
                      }}
                      className={`flex flex-col items-center justify-center gap-1 p-2 rounded-lg border-2 transition-all cursor-pointer ${
                        !loadout[activeCat.loadoutKey as keyof AvatarLoadout]
                          ? "border-blue-500 bg-blue-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <div className="w-16 h-16 flex items-center justify-center text-gray-300 text-2xl">
                        &empty;
                      </div>
                      <span className="text-[10px] text-gray-400">None</span>
                    </button>
                  )}
                  {catItems.map((item) => {
                    const equipped = isEquipped(item);
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          equipItem(item);
                          setConfirmBuyId(null);
                          if (item.id !== "bald") setUserSelectedIds((s) => new Set(s).add(item.id));
                        }}
                        className={`relative flex flex-col items-center gap-1 p-2 rounded-lg border-2 transition-all cursor-pointer ${
                          equipped
                            ? "border-blue-500 bg-blue-50"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        {equipped && (
                          <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center text-white text-[10px]">
                            &times;
                          </div>
                        )}
                        <canvas
                          ref={(el) => setItemCanvasRef(el, item)}
                          width={64} height={64}
                          style={{ imageRendering: "pixelated" }}
                        />
                        <span className="text-[10px] text-gray-600 leading-tight text-center">{item.name}</span>
                        {!item.owned && item.price_px > 0 && (
                          <span className="text-[9px] font-bold text-amber-600">{item.price_px} PX</span>
                        )}
                        {item.owned && item.price_px > 0 && (
                          <span className="text-[9px] text-green-600">Owned</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Color palette (bottom of center column) */}
            {activeCategory !== "skin" && activeCategory !== "face" && !showPxPacks && activeCat?.colorKey && currentColor && (
              <div className="border-t border-gray-200 px-3 py-2">
                <div className="flex flex-wrap gap-1.5">
                  {COLOR_PALETTE.map((c) => (
                    <button
                      key={c}
                      onClick={() => setColor(c)}
                      className={`w-6 h-6 rounded-full border-2 transition-all cursor-pointer ${
                        currentColor === c ? "border-blue-500 scale-110" : "border-gray-300 hover:border-gray-400"
                      }`}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </div>
            )}

          </div>

          {/* Right: Preview + Purchase Summary */}
          <div className="w-[260px] flex flex-col flex-shrink-0 bg-gray-50">
            {/* Character preview */}
            <div className="flex flex-col items-center gap-2 pt-4 px-4">
              <div className="flex items-center gap-1.5 bg-gray-800 text-white text-[10px] px-2 py-1 rounded">
                <div className="w-2 h-2 rounded-full bg-green-400" />
                {playerName}
              </div>
              <canvas
                ref={previewRef}
                width={192} height={192}
                className="block"
                style={{ imageRendering: "pixelated" }}
              />
              <div className="flex rounded-lg overflow-hidden border border-gray-300">
                {(["down", "left", "up", "right"] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => setPreviewDir(d)}
                    className={`w-10 h-7 text-[10px] border-r border-gray-200 last:border-r-0 transition-colors cursor-pointer ${
                      previewDir === d ? "bg-blue-500 text-white" : "bg-white text-gray-500 hover:bg-gray-100"
                    }`}
                  >
                    {d === "down" ? "▼" : d === "up" ? "▲" : d === "left" ? "◀" : "▶"}
                  </button>
                ))}
              </div>
            </div>

            {/* Purchase summary + balance */}
            <div className="flex-1" />
            <PurchaseSummary
              loadout={loadout}
              items={items}
              balance={balance}
              buying={buying}
              saving={saving}
              showPxPacks={showPxPacks}
              onBuyAll={async (toBuy) => {
                for (const item of toBuy) {
                  await buyItem(item);
                }
              }}
              onGetPx={() => setShowPxPacks(true)}
              onSave={handleSave}
              onCancel={onClose}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
