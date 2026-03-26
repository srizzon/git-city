"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  SKY_AD_PLANS, getPriceCents, formatPrice, PROMO_DISCOUNT,
  PERIOD_OPTIONS, type SkyAdPlanId, type AdCurrency, type AdPeriod,
} from "@/lib/skyAdPlans";
import { MAX_TEXT_LENGTH } from "@/lib/skyAds";
import AdPixModal from "@/components/AdPixModal";

const AdPreview = dynamic(() => import("@/components/AdPreview"), { ssr: false });

const ACCENT = "#c8e64a";

type Vehicle = "plane" | "blimp" | "billboard" | "rooftop_sign" | "led_wrap";

const VEHICLES: { id: Vehicle; icon: string; name: string }[] = [
  { id: "plane", icon: "\u2708", name: "Plane" },
  { id: "led_wrap", icon: "\uD83D\uDCA1", name: "LED Wrap" },
  { id: "billboard", icon: "\uD83D\uDCCB", name: "Billboard" },
  { id: "rooftop_sign", icon: "\uD83D\uDD04", name: "Rooftop" },
  { id: "blimp", icon: "\u25C6", name: "Blimp" },
];

const VEHICLE_STATS: Record<Vehicle, { impressions: string; ctr: string; clicks: string }> = {
  rooftop_sign: { impressions: "~63K", ctr: "1.5%", clicks: "~939" },
  blimp:        { impressions: "~41K", ctr: "1.6%", clicks: "~651" },
  plane:        { impressions: "~29K", ctr: "1.0%", clicks: "~299" },
  led_wrap:     { impressions: "~28K", ctr: "0.4%", clicks: "~110" },
  billboard:    { impressions: "~21K", ctr: "1.0%", clicks: "~217" },
};

const PERIODS = Object.keys(PERIOD_OPTIONS) as AdPeriod[];

function getPlanId(vehicle: Vehicle): SkyAdPlanId {
  return `${vehicle}_monthly` as SkyAdPlanId;
}

function detectLocale(): { currency: AdCurrency } {
  if (typeof navigator === "undefined") return { currency: "usd" };
  const lang = navigator.language || "";
  return { currency: lang.startsWith("pt") ? "brl" : "usd" };
}

export default function NewAdPage() {
  const [currency, setCurrency] = useState<AdCurrency>("usd");
  const [vehicle, setVehicle] = useState<Vehicle>("plane");
  const [period, setPeriod] = useState<AdPeriod>("1m");
  const [brand, setBrand] = useState("");
  const [text, setText] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#f8d880");
  const [bgColor, setBgColor] = useState("#1a1018");
  const [link, setLink] = useState("");
  const [loading, setLoading] = useState(false);
  const [pixLoading, setPixLoading] = useState(false);
  const [pixModal, setPixModal] = useState<{ brCode: string; brCodeBase64: string; adId: string; successUrl: string } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const locale = detectLocale();
    setCurrency(locale.currency);
  }, []);

  const planId = getPlanId(vehicle);
  const priceCents = getPriceCents(planId, currency, period);
  const priceLabel = formatPrice(priceCents, currency);

  const textLength = text.length;
  const textOver = textLength > MAX_TEXT_LENGTH;
  const hexValid = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v);
  const colorValid = hexValid(color);
  const bgColorValid = hexValid(bgColor);

  const canSubmit = text.trim().length > 0 && !textOver && colorValid && bgColorValid && !loading && !pixLoading;

  async function handleSubmit() {
    if (!canSubmit) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/ads/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_id: planId, period, brand: brand.trim() || undefined, text: text.trim(), description: description.trim() || undefined, color, bgColor, currency, link: link.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong");
        setLoading(false);
        return;
      }
      if (data.url) window.location.href = data.url;
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  const showPix = currency === "brl";
  const brlPrice = formatPrice(getPriceCents(planId, "brl", period), "brl");
  const isMonthly = period === "1m";

  async function handlePix() {
    if (!canSubmit) return;
    setPixLoading(true);
    setError("");
    try {
      const res = await fetch("/api/ads/checkout/pix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan_id: planId,
          period,
          brand: brand.trim() || undefined,
          text: text.trim(),
          description: description.trim() || undefined,
          color,
          bgColor,
          link: link.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong");
        setPixLoading(false);
        return;
      }
      setPixModal({ brCode: data.brCode, brCodeBase64: data.brCodeBase64, adId: data.adId, successUrl: `/ads/dashboard/${data.adId}` });
    } catch {
      setError("Network error. Please try again.");
    }
    setPixLoading(false);
  }

  const isSky = vehicle === "plane" || vehicle === "blimp";

  return (
    <div>
      <Link href="/ads/dashboard" className="text-xs text-muted transition-colors hover:text-cream">&larr; Dashboard</Link>

      <h1 className="mt-4 text-lg text-cream">New Ad</h1>

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

        {/* Config panel */}
        <div className="border-[3px] border-border p-4 sm:p-5">
          {/* Format */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[10px] text-muted normal-case">Format</p>
              <p className="text-[9px] text-dim normal-case">
                {isSky ? "flies across the skyline" : "mounted on top buildings"}
              </p>
            </div>
            <div className="flex gap-1.5">
              {VEHICLES.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setVehicle(v.id)}
                  className="flex flex-1 flex-col items-center gap-1 border-[3px] px-1 py-2 text-center transition-colors"
                  style={{
                    borderColor: vehicle === v.id ? ACCENT : "var(--color-border)",
                    backgroundColor: vehicle === v.id ? `${ACCENT}10` : "transparent",
                  }}
                >
                  <span className="text-sm">{v.icon}</span>
                  <span className="text-[8px] normal-case" style={{ color: vehicle === v.id ? ACCENT : "var(--color-muted)" }}>{v.name}</span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-[9px] text-dim normal-case">
              {VEHICLE_STATS[vehicle].impressions} impressions/mo · {VEHICLE_STATS[vehicle].ctr} CTR · {VEHICLE_STATS[vehicle].clicks} clicks/mo
            </p>
          </div>

          {/* Period */}
          <div className="mt-4">
            <p className="mb-2 text-[10px] text-muted normal-case">Duration</p>
            <div className="flex flex-wrap gap-1.5">
              {PERIODS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className="border-[2px] px-2.5 py-1.5 text-[9px] transition-colors"
                  style={{
                    borderColor: period === p ? ACCENT : "var(--color-border)",
                    color: period === p ? ACCENT : "var(--color-muted)",
                    backgroundColor: period === p ? `${ACCENT}10` : "transparent",
                  }}
                >
                  {PERIOD_OPTIONS[p].label}
                </button>
              ))}
            </div>
          </div>

          {/* Currency + Price */}
          <div className="mt-4 flex items-center gap-3">
            <div className="flex border-[2px] border-border text-[9px]">
              {(["usd", "brl"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCurrency(c)}
                  className="px-3 py-1.5 transition-colors"
                  style={{ backgroundColor: currency === c ? ACCENT : "transparent", color: currency === c ? "#1a1018" : "var(--color-muted)" }}
                >
                  {c.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="ml-auto text-right">
              <span className="text-lg" style={{ color: ACCENT }}>{priceLabel}</span>
              <span className="ml-1 text-[9px] text-muted normal-case">
                {period === "1m" ? "/mo" : `for ${PERIOD_OPTIONS[period].label}`}
              </span>
            </div>
          </div>

          <div className="my-4 border-t-[2px] border-border" />

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

          {/* Submit */}
          <div className="mt-5">
            {error && (
              <div className="mb-3 border-[3px] px-4 py-3 text-center text-xs normal-case" style={{ borderColor: "#ff6b6b", color: "#ff6b6b", backgroundColor: "#ff6b6b10" }}>
                {error}
              </div>
            )}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="btn-press w-full py-3 text-sm text-bg transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
              style={{ backgroundColor: ACCENT, boxShadow: "4px 4px 0 0 #5a7a00" }}
            >
              {loading
                ? "Redirecting..."
                : isMonthly
                  ? `Subscribe ${priceLabel}/mo`
                  : `Pay ${priceLabel}`}
            </button>
            {showPix && (
              <button
                type="button"
                onClick={handlePix}
                disabled={!canSubmit || pixLoading}
                className="btn-press mt-2 w-full py-3 text-sm transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
                style={{
                  backgroundColor: "transparent",
                  border: `2px solid ${ACCENT}`,
                  color: ACCENT,
                  boxShadow: "4px 4px 0 0 #5a7a00",
                }}
              >
                {pixLoading ? "Generating PIX..." : `Pay ${brlPrice} with PIX`}
              </button>
            )}
            <p className="mt-1 text-center text-[9px] text-muted normal-case">
              {showPix && isMonthly
                ? "Card = monthly subscription (auto-renews). PIX = one-time payment for 30 days."
                : showPix
                  ? "Card or PIX. Secure checkout."
                  : isMonthly
                    ? "Monthly subscription, cancel anytime. Secure checkout via Stripe."
                    : "Secure checkout via Stripe."}
            </p>
          </div>
        </div>
      </div>

      {pixModal && (
        <AdPixModal
          brCode={pixModal.brCode}
          brCodeBase64={pixModal.brCodeBase64}
          adId={pixModal.adId}
          planLabel={`Git City Ad: ${SKY_AD_PLANS[planId].label} (${period})`}
          successUrl={pixModal.successUrl}
          onClose={() => setPixModal(null)}
        />
      )}
    </div>
  );
}
