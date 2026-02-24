"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";

const AdPreview = dynamic(() => import("@/components/AdPreview"), { ssr: false });

const ACCENT = "#c8e64a";

const VEHICLE_ICONS: Record<string, string> = {
  plane: "\u2708",
  blimp: "\u25C6",
  billboard: "\uD83D\uDCCB",
  rooftop_sign: "\uD83D\uDD04",
  led_wrap: "\uD83D\uDCA1",
};

function ClickPreview({
  vehicle,
  color,
  brand,
  description,
  link,
}: {
  vehicle: string;
  color: string;
  brand: string;
  description: string;
  link: string;
}) {
  const vehicleIcon = VEHICLE_ICONS[vehicle] ?? "\u2708";
  const hostname = link
    ? (() => {
        try {
          return new URL(link).hostname.replace("www.", "");
        } catch {
          return link;
        }
      })()
    : null;
  const isMailto = link?.startsWith("mailto:");

  /* Matches the real Sky Ad Card from page.tsx exactly */
  return (
    <div className="w-full border-[3px] border-border bg-bg-raised/95 backdrop-blur-sm sm:w-[340px]">
      {/* Drag handle (mobile indicator) */}
      <div className="flex justify-center py-2 sm:hidden">
        <div className="h-1 w-10 rounded-full bg-border" />
      </div>

      {/* Header: brand + sponsored tag */}
      <div className="flex items-center gap-3 px-4 pb-3 sm:pt-4">
        <div
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center border-[2px] text-sm font-bold"
          style={{ borderColor: ACCENT, color: ACCENT }}
        >
          {brand ? brand[0].toUpperCase() : "?"}
        </div>
        <div className="min-w-0 flex-1">
          {brand ? (
            <p className="truncate text-sm text-cream">{brand}</p>
          ) : (
            <p className="truncate text-sm text-muted/30 normal-case">Brand name</p>
          )}
          <p className="text-[9px] text-dim">Sponsored</p>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-4 mb-3 h-px bg-border" />

      {/* Description */}
      {description ? (
        <p className="mx-4 mb-4 text-xs text-cream normal-case leading-relaxed">
          {description}
        </p>
      ) : (
        <p className="mx-4 mb-4 text-xs text-muted/30 normal-case leading-relaxed">
          Your description will appear here
        </p>
      )}

      {/* CTA */}
      <div className="px-4 pb-5 sm:pb-4">
        <span
          className="btn-press block w-full py-2.5 text-center text-[10px] text-bg"
          style={{
            backgroundColor: ACCENT,
            boxShadow: "4px 4px 0 0 #5a7a00",
          }}
        >
          {link
            ? isMailto
              ? "Send Email \u2192"
              : `Visit ${hostname} \u2192`
            : "Visit yoursite.com \u2192"}
        </span>
      </div>
    </div>
  );
}

export function SetupContent({
  token,
  ad,
  vehicleLabel,
}: {
  token: string;
  ad: {
    id: string;
    text: string;
    color: string;
    bg_color: string;
    vehicle: string;
    brand: string | null;
    description: string | null;
    link: string | null;
  };
  vehicleLabel: string;
}) {
  const [brand, setBrand] = useState(ad.brand ?? "");
  const [description, setDescription] = useState(ad.description ?? "");
  const [link, setLink] = useState(ad.link ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const linkValid =
    !link || link.startsWith("https://") || link.startsWith("mailto:");

  async function handleSave() {
    if (!linkValid) return;
    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/sky-ads/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          brand: brand || undefined,
          description: description || undefined,
          link: link || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Something went wrong");
        setSaving(false);
        return;
      }

      window.location.href = `/advertise/track/${token}`;
    } catch {
      setError("Network error. Please try again.");
      setSaving(false);
    }
  }

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-2">
      {/* Left: Previews (sticky on desktop) */}
      <div className="lg:sticky lg:top-8 lg:self-start space-y-6">
        {/* 3D Preview */}
        <AdPreview
          vehicle={ad.vehicle}
          text={ad.text}
          color={ad.color}
          bgColor={ad.bg_color}
          tall
        />

        {/* Live click modal preview */}
        <div>
          <p className="mb-2 text-xs text-muted normal-case">
            What visitors see when they click your ad
          </p>
          <ClickPreview
            vehicle={ad.vehicle}
            color={ad.color}
            brand={brand}
            description={description}
            link={link}
          />
        </div>
      </div>

      {/* Right: Setup form */}
      <div>
        <h2 className="text-base text-cream">
          Add <span style={{ color: ACCENT }}>details</span>{" "}
          <span className="text-xs text-muted normal-case">(optional)</span>
        </h2>
        <p className="mt-2 text-xs text-muted normal-case">
          These show when someone clicks your ad. You can always update them
          later.
        </p>

        <div className="mt-5 space-y-5">
          {/* Brand name */}
          <div>
            <label className="block text-xs text-muted normal-case">
              Brand name
            </label>
            <input
              type="text"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              maxLength={60}
              placeholder="Your Company"
              className="mt-1 w-full border-[3px] border-border bg-transparent px-3 py-2.5 font-pixel text-sm text-cream outline-none transition-colors focus:border-[#c8e64a]"
            />
            <p className="mt-1 text-[11px] text-muted normal-case">
              {brand.length}/60
            </p>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs text-muted normal-case">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={200}
              rows={4}
              placeholder="Tell visitors about your product or service. This shows when someone clicks your ad."
              className="mt-1 w-full resize-y border-[3px] border-border bg-transparent px-3 py-2.5 text-sm text-cream normal-case outline-none transition-colors focus:border-[#c8e64a]"
              style={{ fontFamily: "inherit", lineHeight: "1.6" }}
            />
            <p className="mt-1 text-[11px] text-muted normal-case">
              {description.length}/200
            </p>
          </div>

          {/* Link */}
          <div>
            <label className="block text-xs text-muted normal-case">
              Link
            </label>
            <input
              type="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://yoursite.com"
              className="mt-1 w-full border-[3px] border-border bg-transparent px-3 py-2.5 font-pixel text-sm text-cream outline-none transition-colors focus:border-[#c8e64a]"
            />
            {link && !linkValid && (
              <p
                className="mt-1 text-[11px] normal-case"
                style={{ color: "#ff6b6b" }}
              >
                Must start with https:// or mailto:
              </p>
            )}
            <p className="mt-1 text-[11px] text-muted normal-case">
              Where should clicks go?
            </p>
          </div>

          {/* Error */}
          {error && (
            <div
              className="border-[3px] px-4 py-3 text-center text-xs normal-case"
              style={{
                borderColor: "#ff6b6b",
                color: "#ff6b6b",
                backgroundColor: "#ff6b6b10",
              }}
            >
              {error}
            </div>
          )}

          {/* CTAs */}
          <div className="flex flex-col items-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !linkValid}
              className="btn-press w-full py-3.5 text-sm text-bg transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
              style={{
                backgroundColor: ACCENT,
                boxShadow: "4px 4px 0 0 #5a7a00",
              }}
            >
              {saving ? "Saving..." : "Save & Go to Dashboard"}
            </button>
            <Link
              href={`/advertise/track/${token}`}
              className="text-xs text-muted normal-case transition-colors hover:text-cream"
            >
              Skip to dashboard &rarr;
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
