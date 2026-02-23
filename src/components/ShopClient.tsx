"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import type { ShopItem } from "@/lib/items";
import {
  ZONE_ITEMS,
  ZONE_LABELS,
  ITEM_NAMES,
  ITEM_EMOJIS,
  FACES_ITEMS,
  ACHIEVEMENT_ITEMS,
} from "@/lib/zones";

/** Must match FREE_CLAIM_ITEM in lib/items.ts */
const FREE_CLAIM_ITEM = "flag";

const ShopPreview = dynamic(() => import("./ShopPreview"), { ssr: false });

export interface BuildingDims {
  width: number;
  height: number;
  depth: number;
}

interface Loadout {
  crown: string | null;
  roof: string | null;
  aura: string | null;
}

interface Props {
  githubLogin: string;
  developerId: number;
  items: ShopItem[];
  ownedItems: string[];
  initialCustomColor: string | null;
  initialBillboardImages: string[];
  billboardSlots: number;
  buildingDims: BuildingDims;
  achievements?: string[];
  initialLoadout?: Loadout | null;
  purchasedItem?: string | null;
}

interface PixModalData {
  brCode: string;
  brCodeBase64: string;
  purchaseId: string;
  itemId: string;
  itemName: string;
  githubLogin: string;
}

const ACCENT = "#c8e64a";
const SHADOW = "#5a7a00";
const PENDING_BILLBOARD_KEY = "pending_billboard";

// Save a File as base64 in localStorage for persistence across redirects
function savePendingBillboard(file: File): void {
  const reader = new FileReader();
  reader.onloadend = () => {
    try {
      localStorage.setItem(
        PENDING_BILLBOARD_KEY,
        JSON.stringify({ data: reader.result, type: file.type, name: file.name })
      );
    } catch {
      // localStorage full or unavailable — ignore
    }
  };
  reader.readAsDataURL(file);
}

function getPendingBillboard(): { data: string; type: string; name: string } | null {
  try {
    const raw = localStorage.getItem(PENDING_BILLBOARD_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearPendingBillboard(): void {
  try {
    localStorage.removeItem(PENDING_BILLBOARD_KEY);
  } catch {
    // ignore
  }
}

// Convert a base64 data URL to a File
function dataUrlToFile(dataUrl: string, name: string, type: string): File {
  const arr = dataUrl.split(",");
  const bstr = atob(arr[1]);
  const u8arr = new Uint8Array(bstr.length);
  for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i);
  return new File([u8arr], name, { type });
}

const PIX_EXPIRY_SECONDS = 900; // 15 minutes

function formatPrice(item: ShopItem): string {
  return `$${(item.price_usd_cents / 100).toFixed(2)}`;
}

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/* ─── PIX Modal ─────────────────────────────────────────────── */

function PixModal({
  data,
  onClose,
  onCompleted,
}: {
  data: PixModalData;
  onClose: () => void;
  onCompleted: (itemId: string) => void;
}) {
  const [countdown, setCountdown] = useState(PIX_EXPIRY_SECONDS);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<"polling" | "completed" | "expired">("polling");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Countdown timer
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          setStatus("expired");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Poll for payment status
  useEffect(() => {
    if (status !== "polling") return;

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/checkout/status?purchase_id=${data.purchaseId}`
        );
        if (!res.ok) return;
        const json = await res.json();
        if (json.status === "completed") {
          setStatus("completed");
        }
      } catch {
        // ignore polling errors
      }
    }, 3000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [status, data.purchaseId]);

  // Stop intervals when done
  useEffect(() => {
    if (status === "completed" || status === "expired") {
      if (pollRef.current) clearInterval(pollRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [status]);

  const copyCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(data.brCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select text
    }
  }, [data.brCode]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="relative mx-4 w-full max-w-sm border-[2px] border-border bg-bg p-6">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute right-3 top-3 text-xs text-muted hover:text-cream"
        >
          &#10005;
        </button>

        <h3 className="mb-1 text-xs" style={{ color: ACCENT }}>
          PIX Payment
        </h3>
        <p className="mb-4 text-[9px] text-muted normal-case">
          {data.itemName}
        </p>

        {status === "completed" ? (
          <div className="py-6 text-center">
            <p className="mb-2 text-sm" style={{ color: ACCENT }}>
              &#10003; Payment confirmed!
            </p>
            <div className="mt-3 flex items-center justify-center gap-2">
              <a
                href={`/?user=${data.githubLogin}`}
                className="btn-press px-4 py-2 text-[10px] text-bg"
                style={{
                  backgroundColor: ACCENT,
                  boxShadow: `2px 2px 0 0 ${SHADOW}`,
                }}
              >
                View on map
              </a>
              <button
                onClick={() => onCompleted(data.purchaseId)}
                className="border-[2px] border-border px-4 py-2 text-[10px] text-cream hover:border-border-light"
              >
                Close
              </button>
            </div>
          </div>
        ) : status === "expired" ? (
          <div className="py-6 text-center">
            <p className="mb-2 text-xs text-red-400">QR code expired</p>
            <p className="text-[9px] text-muted normal-case">
              Close and try again to generate a new code.
            </p>
            <button
              onClick={onClose}
              className="mt-3 border-[2px] border-border px-4 py-2 text-[10px] text-cream hover:border-border-light"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            {/* QR code */}
            <div className="mb-4 flex justify-center">
              {data.brCodeBase64 ? (
                <img
                  src={data.brCodeBase64}
                  alt="PIX QR Code"
                  className="h-48 w-48"
                  style={{ imageRendering: "pixelated" }}
                />
              ) : (
                <div className="flex h-48 w-48 items-center justify-center border-[2px] border-border text-[9px] text-muted">
                  QR code unavailable
                </div>
              )}
            </div>

            {/* PIX code + copy */}
            <div className="mb-4">
              <p className="mb-1 text-[8px] text-muted">PIX code (copy &amp; paste):</p>
              <div className="flex items-stretch gap-1">
                <div className="flex-1 overflow-hidden border-[2px] border-border bg-bg-card px-2 py-1.5">
                  <p className="truncate text-[8px] text-cream normal-case">
                    {data.brCode}
                  </p>
                </div>
                <button
                  onClick={copyCode}
                  className="shrink-0 border-[2px] px-3 text-[9px] transition-colors"
                  style={{
                    borderColor: copied ? ACCENT : "var(--color-border)",
                    color: copied ? ACCENT : "var(--color-cream)",
                  }}
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>

            {/* Timer + status */}
            <div className="flex items-center justify-between">
              <p className="text-[9px] text-muted normal-case">
                Expires in{" "}
                <span style={{ color: countdown < 60 ? "#ef4444" : ACCENT }}>
                  {formatCountdown(countdown)}
                </span>
              </p>
              <p className="text-[9px] text-muted normal-case animate-pulse">
                Checking payment...
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Color Picker Panel ──────────────────────────────────────── */

function ColorPickerPanel({
  currentColor,
  isOwned,
  onPreview,
  onSave,
  onRemove,
}: {
  currentColor: string | null;
  isOwned: boolean;
  onPreview: (color: string | null) => void;
  onSave: (color: string) => Promise<boolean>;
  onRemove: () => Promise<boolean>;
}) {
  const [color, setColor] = useState(currentColor || ACCENT);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<"saved" | "removed" | null>(null);

  // Sync internal state when saved color changes externally (e.g. after remove)
  useEffect(() => {
    setColor(currentColor || ACCENT);
  }, [currentColor]);

  const handleChange = (newColor: string) => {
    setColor(newColor);
    onPreview(newColor);
  };

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);
    const ok = await onSave(color);
    setSaving(false);
    if (ok) {
      setFeedback("saved");
      setTimeout(() => setFeedback(null), 2000);
    }
  };

  const handleRemove = async () => {
    setSaving(true);
    setFeedback(null);
    const ok = await onRemove();
    setSaving(false);
    if (ok) {
      setFeedback("removed");
      setTimeout(() => setFeedback(null), 2000);
    }
  };

  return (
    <div className="mt-2 flex items-center gap-3 border-[2px] border-border/50 bg-bg/50 px-3 py-2">
      <input
        type="color"
        value={color}
        onChange={(e) => handleChange(e.target.value)}
        className="h-8 w-10 cursor-pointer border-[2px] border-border bg-transparent"
      />
      <span className="text-[10px] text-muted normal-case">{color}</span>
      {isOwned ? (
        <div className="ml-auto flex items-center gap-1.5">
          {currentColor && (
            <button
              onClick={handleRemove}
              disabled={saving}
              className="border-[2px] border-border px-2 py-1 text-[10px] text-muted hover:text-cream disabled:opacity-40"
            >
              {feedback === "removed" ? "Removed!" : "Remove"}
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-press px-3 py-1 text-[10px] text-bg disabled:opacity-40"
            style={{
              backgroundColor: feedback === "saved" ? "#39d353" : ACCENT,
              boxShadow: `2px 2px 0 0 ${SHADOW}`,
            }}
          >
            {saving ? "..." : feedback === "saved" ? "Saved!" : "Save"}
          </button>
        </div>
      ) : (
        <span className="ml-auto text-[9px] text-dim normal-case">Preview only</span>
      )}
    </div>
  );
}

/* ─── Billboard Upload Panel (Multi-Slot) ─────────────────────── */

function BillboardUploadPanel({
  images,
  slotCount,
  isOwned,
  autoUploading,
  onImagesChange,
  onPreviewChange,
}: {
  images: string[];
  slotCount: number;
  isOwned: boolean;
  autoUploading?: boolean;
  onImagesChange: (images: string[]) => void;
  onPreviewChange: (images: string[]) => void;
}) {
  const [uploadingSlot, setUploadingSlot] = useState<number | null>(null);
  const [savedSlot, setSavedSlot] = useState<number | null>(null);
  const fileRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const handleFileChange = useCallback((slotIndex: number) => {
    const file = fileRefs.current[slotIndex]?.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    // Create preview: copy current images and replace this slot
    const newImages = [...images];
    while (newImages.length <= slotIndex) newImages.push("");
    newImages[slotIndex] = url;
    onPreviewChange(newImages);
    // Save to localStorage so it survives Stripe redirect
    if (!isOwned) {
      savePendingBillboard(file);
    }
  }, [images, isOwned, onPreviewChange]);

  const handleUpload = useCallback(async (slotIndex: number) => {
    const file = fileRefs.current[slotIndex]?.files?.[0];
    if (!file) return;

    setUploadingSlot(slotIndex);
    setSavedSlot(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("slot_index", slotIndex.toString());

      const res = await fetch("/api/customizations/upload", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        if (data.images) {
          onImagesChange(data.images);
        }
        setSavedSlot(slotIndex);
        setTimeout(() => setSavedSlot(null), 2000);
      }
    } catch {
      // ignore
    } finally {
      setUploadingSlot(null);
    }
  }, [onImagesChange]);

  // Show at least 1 slot for non-owners (preview), or slotCount for owners
  const displaySlots = isOwned ? Math.max(slotCount, 1) : 1;

  return (
    <div className="mt-2 border-[2px] border-border/50 bg-bg/50 px-3 py-2">
      {isOwned ? (
        <>
          {autoUploading && (
            <div className="mb-2 border-[2px] border-dashed px-3 py-2 text-[10px] normal-case animate-pulse" style={{ borderColor: ACCENT, color: ACCENT }}>
              Uploading your billboard image...
            </div>
          )}
          {!autoUploading && images.filter(Boolean).length === 0 && (
            <div className="mb-2 border-[2px] border-dashed px-3 py-2 text-[10px] normal-case" style={{ borderColor: ACCENT, color: ACCENT }}>
              Upload an image to each slot below to display on your building!
            </div>
          )}
          <p className="mb-2 text-[9px] text-muted normal-case">
            {slotCount} billboard slot{slotCount !== 1 ? "s" : ""} — upload an image for each. Buy more to unlock more slots.
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Array.from({ length: displaySlots }).map((_, i) => {
              const img = images[i];
              const isUploading = uploadingSlot === i;
              const isSaved = savedSlot === i;

              return (
                <div
                  key={i}
                  className="flex flex-col items-center gap-1 border-[2px] border-border/30 bg-bg-card p-2"
                >
                  <p className="text-[8px] text-dim">Slot {i + 1}</p>
                  {img ? (
                    <Image
                      src={img}
                      alt={`Billboard ${i + 1}`}
                      width={120}
                      height={40}
                      className="h-10 w-full border-[1px] border-border object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-full items-center justify-center border-[1px] border-border/30 bg-bg/50 text-[8px] text-dim">
                      Empty
                    </div>
                  )}
                  <input
                    ref={(el) => { fileRefs.current[i] = el; }}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={() => handleFileChange(i)}
                    className="w-full text-[8px] text-muted normal-case file:mr-1 file:border-[1px] file:border-border file:bg-bg file:px-1 file:py-0.5 file:text-[8px] file:text-cream"
                  />
                  <button
                    onClick={() => handleUpload(i)}
                    disabled={isUploading}
                    className="btn-press w-full px-2 py-0.5 text-[9px] text-bg disabled:opacity-40"
                    style={{
                      backgroundColor: isSaved ? "#39d353" : ACCENT,
                      boxShadow: `1px 1px 0 0 ${SHADOW}`,
                    }}
                  >
                    {isUploading ? "..." : isSaved ? "Saved!" : "Upload"}
                  </button>
                </div>
              );
            })}
          </div>
          <p className="mt-1 text-[8px] text-dim normal-case">
            PNG, JPEG, WebP or GIF. Max 2 MB.
          </p>
        </>
      ) : (
        <>
          <p className="mb-2 text-[9px] text-muted normal-case">
            Try it — pick an image to preview on the 3D building. Purchase to save.
          </p>
          <div className="flex items-center gap-3">
            {images[0] && (
              <Image
                src={images[0]}
                alt="Billboard preview"
                width={56}
                height={40}
                className="h-10 w-14 border-[2px] border-border object-cover"
              />
            )}
            <input
              ref={(el) => { fileRefs.current[0] = el; }}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={() => handleFileChange(0)}
              className="min-w-0 flex-1 text-[9px] text-muted normal-case file:mr-2 file:border-[2px] file:border-border file:bg-bg-card file:px-2 file:py-1 file:text-[9px] file:text-cream"
            />
          </div>
          <p className="mt-1 text-[8px] text-dim normal-case">
            PNG, JPEG, WebP or GIF. Max 2 MB. Each purchase = 1 billboard slot.
          </p>
        </>
      )}
    </div>
  );
}

/* ─── Shop Client ───────────────────────────────────────────── */

export default function ShopClient({
  githubLogin,
  developerId,
  items,
  ownedItems,
  initialCustomColor,
  initialBillboardImages,
  billboardSlots: initialBillboardSlots,
  buildingDims,
  achievements = [],
  initialLoadout = null,
  purchasedItem = null,
}: Props) {
  // Loadout state
  const [loadout, setLoadout] = useState<Loadout>(
    initialLoadout ?? { crown: null, roof: null, aura: null }
  );
  const loadoutRef = useRef(loadout);
  loadoutRef.current = loadout;

  const [owned, setOwned] = useState<string[]>(ownedItems);
  const [buyingItem, setBuyingItem] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [highlightItem, setHighlightItem] = useState<string | null>(null);
  const [confirmBuyItem, setConfirmBuyItem] = useState<string | null>(null);

  const [pixModal, setPixModal] = useState<PixModalData | null>(null);
  const [customColor, setCustomColor] = useState<string | null>(initialCustomColor);
  const [billboardImages, setBillboardImages] = useState<string[]>(initialBillboardImages);
  const [billboardSlots, setBillboardSlots] = useState(initialBillboardSlots);
  const [previewColor, setPreviewColor] = useState<string | null>(null);
  const [previewBillboardImages, setPreviewBillboardImages] = useState<string[] | null>(null);
  const [autoUploading, setAutoUploading] = useState(false);
  const [purchaseToast, setPurchaseToast] = useState<string | null>(purchasedItem);

  // Post-purchase: show toast + auto-equip if zone is empty
  useEffect(() => {
    if (!purchasedItem) return;
    // Clear toast after 5s
    const timer = setTimeout(() => setPurchaseToast(null), 5000);
    // Auto-equip if the item belongs to a zone and that zone is empty
    for (const [zone, zoneItems] of Object.entries(ZONE_ITEMS)) {
      if (zoneItems.includes(purchasedItem)) {
        const zoneKey = zone as keyof Loadout;
        setLoadout((prev) => {
          if (prev[zoneKey]) return prev; // zone already has something equipped
          return { ...prev, [zoneKey]: purchasedItem };
        });
        setHasChanges(true);
        break;
      }
    }
    // Clean URL param
    window.history.replaceState({}, "", window.location.pathname);
    return () => clearTimeout(timer);
  }, [purchasedItem]);

  // Default loadout for new users: if no initialLoadout and user owns flag, show flag
  const effectiveLoadout: Loadout = {
    crown: loadout.crown ?? (!initialLoadout && owned.includes("flag") ? "flag" : null),
    roof: loadout.roof,
    aura: loadout.aura,
  };

  // Dismiss buy confirmation popover on click outside
  useEffect(() => {
    if (!confirmBuyItem) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-buy-popover]")) {
        setConfirmBuyItem(null);
      }
    };
    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, [confirmBuyItem]);

  // Unsaved changes warning
  useEffect(() => {
    if (!hasChanges) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasChanges]);

  // Auto-upload pending billboard image after purchase redirect
  useEffect(() => {
    if (billboardSlots <= 0) return;
    if (billboardImages[0]) return;

    const pending = getPendingBillboard();
    if (!pending) return;

    setAutoUploading(true);
    const file = dataUrlToFile(pending.data, pending.name, pending.type);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("slot_index", "0");

    fetch("/api/customizations/upload", { method: "POST", body: formData })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          if (data.images) {
            setBillboardImages(data.images);
          }
        }
      })
      .finally(() => {
        clearPendingBillboard();
        setAutoUploading(false);
      });
  }, [billboardSlots]); // only run on mount / when slots change

  // ─── Handlers ─────────────────────────────────────────────

  const handleEquip = useCallback((zone: keyof Loadout, itemId: string) => {
    setLoadout((prev) => ({ ...prev, [zone]: itemId }));
    setHasChanges(true);
    setSaved(false);
    setConfirmBuyItem(null);
  }, []);

  const handleUnequip = useCallback((zone: keyof Loadout) => {
    setLoadout((prev) => ({ ...prev, [zone]: null }));
    setHasChanges(true);
    setSaved(false);
    setHighlightItem(null);
    setConfirmBuyItem(null);
  }, []);

  const handleSaveLoadout = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/loadout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loadoutRef.current),
      });
      if (res.ok) {
        setSaved(true);
        setHasChanges(false);
        setTimeout(() => setSaved(false), 2000);
      } else {
        setError("Failed to save. Try again.");
      }
    } catch {
      setError("Failed to save. Try again.");
    } finally {
      setSaving(false);
    }
  }, []);

  const claimFreeItem = useCallback(async () => {
    if (buyingItem) return;
    setBuyingItem(FREE_CLAIM_ITEM);
    setError(null);

    try {
      const res = await fetch("/api/claim-free-item", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          setOwned((prev) =>
            prev.includes(FREE_CLAIM_ITEM) ? prev : [...prev, FREE_CLAIM_ITEM]
          );
        } else {
          setError(data.error || "Failed to claim free item");
        }
        return;
      }

      setOwned((prev) =>
        prev.includes(FREE_CLAIM_ITEM) ? prev : [...prev, FREE_CLAIM_ITEM]
      );
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBuyingItem(null);
    }
  }, [buyingItem]);

  const checkout = useCallback(
    async (itemId: string) => {
      if (buyingItem) return;
      setBuyingItem(itemId);
      setError(null);

      try {
        const res = await fetch("/api/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ item_id: itemId, provider: "stripe", currency: "usd" }),
        });

        const data = await res.json();

        if (!res.ok) {
          if (res.status === 409) {
            if (itemId === "billboard") {
              setError(data.error || "Max billboard slots reached");
            } else {
              setError("You already own this item");
              setOwned((prev) =>
                prev.includes(itemId) ? prev : [...prev, itemId]
              );
            }
          } else {
            setError(data.error || "Checkout failed");
          }
          return;
        }

        if (data.brCode) {
          const item = items.find((i) => i.id === itemId);
          setPixModal({
            brCode: data.brCode,
            brCodeBase64: data.brCodeBase64,
            purchaseId: data.purchase_id,
            itemId,
            itemName: item?.name ?? "Item",
            githubLogin,
          });
        } else if (data.url) {
          window.location.href = data.url;
        }
      } catch {
        setError("Network error. Try again.");
      } finally {
        setBuyingItem(null);
      }
    },
    [buyingItem, items, githubLogin]
  );

  const handlePixCompleted = useCallback(
    (_purchaseId: string) => {
      if (pixModal) {
        const itemId = pixModal.itemId;
        if (itemId) {
          setOwned((prev) =>
            prev.includes(itemId) ? prev : [...prev, itemId]
          );
          if (itemId === "billboard") {
            setBillboardSlots((prev) => prev + 1);
            const pending = getPendingBillboard();
            if (pending) {
              const file = dataUrlToFile(pending.data, pending.name, pending.type);
              const formData = new FormData();
              formData.append("file", file);
              formData.append("slot_index", "0");
              fetch("/api/customizations/upload", { method: "POST", body: formData })
                .then(async (res) => {
                  if (res.ok) {
                    const data = await res.json();
                    if (data.images) setBillboardImages(data.images);
                  }
                })
                .finally(() => clearPendingBillboard());
            }
          }
        }
      }
      setPixModal(null);
    },
    [pixModal, items]
  );

  // ─── Helpers ─────────────────────────────────────────────

  /** Find the zone a given item belongs to (crown/roof/aura) */
  function getItemZone(itemId: string): keyof Loadout | null {
    for (const [zone, zoneItems] of Object.entries(ZONE_ITEMS)) {
      if (zoneItems.includes(itemId)) return zone as keyof Loadout;
    }
    return null;
  }

  /** Get the ShopItem record for an item_id */
  function getShopItem(itemId: string): ShopItem | undefined {
    return items.find((i) => i.id === itemId);
  }

  // ─── Empty state ─────────────────────────────────────────

  if (items.length === 0) {
    return (
      <p className="py-8 text-center text-[10px] text-muted normal-case">
        No items available yet. Check back soon!
      </p>
    );
  }

  // ─── Render ───────────────────────────────────────────────

  const ownedFacesItems = owned.filter((id) => FACES_ITEMS.includes(id));

  const saveButton = (
    <button
      onClick={handleSaveLoadout}
      disabled={!hasChanges || saving}
      className="btn-press w-full py-2.5 text-xs text-bg disabled:opacity-40"
      style={{
        backgroundColor: saved ? "#39d353" : ACCENT,
        boxShadow: `2px 2px 0 0 ${SHADOW}`,
      }}
    >
      {saving ? "Saving..." : saved ? "Saved!" : "Save Loadout"}
    </button>
  );

  return (
    <>
      {/* Purchase success toast */}
      {purchaseToast && (
        <div className="fixed top-4 left-1/2 z-50 -translate-x-1/2">
          <div
            className="flex items-center gap-2 border-[3px] px-5 py-2.5 text-[10px] text-bg"
            style={{ backgroundColor: ACCENT, borderColor: SHADOW }}
          >
            <span className="text-base">{ITEM_EMOJIS[purchaseToast] ?? "🎉"}</span>
            <span>{ITEM_NAMES[purchaseToast] ?? purchaseToast} purchased! Equip it below.</span>
          </div>
        </div>
      )}

      {/* Checkout loading overlay */}
      {buyingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="border-[3px] border-border bg-bg p-6 text-center">
            <div className="mb-3 text-2xl animate-pulse">{ITEM_EMOJIS[buyingItem] ?? "🛒"}</div>
            <p className="text-xs text-cream">Redirecting to checkout...</p>
            <p className="mt-1 text-[9px] text-muted normal-case">Please wait</p>
          </div>
        </div>
      )}

      {/* PIX Modal */}
      {pixModal && (
        <PixModal
          data={pixModal}
          onClose={() => setPixModal(null)}
          onCompleted={handlePixCompleted}
        />
      )}

      {error && (
        <div className="mb-4 border-[2px] border-red-500/30 bg-red-500/10 px-3 py-2 text-[10px] text-red-400 normal-case">
          {error}
        </div>
      )}

      {/* Desktop: 2 columns */}
      <div className="lg:flex lg:gap-6">
        {/* Left column: Preview (sticky on desktop) */}
        <div className="lg:w-[420px] lg:shrink-0">
          <div className="lg:sticky lg:top-6">
            <ShopPreview
              loadout={effectiveLoadout}
              ownedFacesItems={ownedFacesItems}
              customColor={previewColor ?? customColor}
              billboardImages={previewBillboardImages ?? billboardImages}
              buildingDims={buildingDims}
              highlightItemId={highlightItem}
            />
            {/* Save button (desktop, below preview) */}
            <div className="hidden lg:block mt-4">
              {saveButton}
            </div>
          </div>
        </div>

        {/* Right column: Zones */}
        <div className="mt-5 lg:mt-0 min-w-0 flex-1 space-y-5">
          {/* Zone sections: CROWN, ROOF, AURA */}
          {(Object.entries(ZONE_ITEMS) as [string, string[]][]).map(([zone, zoneItemIds]) => {
            const zoneKey = zone as keyof Loadout;
            const equippedId = effectiveLoadout[zoneKey];
            const equippedName = equippedId ? (ITEM_NAMES[equippedId] ?? equippedId) : "None";

            return (
              <div key={zone} className="border-[3px] border-border bg-bg-raised p-4">
                {/* Zone header */}
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm" style={{ color: ACCENT }}>
                    {ZONE_LABELS[zone] ?? zone}
                  </h3>
                  <span className="text-[9px] text-muted normal-case">
                    equipped: {equippedName}
                  </span>
                </div>

                {/* Item cards grid */}
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2">
                  {zoneItemIds.map((itemId) => {
                    const isOwned = owned.includes(itemId);
                    const isEquipped = equippedId === itemId;
                    const shopItem = getShopItem(itemId);
                    const isFreeItem = itemId === FREE_CLAIM_ITEM;
                    const achUnlock = ACHIEVEMENT_ITEMS[itemId];
                    const hasAchievement = achUnlock && achievements.includes(achUnlock.achievement);
                    const isBuying = buyingItem === itemId;

                    // Badge text
                    let badge: string;
                    let badgeColor: string;
                    if (isEquipped) {
                      badge = "EQUIPPED";
                      badgeColor = "#39d353";
                    } else if (isOwned) {
                      badge = "\u2713";
                      badgeColor = ACCENT;
                    } else if (isFreeItem) {
                      badge = "FREE";
                      badgeColor = ACCENT;
                    } else if (achUnlock && !shopItem?.price_usd_cents) {
                      badge = hasAchievement ? "Unlockable!" : achUnlock.label.split("(")[0].trim();
                      badgeColor = hasAchievement ? "#39d353" : "#a0a0b0";
                    } else if (shopItem) {
                      badge = formatPrice(shopItem);
                      badgeColor = "#a0a0b0";
                    } else {
                      badge = "";
                      badgeColor = "#a0a0b0";
                    }

                    const isConfirming = confirmBuyItem === itemId;

                    // Click handler
                    const handleClick = () => {
                      if (isEquipped) {
                        handleUnequip(zoneKey);
                      } else if (isOwned) {
                        handleEquip(zoneKey, itemId);
                      } else if (isFreeItem) {
                        claimFreeItem();
                      } else if (shopItem && shopItem.price_usd_cents > 0) {
                        // Toggle confirm popover instead of going straight to checkout
                        setConfirmBuyItem(isConfirming ? null : itemId);
                      }
                      // Achievement-only locked items: no action (just hint)
                    };

                    return (
                      <div key={itemId} className="relative" data-buy-popover>
                        <button
                          onClick={handleClick}
                          disabled={isBuying}
                          onMouseEnter={() => setHighlightItem(itemId)}
                          onMouseLeave={() => setHighlightItem(null)}
                          className={[
                            "flex flex-col items-center justify-center p-2 transition-all w-full aspect-square",
                            isEquipped ? "border-[3px]" : "border-[2px]",
                            isEquipped ? "border-[#39d353]" : isConfirming ? "border-[var(--color-border-light)]" : "border-border",
                            isEquipped ? "bg-[rgba(57,211,83,0.1)]" : "bg-bg-card",
                            !isOwned && !isEquipped ? "opacity-60" : "",
                            "hover:border-border-light",
                          ].join(" ")}
                        >
                          <span className="text-2xl">{ITEM_EMOJIS[itemId] ?? "?"}</span>
                          <span className="mt-1 text-[9px] text-cream truncate w-full text-center">
                            {ITEM_NAMES[itemId] ?? itemId}
                          </span>
                          <span
                            className="mt-0.5 text-[8px]"
                            style={{ color: badgeColor }}
                          >
                            {isBuying ? "..." : badge}
                          </span>
                        </button>

                        {/* Buy confirmation popover */}
                        {isConfirming && shopItem && (
                          <div data-buy-popover className="absolute left-1/2 -translate-x-1/2 top-full mt-1 z-30 w-36 border-[2px] border-border bg-bg p-2 shadow-lg">
                            <p className="text-[9px] text-cream text-center mb-1.5">
                              {ITEM_NAMES[itemId]}
                            </p>
                            <p className="text-[10px] text-center mb-2" style={{ color: ACCENT }}>
                              {formatPrice(shopItem)}
                            </p>
                            <div className="flex gap-1">
                              <button
                                onClick={(e) => { e.stopPropagation(); setConfirmBuyItem(null); }}
                                className="flex-1 border-[2px] border-border py-1 text-[9px] text-muted hover:text-cream"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setConfirmBuyItem(null); checkout(itemId); }}
                                disabled={isBuying}
                                className="btn-press flex-1 py-1 text-[9px] text-bg disabled:opacity-40"
                                style={{ backgroundColor: ACCENT, boxShadow: `1px 1px 0 0 ${SHADOW}` }}
                              >
                                {isBuying ? "..." : "Buy"}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* FACES zone */}
          <div className="border-[3px] border-border bg-bg-raised p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm" style={{ color: ACCENT }}>
                Faces
              </h3>
              <span className="text-[9px] text-muted normal-case">
                always active if owned
              </span>
            </div>

            {/* Faces item cards */}
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2 mb-3">
              {FACES_ITEMS.map((itemId) => {
                const isOwned = owned.includes(itemId);
                const shopItem = getShopItem(itemId);
                const isBillboard = itemId === "billboard";
                const achUnlock = ACHIEVEMENT_ITEMS[itemId];
                const hasAchievement = achUnlock && achievements.includes(achUnlock.achievement);
                const isBuying = buyingItem === itemId;

                let badge: string;
                let badgeColor: string;
                if (isOwned && !isBillboard) {
                  badge = "\u2713";
                  badgeColor = ACCENT;
                } else if (isBillboard && billboardSlots > 0) {
                  badge = `x${billboardSlots}`;
                  badgeColor = ACCENT;
                } else if (achUnlock && !shopItem?.price_usd_cents) {
                  badge = hasAchievement ? "Unlockable!" : achUnlock.label.split("(")[0].trim();
                  badgeColor = hasAchievement ? "#39d353" : "#a0a0b0";
                } else if (shopItem) {
                  badge = formatPrice(shopItem);
                  badgeColor = "#a0a0b0";
                } else {
                  badge = "";
                  badgeColor = "#a0a0b0";
                }

                const isConfirming = confirmBuyItem === itemId;
                const isFacesOwned = isOwned || (isBillboard && billboardSlots > 0);

                const handleClick = () => {
                  if (isBillboard && isFacesOwned) {
                    // Already owned, scroll to upload — no action needed on card
                    return;
                  }
                  if (isOwned) return; // faces items don't equip/unequip
                  if (shopItem && shopItem.price_usd_cents > 0) {
                    setConfirmBuyItem(isConfirming ? null : itemId);
                  }
                };

                return (
                  <div key={itemId} className="relative" data-buy-popover>
                    <button
                      onClick={handleClick}
                      disabled={isBuying}
                      onMouseEnter={() => setHighlightItem(itemId)}
                      onMouseLeave={() => setHighlightItem(null)}
                      className={[
                        "flex flex-col items-center justify-center p-2 transition-all w-full aspect-square",
                        isFacesOwned ? "border-[3px] border-[#39d353] bg-[rgba(57,211,83,0.1)]" : "border-[2px] border-border bg-bg-card opacity-60",
                        isConfirming ? "border-[var(--color-border-light)]" : "",
                        "hover:border-border-light",
                      ].join(" ")}
                    >
                      <span className="text-2xl">{ITEM_EMOJIS[itemId] ?? "?"}</span>
                      <span className="mt-1 text-[9px] text-cream truncate w-full text-center">
                        {ITEM_NAMES[itemId] ?? itemId}
                      </span>
                      <span
                        className="mt-0.5 text-[8px]"
                        style={{ color: badgeColor }}
                      >
                        {isBuying ? "..." : badge}
                      </span>
                    </button>

                    {/* Buy confirmation popover */}
                    {isConfirming && shopItem && (
                      <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 z-30 w-36 border-[2px] border-border bg-bg p-2 shadow-lg">
                        <p className="text-[9px] text-cream text-center mb-1.5">
                          {ITEM_NAMES[itemId]}
                        </p>
                        <p className="text-[10px] text-center mb-2" style={{ color: ACCENT }}>
                          {formatPrice(shopItem)}
                        </p>
                        <div className="flex gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); setConfirmBuyItem(null); }}
                            className="flex-1 border-[2px] border-border py-1 text-[9px] text-muted hover:text-cream"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setConfirmBuyItem(null); checkout(itemId); }}
                            disabled={isBuying}
                            className="btn-press flex-1 py-1 text-[9px] text-bg disabled:opacity-40"
                            style={{ backgroundColor: ACCENT, boxShadow: `1px 1px 0 0 ${SHADOW}` }}
                          >
                            {isBuying ? "..." : "Buy"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Color picker (if custom_color exists in items) */}
            {items.some((i) => i.id === "custom_color") && (
              <ColorPickerPanel
                currentColor={customColor}
                isOwned={owned.includes("custom_color")}
                onPreview={(c) => setPreviewColor(c)}
                onSave={async (c) => {
                  try {
                    const res = await fetch("/api/customizations", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ item_id: "custom_color", color: c }),
                    });
                    if (res.ok) {
                      setCustomColor(c);
                      setPreviewColor(null);
                      return true;
                    }
                  } catch { /* ignore */ }
                  return false;
                }}
                onRemove={async () => {
                  try {
                    const res = await fetch("/api/customizations", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ item_id: "custom_color", color: null }),
                    });
                    if (res.ok) {
                      setCustomColor(null);
                      setPreviewColor(null);
                      return true;
                    }
                  } catch { /* ignore */ }
                  return false;
                }}
              />
            )}

            {/* Billboard upload */}
            {items.some((i) => i.id === "billboard") && (
              <BillboardUploadPanel
                images={previewBillboardImages ?? billboardImages}
                slotCount={billboardSlots}
                isOwned={billboardSlots > 0}
                autoUploading={autoUploading}
                onImagesChange={(imgs) => { setBillboardImages(imgs); setPreviewBillboardImages(null); }}
                onPreviewChange={(imgs) => setPreviewBillboardImages(imgs)}
              />
            )}
          </div>

          {/* Payment note */}
          <p className="text-center text-[10px] text-dim normal-case">
            Payment via Stripe
          </p>
        </div>
      </div>

      {/* Mobile: Save sticky bottom */}
      <div className="fixed bottom-0 left-0 right-0 z-40 p-3 bg-bg border-t-[3px] border-border lg:hidden">
        {saveButton}
      </div>
    </>
  );
}
