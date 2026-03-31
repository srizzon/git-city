"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

const ACCENT = "#c8e64a";
const CREAM = "#e8dcc8";
const TOTAL_SLIDES = 5;

const SLIDE_LABELS = ["Cover", "Audience", "Formats", "Results", "Contact"];

/* ─────────────── main component ─────────────── */
export default function MediaKitDeck() {
  const [active, setActive] = useState(0);
  const [dir, setDir] = useState<"next" | "prev">("next");

  const go = useCallback(
    (idx: number) => {
      if (idx < 0 || idx >= TOTAL_SLIDES || idx === active) return;
      setDir(idx > active ? "next" : "prev");
      setActive(idx);
    },
    [active],
  );

  const next = useCallback(() => go(active + 1), [go, active]);
  const prev = useCallback(() => go(active - 1), [go, active]);

  /* keyboard navigation */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === " ") {
        e.preventDefault();
        next();
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        prev();
      }
      if (e.key === "Home") {
        e.preventDefault();
        go(0);
      }
      if (e.key === "End") {
        e.preventDefault();
        go(TOTAL_SLIDES - 1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, go]);

  /* swipe on mobile */
  useEffect(() => {
    let startX = 0;
    let startY = 0;
    function onStart(e: TouchEvent) {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    }
    function onEnd(e: TouchEvent) {
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
        if (dx < 0) next();
        else prev();
      }
    }
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
    };
  }, [next, prev]);

  const slides = [
    <SlideCover key="cover" />,
    <SlideAudience key="audience" />,
    <SlideFormats key="formats" />,
    <SlideResults key="results" />,
    <SlideContact key="contact" />,
  ];

  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-bg font-pixel uppercase text-warm select-none">
      {/* ── slide content ── */}
      <div
        className="absolute inset-0 overflow-y-auto px-6 pb-20 pt-12 sm:px-12 sm:pt-16 md:px-20"
        key={active}
        style={{
          animation: `${dir === "next" ? "slideInRight" : "slideInLeft"} 0.3s ease-out`,
        }}
      >
        <div className="flex min-h-full items-center justify-center">
          {slides[active]}
        </div>
      </div>

      {/* ── bottom bar ── */}
      <div className="absolute bottom-0 left-0 right-0 z-50 flex items-center justify-between border-t-2 border-border bg-bg/80 px-4 py-3 backdrop-blur-sm sm:px-8">
        {/* left: back + counter */}
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="text-xs text-dim transition-colors hover:text-cream sm:text-sm"
          >
            &larr; City
          </Link>
          <span className="text-sm text-muted sm:text-base">
            <span style={{ color: CREAM }}>
              {String(active + 1).padStart(2, "0")}
            </span>
            <span className="text-dim"> / {TOTAL_SLIDES}</span>
          </span>
        </div>

        {/* center: progress bar */}
        <div className="hidden flex-1 items-center justify-center gap-1.5 px-8 md:flex">
          {SLIDE_LABELS.map((label, i) => (
            <button
              key={label}
              onClick={() => go(i)}
              className="group relative"
              aria-label={label}
            >
              <div
                className="h-1.5 w-8 transition-all lg:w-10"
                style={{
                  background:
                    i === active
                      ? ACCENT
                      : i < active
                        ? ACCENT + "60"
                        : "#2a2a30",
                }}
              />
              <span className="absolute -top-7 left-1/2 -translate-x-1/2 text-[10px] text-muted opacity-0 transition-opacity group-hover:opacity-100">
                {label}
              </span>
            </button>
          ))}
        </div>

        {/* right: nav arrows */}
        <div className="flex items-center gap-2">
          <button
            onClick={prev}
            disabled={active === 0}
            className="btn-press border-2 border-border px-3 py-1.5 text-sm text-cream transition-colors hover:border-border-light disabled:opacity-30 sm:px-4 sm:py-2 sm:text-base"
          >
            &larr;
          </button>
          <button
            onClick={next}
            disabled={active === TOTAL_SLIDES - 1}
            className="btn-press border-2 border-border px-3 py-1.5 text-sm text-cream transition-colors hover:border-border-light disabled:opacity-30 sm:px-4 sm:py-2 sm:text-base"
          >
            &rarr;
          </button>
        </div>
      </div>

      {/* ── slide label top-right ── */}
      <div className="absolute right-4 top-4 z-50 text-sm text-dim sm:right-8 sm:top-6 sm:text-base">
        {SLIDE_LABELS[active]}
      </div>

      {/* ── animations ── */}
      <style jsx global>{`
        @keyframes slideInRight {
          from {
            opacity: 0;
            transform: translateX(60px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        @keyframes slideInLeft {
          from {
            opacity: 0;
            transform: translateX(-60px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </main>
  );
}

/* ─────────────── slides ─────────────── */

function SlideCover() {
  return (
    <div className="flex flex-col items-center gap-8 text-center">
      <div className="text-6xl sm:text-8xl lg:text-9xl">
        <span style={{ color: CREAM }}>GIT</span>{" "}
        <span style={{ color: ACCENT }}>CITY</span>
      </div>
      <p className="max-w-lg text-base leading-relaxed text-muted normal-case sm:text-xl lg:text-2xl">
        Put your brand in front of 156,000+ developers inside a 3D city built
        from real GitHub data
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        <Pill>156K+ visitors</Pill>
        <Pill>512K+ page views</Pill>
        <Pill>71K+ devs</Pill>
        <Pill>34K+ logged in</Pill>
      </div>
      <p className="mt-4 text-xs text-dim normal-case sm:text-sm">
        Press &rarr; or swipe to navigate
      </p>
    </div>
  );
}

const NOTABLE_DEVS = [
  { login: "torvalds", name: "Linus Torvalds", followers: "293K" },
  { login: "karpathy", name: "Andrej Karpathy", followers: "154K" },
  { login: "yyx990803", name: "Evan You", followers: "107K" },
  { login: "gustavoguanabara", name: "Gustavo Guanabara", followers: "111K" },
  { login: "rafaballerini", name: "Rafaella Ballerini", followers: "59K" },
  { login: "theprimeagen", name: "ThePrimeagen", followers: "48K" },
];

function SlideAudience() {
  return (
    <div className="flex w-full max-w-4xl flex-col gap-8">
      <SlideHeader n="02" title="Audience" />

      {/* Notable devs — bigger, with followers */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
        {NOTABLE_DEVS.map((dev) => (
          <div key={dev.login} className="border-[3px] border-border bg-bg-raised p-3 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://github.com/${dev.login}.png?size=80`}
              alt={dev.name}
              width={64}
              height={64}
              className="mx-auto rounded-sm border-2 border-border"
              loading="lazy"
            />
            <p className="mt-2 text-[10px] text-cream normal-case leading-tight">
              {dev.name}
            </p>
            <p className="mt-0.5 text-[10px] normal-case" style={{ color: ACCENT }}>
              {dev.followers} followers
            </p>
          </div>
        ))}
      </div>

      {/* Key facts — grid of 4 */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="border-[3px] border-border bg-bg-raised p-4 text-center">
          <p className="text-xl sm:text-2xl" style={{ color: ACCENT }}>15.7M+</p>
          <p className="mt-1 text-[10px] text-dim">Combined GitHub Stars</p>
        </div>
        <div className="border-[3px] border-border bg-bg-raised p-4 text-center">
          <p className="text-xl sm:text-2xl" style={{ color: ACCENT }}>5.2M+</p>
          <p className="mt-1 text-[10px] text-dim">Combined Followers</p>
        </div>
        <div className="border-[3px] border-border bg-bg-raised p-4 text-center">
          <p className="text-xl sm:text-2xl" style={{ color: CREAM }}>69%</p>
          <p className="mt-1 text-[10px] text-dim">Desktop</p>
        </div>
        <div className="border-[3px] border-border bg-bg-raised p-4 text-center">
          <p className="text-xl sm:text-2xl" style={{ color: CREAM }}>BR 18%</p>
          <p className="mt-1 text-[10px] text-dim">US 17% · FR 12%</p>
        </div>
      </div>

      {/* Traffic sources */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Pill>GitHub 41K</Pill>
        <Pill>Google 40K</Pill>
        <Pill>X/Twitter 12K</Pill>
        <Pill>LinkedIn 3.3K</Pill>
        <Pill>JS 14K devs</Pill>
        <Pill>Python 9K devs</Pill>
        <Pill>TypeScript 8.7K devs</Pill>
      </div>
    </div>
  );
}

function SlideFormats() {
  return (
    <div className="flex w-full max-w-4xl flex-col gap-8">
      <SlideHeader n="03" title="Formats" />
      <div className="grid gap-5 sm:grid-cols-3">
        <div className="border-[3px] border-border bg-bg-raised p-5 sm:p-6">
          <p className="mb-3 text-base text-cream sm:text-lg">Landmark</p>
          <p className="mb-4 text-sm leading-relaxed text-muted normal-case">
            An exclusive 3D building with your brand identity. Custom model,
            your colors, permanent position in the city.
          </p>
          <div className="h-0.5 bg-border" />
          <p className="mt-4 text-3xl sm:text-4xl" style={{ color: ACCENT }}>
            1.35%
          </p>
          <p className="mt-1 text-xs text-dim">CTR</p>
        </div>

        <div className="border-[3px] border-border bg-bg-raised p-5 sm:p-6">
          <p className="mb-3 text-base text-cream sm:text-lg">Rooftop Sign</p>
          <p className="mb-4 text-sm leading-relaxed text-muted normal-case">
            Illuminated rotating sign on top of the tallest buildings. Spins
            360°, visible from all angles. Direct click to your link.
          </p>
          <div className="h-0.5 bg-border" />
          <p className="mt-4 text-3xl sm:text-4xl" style={{ color: ACCENT }}>
            0.71%
          </p>
          <p className="mt-1 text-xs text-dim">
            CTR · 96% click&rarr;visit
          </p>
        </div>

        <div className="border-[3px] border-border bg-bg-raised p-5 sm:p-6">
          <p className="mb-3 text-base text-cream sm:text-lg">Blimp</p>
          <p className="mb-4 text-sm leading-relaxed text-muted normal-case">
            Airship with LED screens on both sides. Flies slowly across the
            skyline — imposing and impossible to ignore.
          </p>
          <div className="h-0.5 bg-border" />
          <p className="mt-4 text-3xl sm:text-4xl" style={{ color: ACCENT }}>
            1.40%
          </p>
          <p className="mt-1 text-xs text-dim">Engagement rate</p>
        </div>
      </div>
    </div>
  );
}

const RESULTS = [
  { advertiser: "Puentes", format: "Rooftop Sign", impressions: "88K", ctr: "0.93%" },
  { advertiser: "Git Trophy", format: "Billboard", impressions: "23K", ctr: "1.15%" },
  { advertiser: "Surf Data", format: "Rooftop Sign", impressions: "87K", ctr: "0.52%" },
];

function SlideResults() {
  return (
    <div className="flex w-full max-w-4xl flex-col gap-8">
      <SlideHeader n="04" title="Real Results" />
      <div className="grid gap-5 sm:grid-cols-3">
        {RESULTS.map((row) => (
          <div
            key={row.advertiser}
            className="border-[3px] border-border bg-bg-raised p-5 sm:p-6"
          >
            <p className="text-base text-cream sm:text-lg">{row.advertiser}</p>
            <p className="mt-1 text-xs text-dim">{row.format}</p>
            <div className="mt-4 h-0.5 bg-border" />
            <p
              className="mt-4 text-3xl sm:text-4xl"
              style={{ color: ACCENT }}
            >
              {row.ctr}
            </p>
            <p className="mt-1 text-xs text-dim">
              CTR · {row.impressions} impressions
            </p>
          </div>
        ))}
      </div>
      <div
        className="border-l-[3px] py-2 pl-5"
        style={{ borderColor: ACCENT }}
      >
        <p className="text-sm text-muted normal-case">
          Average display ad CTR in tech industry:{" "}
          <span className="text-cream">0.34%</span>
        </p>
      </div>
    </div>
  );
}

function SlideContact() {
  return (
    <div className="flex w-full max-w-4xl flex-col items-center justify-center gap-10 text-center">
      <SlideHeader n="05" title="Let's Talk" />
      <p className="max-w-xl text-base leading-relaxed text-muted normal-case sm:text-lg">
        Want your brand in the city? Let&apos;s find the best format for your
        goal.
      </p>
      <div className="flex flex-col gap-5">
        <a
          href="https://wa.me/5531983906251"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-press px-8 py-4 text-base text-bg sm:text-lg"
          style={{
            backgroundColor: ACCENT,
            boxShadow: "4px 4px 0 0 #5a7a00",
          }}
        >
          WhatsApp
        </a>
        <a
          href="mailto:hello@samuelrizzon.dev"
          className="border-[3px] border-border bg-bg-raised px-8 py-4 text-base text-cream transition-colors hover:border-border-light sm:text-lg"
        >
          hello@samuelrizzon.dev
        </a>
        <a
          href="https://x.com/samuelrizzondev"
          target="_blank"
          rel="noopener noreferrer"
          className="border-[3px] border-border bg-bg-raised px-8 py-4 text-base text-cream transition-colors hover:border-border-light sm:text-lg"
        >
          @samuelrizzondev on X
        </a>
      </div>
      <p className="mt-4 text-sm text-muted normal-case sm:text-base">
        thegitcity.com
      </p>
    </div>
  );
}

/* ─────────────── sub-components ─────────────── */

function SlideHeader({ n, title }: { n: string; title: string }) {
  return (
    <div className="flex items-baseline gap-4">
      <span className="text-4xl sm:text-5xl" style={{ color: ACCENT }}>
        {n}
      </span>
      <h2 className="text-2xl text-cream sm:text-4xl">{title}</h2>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="border-2 border-border px-3 py-1.5 text-xs text-muted sm:text-sm">
      {children}
    </span>
  );
}
