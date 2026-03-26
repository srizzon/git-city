"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { MAX_TEXT_LENGTH } from "@/lib/skyAds";

const AdPreview = dynamic(() => import("@/components/AdPreview"), { ssr: false });

const ACCENT = "#c8e64a";

interface AdData {
  id: string;
  text: string;
  brand: string | null;
  description: string | null;
  color: string;
  bg_color: string;
  vehicle: string;
  link: string | null;
}

export default function EditAdPage({ params }: { params: Promise<{ adId: string }> }) {
  const { adId } = use(params);
  const router = useRouter();

  const [loaded, setLoaded] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [brand, setBrand] = useState("");
  const [text, setText] = useState("");
  const [description, setDescription] = useState("");
  const [link, setLink] = useState("");
  const [color, setColor] = useState("#f8d880");
  const [bgColor, setBgColor] = useState("#1a1018");
  const [vehicle, setVehicle] = useState("plane");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/ads/stats?ad_id=${adId}&_t=${Date.now()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const ad: AdData | undefined = d.ads?.find((a: AdData) => a.id === adId);
        if (!ad) {
          setNotFound(true);
          return;
        }
        setBrand(ad.brand || "");
        setText(ad.text);
        setDescription(ad.description || "");
        setLink(ad.link || "");
        setColor(ad.color);
        setBgColor(ad.bg_color);
        setVehicle(ad.vehicle);
        setLoaded(true);
      })
      .catch(() => setNotFound(true));
  }, [adId]);

  const textLength = text.length;
  const textOver = textLength > MAX_TEXT_LENGTH;
  const hexValid = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v);
  const colorValid = hexValid(color);
  const bgColorValid = hexValid(bgColor);
  const canSave = brand.trim().length > 0 && text.trim().length > 0 && !textOver && colorValid && bgColorValid && !saving;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/ads/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ad_id: adId,
          action: "update",
          brand: brand.trim(),
          text: text.trim(),
          description: description.trim() || null,
          link: link.trim() || null,
          color,
          bgColor,
        }),
      });
      if (res.ok) {
        router.push(`/ads/dashboard/${adId}`);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to save");
        setSaving(false);
      }
    } catch {
      setError("Network error. Please try again.");
      setSaving(false);
    }
  }

  if (notFound) {
    return <div className="mt-12 text-center"><p className="text-base text-muted">Ad not found</p></div>;
  }

  if (!loaded) {
    return <div className="flex h-64 items-center justify-center"><p className="text-sm text-muted">Loading...</p></div>;
  }

  return (
    <div>
      <Link href={`/ads/dashboard/${adId}`} className="text-xs text-muted transition-colors hover:text-cream">&larr; Back to ad</Link>

      <h1 className="mt-4 text-lg text-cream">Edit Ad</h1>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {/* Preview */}
        <div>
          <AdPreview
            vehicle={vehicle}
            text={text}
            color={colorValid ? color : "#f8d880"}
            bgColor={bgColorValid ? bgColor : "#1a1018"}
          />
        </div>

        {/* Edit panel */}
        <div className="border-[3px] border-border p-4 sm:p-5">
          {/* Brand */}
          <div>
            <div className="flex items-baseline justify-between">
              <label className="text-[10px] text-muted normal-case">Brand name</label>
              <span className="text-[9px] text-muted normal-case">{brand.length}/40</span>
            </div>
            <input
              type="text"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              maxLength={40}
              placeholder="Your Brand"
              className="mt-1.5 w-full border-[3px] border-border bg-transparent px-3 py-2 font-pixel text-xs text-cream outline-none transition-colors focus:border-[#c8e64a]"
            />
          </div>

          {/* Text */}
          <div className="mt-3">
            <div className="flex items-baseline justify-between">
              <label className="text-[10px] text-muted normal-case">Banner text</label>
              <span className="text-[9px] normal-case" style={{ color: textOver ? "#ff6b6b" : "var(--color-muted)" }}>
                {textLength}/{MAX_TEXT_LENGTH}
              </span>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={MAX_TEXT_LENGTH + 10}
              rows={2}
              placeholder="YOUR BRAND MESSAGE HERE"
              className="mt-1.5 w-full border-[3px] border-border bg-transparent px-3 py-2 font-pixel text-xs text-cream uppercase outline-none transition-colors focus:border-[#c8e64a]"
            />
          </div>

          {/* Description */}
          <div className="mt-3">
            <div className="flex items-baseline justify-between">
              <label className="text-[10px] text-muted normal-case">Description (optional)</label>
              <span className="text-[9px] text-muted normal-case">{description.length}/200</span>
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={200}
              rows={2}
              placeholder="Short description shown on CTA popup"
              className="mt-1.5 w-full border-[3px] border-border bg-transparent px-3 py-2 font-pixel text-[10px] text-cream outline-none transition-colors focus:border-[#c8e64a] normal-case"
            />
          </div>

          {/* Link */}
          <div className="mt-3">
            <label className="text-[10px] text-muted normal-case">Link (optional)</label>
            <input
              type="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://yoursite.com"
              className="mt-1.5 w-full border-[3px] border-border bg-transparent px-3 py-2 font-pixel text-xs text-cream outline-none transition-colors focus:border-[#c8e64a]"
            />
          </div>

          {/* Colors */}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-muted normal-case">Text color</label>
              <div className="mt-1 flex items-center gap-2">
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-8 w-8 cursor-pointer border-[2px] border-border bg-transparent" />
                <input type="text" value={color} onChange={(e) => setColor(e.target.value)} maxLength={7} className="w-full border-[2px] border-border bg-transparent px-2 py-1.5 font-pixel text-[10px] text-cream outline-none transition-colors focus:border-[#c8e64a]" />
              </div>
            </div>
            <div>
              <label className="text-[10px] text-muted normal-case">Background</label>
              <div className="mt-1 flex items-center gap-2">
                <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="h-8 w-8 cursor-pointer border-[2px] border-border bg-transparent" />
                <input type="text" value={bgColor} onChange={(e) => setBgColor(e.target.value)} maxLength={7} className="w-full border-[2px] border-border bg-transparent px-2 py-1.5 font-pixel text-[10px] text-cream outline-none transition-colors focus:border-[#c8e64a]" />
              </div>
            </div>
          </div>

          {/* Save */}
          <div className="mt-5">
            {error && (
              <div className="mb-3 border-[3px] px-4 py-3 text-center text-xs normal-case" style={{ borderColor: "#ff6b6b", color: "#ff6b6b", backgroundColor: "#ff6b6b10" }}>
                {error}
              </div>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              className="btn-press w-full py-3 text-sm text-bg transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
              style={{ backgroundColor: ACCENT, boxShadow: "4px 4px 0 0 #5a7a00" }}
            >
              {saving ? "Saving..." : "Save changes"}
            </button>
            <p className="mt-2 text-center">
              <Link href={`/ads/dashboard/${adId}`} className="text-xs text-muted transition-colors hover:text-cream normal-case">Cancel</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
