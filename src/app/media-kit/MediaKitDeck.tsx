"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

const ACCENT = "#c8e64a";
const CREAM = "#e8dcc8";
const TOTAL_SLIDES = 6;

const SLIDE_LABELS = ["Cover", "Numbers", "Audience", "Formats", "Results", "Contact"];

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
    <SlideNumbers key="numbers" />,
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
      <p className="mt-4 text-xs text-dim normal-case sm:text-sm">
        Press &rarr; or swipe to navigate
      </p>
    </div>
  );
}

function SlideNumbers() {
  return (
    <div className="flex w-full max-w-4xl flex-col justify-between gap-10 sm:gap-12">
      <SlideHeader n="02" title="Traction" />

      {/* Hero numbers — 2x2 grid, big */}
      <div className="grid grid-cols-2 gap-4 sm:gap-6">
        {[
          { n: "156K+", l: "Unique visitors", accent: true },
          { n: "3.3M+", l: "Ad impressions", accent: true },
          { n: "512K+", l: "Page views", accent: false },
          { n: "71K+", l: "Devs in the city", accent: false },
        ].map((m) => (
          <div
            key={m.l}
            className="border-[3px] bg-bg-raised p-5 sm:p-8"
            style={{ borderColor: m.accent ? ACCENT : undefined }}
          >
            <p
              className="text-3xl sm:text-5xl"
              style={{ color: m.accent ? ACCENT : CREAM }}
            >
              {m.n}
            </p>
            <p className="mt-2 text-[10px] text-dim sm:text-xs">{m.l}</p>
          </div>
        ))}
      </div>

      {/* Bottom row: supporting stats + context */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Pill>34K+ logged in</Pill>
        <Pill>14K+ link clicks</Pill>
        <Pill>$0 marketing</Pill>
        <Pill>100% organic</Pill>
        <Pill>40 days old</Pill>
      </div>
    </div>
  );
}

const NOTABLE_DEVS_ROW1 = [
  { login: "torvalds", name: "Linus Torvalds", desc: "Creator of Linux" },
  { login: "bcherny", name: "Boris Cherny", desc: "Creator of Claude Code" },
  { login: "steipete", name: "Peter Steinberger", desc: "Creator of OpenClaw" },
];

const NOTABLE_DEVS_ROW2 = [
  { login: "gustavoguanabara", name: "Gustavo Guanabara", desc: "Curso em Video" },
  { login: "filipedeschamps", name: "Filipe Deschamps", desc: "TabNews, YouTuber" },
];

function SlideAudience() {
  const allDevs = [...NOTABLE_DEVS_ROW1, ...NOTABLE_DEVS_ROW2];

  return (
    <div className="flex w-full max-w-4xl flex-col gap-8">
      <SlideHeader n="03" title="Audience" />

      {/* Primary: real audience data */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-4">
        <div className="border-[3px] border-border bg-bg-raised p-3 text-center sm:p-4">
          <p className="text-lg sm:text-2xl" style={{ color: ACCENT }}>Global</p>
          <p className="mt-1 text-[9px] text-dim sm:text-[10px]">IN 36% · BR 15% · US 8%</p>
        </div>
        <div className="border-[3px] border-border bg-bg-raised p-3 text-center sm:p-4">
          <p className="text-lg sm:text-2xl" style={{ color: ACCENT }}>69%</p>
          <p className="mt-1 text-[9px] text-dim sm:text-[10px]">Desktop</p>
        </div>
        <div className="border-[3px] border-border bg-bg-raised p-3 text-center sm:p-4">
          <p className="text-lg sm:text-2xl" style={{ color: CREAM }}>15.7M+</p>
          <p className="mt-1 text-[9px] text-dim sm:text-[10px]">GitHub Stars</p>
        </div>
        <div className="border-[3px] border-border bg-bg-raised p-3 text-center sm:p-4">
          <p className="text-lg sm:text-2xl" style={{ color: CREAM }}>5.2M+</p>
          <p className="mt-1 text-[9px] text-dim sm:text-[10px]">Followers</p>
        </div>
      </div>

      {/* Traffic + Languages */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="border-[3px] border-border bg-bg-raised p-5">
          <p className="mb-3 text-xs text-dim">Where they come from</p>
          <div className="space-y-2">
            {[
              { source: "GitHub", value: "41K" },
              { source: "Google", value: "40K" },
              { source: "X / Twitter", value: "12K" },
              { source: "LinkedIn", value: "3.3K" },
            ].map((s) => (
              <div key={s.source} className="flex items-center justify-between text-sm">
                <span className="text-muted">{s.source}</span>
                <span className="text-cream">{s.value}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="border-[3px] border-border bg-bg-raised p-5">
          <p className="mb-3 text-xs text-dim">What they code</p>
          <div className="space-y-2">
            {[
              { lang: "JavaScript", count: "14.2K" },
              { lang: "Python", count: "9.0K" },
              { lang: "TypeScript", count: "8.7K" },
              { lang: "Java", count: "2.8K" },
            ].map((l) => (
              <div key={l.lang} className="flex items-center justify-between text-sm">
                <span className="text-muted">{l.lang}</span>
                <span className="text-cream">{l.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Devs in the city — compact, secondary */}
      <div>
        <p className="mb-3 text-xs text-dim normal-case">
          71,000+ developers represented in the city, including:
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {allDevs.map((dev) => (
            <div key={dev.login} className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://github.com/${dev.login}.png?size=48`}
                alt={dev.name}
                width={24}
                height={24}
                className="rounded-sm border border-border"
                loading="lazy"
              />
              <span className="text-xs text-muted normal-case">{dev.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SlideFormats() {
  return (
    <div className="flex w-full max-w-4xl flex-col gap-6">
      <SlideHeader n="04" title="Formats" />

      {/* Landmark — featured, full width */}
      <div className="border-[3px] p-5 sm:p-8" style={{ borderColor: ACCENT }}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-lg">
            <div className="flex items-center gap-3">
              <p className="text-lg text-cream sm:text-2xl">Landmark</p>
              <span className="border px-2 py-0.5 text-[10px]" style={{ borderColor: ACCENT, color: ACCENT }}>
                PREMIUM
              </span>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-muted normal-case">
              Your company becomes a building in the city. Custom 3D model with
              your brand colors, logo, and a permanent position on the map.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Pill>AbacatePay</Pill>
              <Pill>Viral Day</Pill>
              <Pill>Acelera Dev</Pill>
            </div>
          </div>
          <div className="shrink-0 text-center sm:text-right">
            <p className="text-3xl sm:text-5xl" style={{ color: ACCENT }}>
              1.72%
            </p>
            <p className="mt-1 text-xs text-dim">CTR (top performer)</p>
          </div>
        </div>
      </div>

      {/* Rooftop + Blimp side by side */}
      <div className="grid gap-4 sm:gap-6 sm:grid-cols-2">
        <div className="border-[3px] border-border bg-bg-raised p-4 sm:p-6">
          <p className="text-base text-cream sm:text-lg">Rooftop Sign</p>
          <p className="mt-3 text-sm leading-relaxed text-muted normal-case">
            Illuminated sign that spins 360° on top of the tallest buildings.
            Click goes straight to your link — no extra steps.
          </p>
          <div className="mt-5 h-0.5 bg-border" />
          <div className="mt-4 flex items-baseline gap-6">
            <div>
              <p className="text-2xl sm:text-3xl" style={{ color: ACCENT }}>0.93%</p>
              <p className="mt-1 text-[10px] text-dim">CTR (top performer)</p>
            </div>
            <div>
              <p className="text-2xl sm:text-3xl" style={{ color: CREAM }}>96%</p>
              <p className="mt-1 text-[10px] text-dim">click&rarr;visit</p>
            </div>
          </div>
        </div>

        <div className="border-[3px] border-border bg-bg-raised p-4 sm:p-6">
          <p className="text-base text-cream sm:text-lg">Blimp</p>
          <p className="mt-3 text-sm leading-relaxed text-muted normal-case">
            Airship with LED screens on both sides.
            Flies slowly across the skyline — imposing, cinematic, impossible to miss.
          </p>
          <div className="mt-5 h-0.5 bg-border" />
          <div className="mt-4">
            <p className="text-2xl sm:text-3xl" style={{ color: ACCENT }}>0.35%</p>
            <p className="mt-1 text-[10px] text-dim">CTR (top performer)</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function SlideResults() {
  return (
    <div className="flex w-full max-w-4xl flex-col gap-8">
      <SlideHeader n="05" title="Real Results" />

      {/* Big context numbers */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <div className="border-[3px] border-border bg-bg-raised p-3 text-center sm:p-5">
          <p className="text-xl sm:text-4xl" style={{ color: ACCENT }}>3.3M+</p>
          <p className="mt-1 text-[9px] text-dim sm:text-[10px]">Impressions</p>
        </div>
        <div className="border-[3px] border-border bg-bg-raised p-3 text-center sm:p-5">
          <p className="text-xl sm:text-4xl" style={{ color: ACCENT }}>14K+</p>
          <p className="mt-1 text-[9px] text-dim sm:text-[10px]">Link clicks</p>
        </div>
        <div className="border-[3px] border-border bg-bg-raised p-3 text-center sm:p-5">
          <p className="text-xl sm:text-4xl" style={{ color: ACCENT }}>64</p>
          <p className="mt-1 text-[9px] text-dim sm:text-[10px]">Ads sold</p>
        </div>
      </div>

      {/* Cases as rows */}
      <div>
        <p className="mb-3 text-xs text-dim">Top performing ads</p>
        {[
          { advertiser: "Viral Day", format: "Landmark", impressions: "31.8K", links: "550", ctr: "1.72%" },
          { advertiser: "AbacatePay", format: "Landmark", impressions: "32K", links: "481", ctr: "1.50%" },
          { advertiser: "Leah", format: "Rooftop Sign", impressions: "44.7K", links: "616", ctr: "1.38%" },
          { advertiser: "Git Trophy", format: "Billboard", impressions: "23.4K", links: "270", ctr: "1.15%" },
          { advertiser: "WikiCity", format: "Rooftop Sign", impressions: "44.7K", links: "491", ctr: "1.10%" },
        ].map((row, i, arr) => (
          <div
            key={row.advertiser + row.format}
            className={`flex items-center justify-between py-3.5 ${i < arr.length - 1 ? "border-b border-border/40" : ""}`}
          >
            <div>
              <p className="text-sm text-cream sm:text-base">{row.advertiser}</p>
              <p className="mt-0.5 text-[10px] text-dim">
                {row.format} · {row.impressions} views · {row.links} clicks
              </p>
            </div>
            <p className="text-xl sm:text-2xl" style={{ color: ACCENT }}>
              {row.ctr}
            </p>
          </div>
        ))}
      </div>

      {/* Benchmark */}
      <div
        className="border-l-[3px] py-2 pl-5"
        style={{ borderColor: ACCENT }}
      >
        <p className="text-sm text-muted normal-case">
          Industry avg display ad CTR (Tech/SaaS):{" "}
          <span className="text-cream">0.34%</span>
        </p>
      </div>
    </div>
  );
}

function SlideContact() {
  return (
    <div className="flex w-full max-w-4xl flex-col items-center justify-center gap-10 text-center">
      <SlideHeader n="06" title="Let's Talk" />
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
