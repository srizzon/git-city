"use client";

import { useEffect } from "react";
import type { SponsorConfig } from "./registry";
import { trackLandmarkCardViewed, trackLandmarkCtaClicked } from "@/lib/himetrica";
import { trackAdEvent, appendClickId } from "@/lib/skyAds";
import { getLandmarkAdId } from "./landmarkAdIds";

const GOLD = "#ffce4a";

function buildUtmUrl(config: SponsorConfig): string {
  const url = new URL(config.url);
  const now = new Date();
  const month = `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, "0")}`;
  url.searchParams.set("utm_source", "gitcity");
  url.searchParams.set("utm_medium", "sponsor_landmark");
  url.searchParams.set("utm_campaign", `${config.slug}_${month}`);
  return url.toString();
}

interface Props {
  config: SponsorConfig;
  onClose: () => void;
}

/**
 * Dedicated card for Git City's own "become a sponsor" landmark.
 * Unlike the generic SponsoredCard, this one sells the project itself:
 * a personal, honest pitch + the concrete perks a supporter gets.
 */
export default function SponsorCityCard({ config, onClose }: Props) {
  const ctaUrl = buildUtmUrl(config);

  useEffect(() => {
    trackLandmarkCardViewed(config.slug);
    const adId = getLandmarkAdId(config.slug);
    if (adId) trackAdEvent(adId, "click");
  }, [config.slug]);

  const perks = [
    {
      title: "A sponsor flair on your building",
      body: "An exclusive in-city mark every visitor can see on your tower.",
    },
    {
      title: "Your name in the city credits",
      body: "Listed permanently on the Git City supporters wall.",
    },
  ];

  return (
    <>
      {/* Nav hint — desktop only */}
      <div className="pointer-events-none fixed bottom-6 right-6 z-30 hidden text-right text-[9px] leading-loose text-muted sm:block">
        <div><span style={{ color: GOLD }}>ESC</span> close</div>
      </div>

      {/* Card */}
      <div className="pointer-events-auto fixed z-40
        bottom-0 left-0 right-0
        sm:bottom-auto sm:left-auto sm:right-5 sm:top-1/2 sm:-translate-y-1/2"
      >
        <div
          className="relative overflow-y-auto bg-[#0c0c10]/95 backdrop-blur-sm
            w-full max-h-[62vh]
            sm:w-[340px] sm:max-h-[88vh]
            animate-[slide-up_0.2s_ease-out] sm:animate-none"
          style={{ borderTop: `3px solid ${GOLD}`, boxShadow: `0 0 0 1px ${GOLD}22, 0 0 40px ${GOLD}1f` }}
        >
          {/* Close */}
          <button
            onClick={onClose}
            className="absolute top-2 right-3 z-10 text-[10px] text-muted transition-colors hover:text-cream"
          >
            ESC
          </button>

          {/* Drag handle on mobile */}
          <div className="flex justify-center py-2 sm:hidden">
            <div className="h-1 w-10 rounded-full" style={{ backgroundColor: GOLD + "55" }} />
          </div>

          {/* Header */}
          <div className="px-5 pb-3 pt-2 sm:pt-5">
            <div className="flex items-center gap-3">
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border-2"
                style={{ borderColor: GOLD, backgroundColor: GOLD + "14", color: GOLD }}
              >
                {/* Heart glyph */}
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[9px] uppercase tracking-[0.18em]" style={{ color: GOLD + "aa" }}>
                  An indie project
                </p>
                <p className="text-base font-bold leading-tight" style={{ color: GOLD }}>
                  Sponsor Git City
                </p>
              </div>
            </div>
          </div>

          <div className="mx-5 h-px" style={{ backgroundColor: GOLD + "22" }} />

          {/* Pitch */}
          <div className="px-5 py-3">
            <p className="text-[11px] leading-relaxed text-cream/85">
              I build Git City on my own, turning real GitHub activity into a
              living 3D city. No investors, no paywalls. Sponsors are what keep
              the servers running and the city free for every developer.
            </p>
          </div>

          {/* Perks */}
          <div className="px-5 pb-1">
            <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.18em] text-muted">
              What you get
            </p>
            <div className="space-y-2.5">
              {perks.map((p) => (
                <div key={p.title} className="flex gap-2.5">
                  <svg
                    width="14" height="14" viewBox="0 0 24 24" fill={GOLD}
                    className="mt-[1px] shrink-0" aria-hidden
                  >
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                  </svg>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold leading-snug text-cream">{p.title}</p>
                    <p className="text-[10px] leading-snug text-muted">{p.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Impact */}
          <div className="px-5 py-3">
            <p className="text-[10px] leading-relaxed" style={{ color: GOLD + "cc" }}>
              Every sponsor directly funds the next feature, district and event.
            </p>
          </div>

          {/* CTA */}
          <div className="px-5 pb-3">
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
              className="block w-full py-2.5 text-center text-[11px] font-bold uppercase tracking-wider transition-all hover:brightness-110"
              style={{ backgroundColor: GOLD, color: "#0c0c10" }}
            >
              Become a sponsor
            </a>
            <p className="mt-2 text-center text-[9px] text-muted">
              Powered by GitHub Sponsors. Cancel anytime.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
