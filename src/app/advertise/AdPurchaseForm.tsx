"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { SKY_AD_PLANS, getPriceCents, getFullPriceCents, formatPrice, PROMO_DISCOUNT, PROMO_LABEL, type SkyAdPlanId, type AdCurrency } from "@/lib/skyAdPlans";
import { MAX_TEXT_LENGTH } from "@/lib/skyAds";

const AdPreview = dynamic(() => import("@/components/AdPreview"), { ssr: false });

const ACCENT = "#c8e64a";

type Vehicle = "plane" | "blimp" | "billboard" | "rooftop_sign" | "led_wrap";
type Duration = "weekly" | "monthly";

const VEHICLES: { id: Vehicle; icon: string; name: string }[] = [
  { id: "plane", icon: "\u2708", name: "Plane" },
  { id: "led_wrap", icon: "\uD83D\uDCA1", name: "LED Wrap" },
  { id: "billboard", icon: "\uD83D\uDCCB", name: "Billboard" },
  { id: "rooftop_sign", icon: "\uD83D\uDD04", name: "Rooftop" },
  { id: "blimp", icon: "\u25C6", name: "Blimp" },
];

function getPlanId(vehicle: Vehicle, duration: Duration): SkyAdPlanId {
  return `${vehicle}_${duration}` as SkyAdPlanId;
}

function detectLocale(): { currency: AdCurrency; isBrazil: boolean } {
  if (typeof navigator === "undefined") return { currency: "usd", isBrazil: false };
  const lang = navigator.language || "";
  const isBrazil = lang.startsWith("pt");
  return { currency: isBrazil ? "brl" : "usd", isBrazil };
}

const PIX_EXPIRY_SECONDS = 900; // 15 minutes

export function AdPurchaseForm() {
  const [currency, setCurrency] = useState<AdCurrency>("usd");
  const [vehicle, setVehicle] = useState<Vehicle>("plane");
  const [duration, setDuration] = useState<Duration>("weekly");
  const [text, setText] = useState("");
  const [color, setColor] = useState("#f8d880");
  const [bgColor, setBgColor] = useState("#1a1018");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isBrazil, setIsBrazil] = useState(false);
  const [pixData, setPixData] = useState<{ brCode: string; brCodeBase64: string; trackingToken: string } | null>(null);
  const [pixCopied, setPixCopied] = useState(false);
  const [pixCountdown, setPixCountdown] = useState(PIX_EXPIRY_SECONDS);
  const [pixPaid, setPixPaid] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const locale = detectLocale();
    setCurrency(locale.currency);
    setIsBrazil(locale.isBrazil);
  }, []);

  // PIX countdown timer
  useEffect(() => {
    if (!pixData || pixPaid) return;
    setPixCountdown(PIX_EXPIRY_SECONDS);
    const timer = setInterval(() => {
      setPixCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setPixData(null);
          setError("PIX expired. Please try again.");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [pixData, pixPaid]);

  // Poll for payment confirmation
  const checkAdPaid = useCallback(async (token: string) => {
    try {
      const res = await fetch(`/api/sky-ads/status?token=${token}`);
      if (res.ok) {
        const data = await res.json();
        if (data.active) {
          setPixPaid(true);
          if (pollRef.current) clearInterval(pollRef.current);
          window.location.href = `/advertise/setup/${token}`;
        }
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!pixData || pixPaid) return;
    pollRef.current = setInterval(() => checkAdPaid(pixData.trackingToken), 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [pixData, pixPaid, checkAdPaid]);

  const planId = getPlanId(vehicle, duration);
  const plan = SKY_AD_PLANS[planId];
  const priceCents = getPriceCents(planId, currency);
  const priceLabel = formatPrice(priceCents, currency);
  const fullPriceCents = getFullPriceCents(planId, currency);
  const hasDiscount = PROMO_DISCOUNT < 1;

  const textLength = text.length;
  const textOver = textLength > MAX_TEXT_LENGTH;
  const hexValid = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v);
  const colorValid = hexValid(color);
  const bgColorValid = hexValid(bgColor);

  const canSubmit =
    text.trim().length > 0 &&
    !textOver &&
    colorValid &&
    bgColorValid &&
    !loading;

  async function handleSubmit(provider: "stripe" | "abacatepay" = "stripe") {
    if (!canSubmit) return;
    setLoading(true);
    setError("");
    setPixData(null);
    try {
      const res = await fetch("/api/sky-ads/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan_id: planId,
          text: text.trim(),
          color,
          bgColor,
          currency,
          provider,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong");
        setLoading(false);
        return;
      }
      if (data.brCode) {
        setPixData({ brCode: data.brCode, brCodeBase64: data.brCodeBase64, trackingToken: data.trackingToken });
        setLoading(false);
      } else if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  const isSky = vehicle === "plane" || vehicle === "blimp";

  return (
    <div>
      {/* Promo */}
      {PROMO_DISCOUNT < 1 && (
        <div
          className="mb-6 border-[3px] p-3 text-center text-xs"
          style={{ borderColor: ACCENT, color: ACCENT }}
        >
          {PROMO_LABEL}
        </div>
      )}

      {/* ── 3D Preview (hero) ── */}
      <AdPreview
        vehicle={vehicle}
        text={text}
        color={colorValid ? color : "#f8d880"}
        bgColor={bgColorValid ? bgColor : "#1a1018"}
      />

      {/* ── Control Panel ── */}
      <div className="mt-4 border-[3px] border-border p-4 sm:p-5">

        {/* Row 1: Format selector */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[10px] text-muted normal-case">Format</p>
            <p className="text-[9px] text-dim normal-case">
              {isSky ? "flies across the entire city skyline" : "mounted on the tallest buildings (top contributors)"}
            </p>
          </div>
          <div className="flex gap-1.5">
            {VEHICLES.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setVehicle(v.id)}
                className="flex flex-1 flex-col items-center gap-1 border-[3px] px-1 py-2.5 text-center transition-colors"
                style={{
                  borderColor: vehicle === v.id ? ACCENT : "var(--color-border)",
                  backgroundColor: vehicle === v.id ? `${ACCENT}10` : "transparent",
                }}
              >
                <span className="text-sm">{v.icon}</span>
                <span
                  className="text-[8px] normal-case leading-tight"
                  style={{ color: vehicle === v.id ? ACCENT : "var(--color-muted)" }}
                >
                  {v.name}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Row 2: Duration + Currency + Price */}
        <div className="mt-4 flex items-center gap-3">
          {/* Duration toggle */}
          <div className="flex border-[2px] border-border text-[9px]">
            {(["weekly", "monthly"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDuration(d)}
                className="px-3 py-1.5 transition-colors"
                style={{
                  backgroundColor: duration === d ? ACCENT : "transparent",
                  color: duration === d ? "#1a1018" : "var(--color-muted)",
                }}
              >
                {d === "weekly" ? `7 days` : `30 days`}
              </button>
            ))}
          </div>

          {/* Currency toggle */}
          <div className="flex border-[2px] border-border text-[9px]">
            {(["usd", "brl"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCurrency(c)}
                className="px-3 py-1.5 transition-colors"
                style={{
                  backgroundColor: currency === c ? ACCENT : "transparent",
                  color: currency === c ? "#1a1018" : "var(--color-muted)",
                }}
              >
                {c.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Price */}
          <div className="ml-auto text-right">
            <span className="text-lg" style={{ color: ACCENT }}>
              {priceLabel}
            </span>
            {hasDiscount && (
              <span className="ml-2 text-[10px] text-muted line-through normal-case">
                {formatPrice(fullPriceCents, currency)}
              </span>
            )}
            <span className="ml-1 text-[9px] text-muted normal-case">
              / {plan.duration_days}d
            </span>
          </div>
        </div>

        {/* Divider */}
        <div className="my-4 border-t-[2px] border-border" />

        {/* Row 3: Text input */}
        <div>
          <div className="flex items-baseline justify-between">
            <label className="text-[10px] text-muted normal-case">
              Banner text
            </label>
            <span
              className="text-[9px] normal-case"
              style={{ color: textOver ? "#ff6b6b" : "var(--color-muted)" }}
            >
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

        {/* Row 4: Colors side by side */}
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] text-muted normal-case">
              Text color
            </label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-8 w-8 cursor-pointer border-[2px] border-border bg-transparent"
              />
              <input
                type="text"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                maxLength={7}
                className="w-full border-[2px] border-border bg-transparent px-2 py-1.5 font-pixel text-[10px] text-cream outline-none transition-colors focus:border-[#c8e64a]"
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] text-muted normal-case">
              Background
            </label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="color"
                value={bgColor}
                onChange={(e) => setBgColor(e.target.value)}
                className="h-8 w-8 cursor-pointer border-[2px] border-border bg-transparent"
              />
              <input
                type="text"
                value={bgColor}
                onChange={(e) => setBgColor(e.target.value)}
                maxLength={7}
                className="w-full border-[2px] border-border bg-transparent px-2 py-1.5 font-pixel text-[10px] text-cream outline-none transition-colors focus:border-[#c8e64a]"
              />
            </div>
          </div>
        </div>

        {/* Row 5: Buy buttons */}
        <div className="mt-5">
          {/* Error banner */}
          {error && (
            <div
              className="mb-3 border-[3px] px-4 py-3 text-center text-xs normal-case"
              style={{ borderColor: "#ff6b6b", color: "#ff6b6b", backgroundColor: "#ff6b6b10" }}
            >
              {error}
            </div>
          )}

          {pixData ? (
            <div className="border-[3px] border-border p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs" style={{ color: ACCENT }}>
                  PIX Payment
                </p>
                <p className="text-[9px] normal-case" style={{ color: pixCountdown < 120 ? "#ff6b6b" : "var(--color-muted)" }}>
                  {Math.floor(pixCountdown / 60)}:{String(pixCountdown % 60).padStart(2, "0")}
                </p>
              </div>
              {pixData.brCodeBase64 && (
                <div className="mx-auto mb-3 w-fit border-[3px] border-border bg-white p-2">
                  <img
                    src={`data:image/png;base64,${pixData.brCodeBase64}`}
                    alt="PIX QR Code"
                    className="h-40 w-40"
                    style={{ imageRendering: "pixelated" }}
                  />
                </div>
              )}
              <div className="mb-3">
                <p className="mb-1 text-[8px] text-muted normal-case">PIX code (copy & paste):</p>
                <div className="flex gap-1">
                  <input
                    readOnly
                    value={pixData.brCode}
                    className="min-w-0 flex-1 border-[2px] border-border bg-transparent px-2 py-1.5 font-mono text-[8px] text-cream"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(pixData.brCode);
                      setPixCopied(true);
                      setTimeout(() => setPixCopied(false), 2000);
                    }}
                    className="border-[2px] border-border px-3 py-1.5 text-[9px] text-cream hover:bg-border/20"
                  >
                    {pixCopied ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>
              <p className="text-center text-[9px] text-muted normal-case">
                {pixPaid ? "Payment confirmed! Redirecting..." : "Waiting for payment... You'll be redirected automatically."}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => handleSubmit("stripe")}
                disabled={!canSubmit}
                className="btn-press w-full py-3.5 text-sm text-bg transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
                style={{
                  backgroundColor: ACCENT,
                  boxShadow: "4px 4px 0 0 #5a7a00",
                }}
              >
                {loading ? "Redirecting..." : `Buy for ${priceLabel}`}
              </button>
              {isBrazil && (
                <button
                  type="button"
                  onClick={() => handleSubmit("abacatepay")}
                  disabled={!canSubmit}
                  className="btn-press w-full py-2.5 text-xs text-bg transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
                  style={{
                    backgroundColor: "#32bcad",
                    boxShadow: "3px 3px 0 0 #1a7a6e",
                  }}
                >
                  {loading ? "..." : `Pay with PIX (${formatPrice(getPriceCents(planId, "brl"), "brl")})`}
                </button>
              )}
              <p className="mt-1 text-center text-[9px] text-muted normal-case">
                Secure checkout. No account needed.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
