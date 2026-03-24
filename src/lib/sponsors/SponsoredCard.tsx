"use client";

import { useEffect } from "react";
import type { SponsorConfig } from "./registry";
import { trackLandmarkCardViewed, trackLandmarkCtaClicked } from "@/lib/himetrica";
import { trackAdEvent, appendClickId } from "@/lib/skyAds";
import { getLandmarkAdId } from "./landmarkAdIds";

function buildUtmUrl(config: SponsorConfig): string {
  const url = new URL(config.url);
  const now = new Date();
  const month = `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, "0")}`;
  url.searchParams.set("utm_source", "gitcity");
  url.searchParams.set("utm_medium", "sponsored_landmark");
  url.searchParams.set("utm_campaign", `${config.slug}_${month}`);
  return url.toString();
}

interface SponsoredCardProps {
  config: SponsorConfig;
  onClose: () => void;
}

export default function SponsoredCard({ config, onClose }: SponsoredCardProps) {
  const { accent } = config;
  const ctaUrl = buildUtmUrl(config);

  // Track card view on mount
  useEffect(() => {
    trackLandmarkCardViewed(config.slug);
    const adId = getLandmarkAdId(config.slug);
    if (adId) trackAdEvent(adId, "click");
  }, [config.slug]);

  return (
    <>
      {/* Nav hints — desktop only */}
      <div className="pointer-events-none fixed bottom-6 right-6 z-30 hidden text-right text-[9px] leading-loose text-muted sm:block">
        <div><span style={{ color: accent }}>ESC</span> close</div>
      </div>

      {/* Card container */}
      <div className="pointer-events-auto fixed z-40
        bottom-0 left-0 right-0
        sm:bottom-auto sm:left-auto sm:right-5 sm:top-1/2 sm:-translate-y-1/2"
      >
        <div className="relative border-t-[3px] border-border bg-bg-raised/95 backdrop-blur-sm
          w-full max-h-[50vh] overflow-y-auto sm:w-[320px] sm:border-[3px] sm:max-h-[85vh]
          animate-[slide-up_0.2s_ease-out] sm:animate-none"
        >
          {/* Close */}
          <button
            onClick={onClose}
            className="absolute top-2 right-3 text-[10px] text-muted transition-colors hover:text-cream z-10"
          >
            ESC
          </button>

          {/* Drag handle on mobile */}
          <div className="flex justify-center py-2 sm:hidden">
            <div className="h-1 w-10 rounded-full bg-border" />
          </div>

          {/* Header */}
          <div className="px-4 pb-3 sm:pt-4">
            <div className="flex items-center gap-3">
              {/* Logo icon */}
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center border-2 rounded-lg"
                style={{ borderColor: accent, backgroundColor: accent + "11", color: accent }}
              >
                {config.logoSvg ?? (
                  <span className="text-sm font-bold">{config.name[0]}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold" style={{ color: accent }}>
                  {config.name}
                </p>
                <p className="text-[10px] text-muted">{config.tagline}</p>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="mx-4 h-px bg-border" />

          {/* Info */}
          <div className="px-4 py-3 space-y-2">
            <p className="text-[10px] text-muted leading-relaxed">
              {config.description}
            </p>

            {/* Features */}
            <div className="space-y-1">
              {config.features.map((feat) => (
                <div key={feat} className="flex items-center gap-1.5">
                  <div className="h-1 w-1 rounded-full" style={{ backgroundColor: accent }} />
                  <span className="text-[9px] text-muted">{feat}</span>
                </div>
              ))}
            </div>

            {/* Sponsored badge */}
            <div className="flex items-center gap-1.5 pt-1">
              <div
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: accent }}
              />
              <span className="text-[9px]" style={{ color: accent + "99" }}>Sponsored landmark</span>
            </div>
          </div>

          {/* Divider */}
          <div className="mx-4 h-px bg-border" />

          {/* Action */}
          <div className="px-4 py-3">
            <a
              href={ctaUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={async (e) => {
                trackLandmarkCtaClicked(config.slug, ctaUrl);
                const adId = getLandmarkAdId(config.slug);
                if (adId) {
                  e.preventDefault();
                  const clickId = await trackAdEvent(adId, "cta_click");
                  const finalUrl = clickId ? appendClickId(ctaUrl, clickId) : ctaUrl;
                  window.open(finalUrl, "_blank", "noopener,noreferrer");
                }
              }}
              className="block w-full py-2 text-center text-[10px] font-bold uppercase tracking-wider border-2 transition-all hover:brightness-110"
              style={{
                borderColor: accent,
                color: accent,
                backgroundColor: accent + "11",
              }}
            >
              Visit {new URL(config.url).hostname}
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
