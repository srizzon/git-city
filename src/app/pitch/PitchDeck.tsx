"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { PitchStats } from "@/lib/pitch-stats";

const ACCENT = "#c8e64a";
const CREAM = "#e8dcc8";
const MUTED = "#8c8c9c";
const TOTAL_SLIDES = 13;

const SLIDE_LABELS = [
  "Cover",
  "Problem",
  "Solution",
  "Product",
  "Traction",
  "Model",
  "Market",
  "Competition",
  "GTM",
  "Founder",
  "Vision",
  "Roadmap",
  "Contact",
];

/* ─────────────── main component ─────────────── */
export default function PitchDeck({ stats }: { stats: PitchStats }) {
  const [active, setActive] = useState(0);
  const [dir, setDir] = useState<"next" | "prev">("next");

  const go = useCallback(
    (idx: number) => {
      if (idx < 0 || idx >= TOTAL_SLIDES || idx === active) return;
      setDir(idx > active ? "next" : "prev");
      setActive(idx);
    },
    [active]
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
    <SlideCover key="cover" stats={stats} />,
    <SlideProblem key="problem" />,
    <SlideSolution key="solution" />,
    <SlideProduct key="product" />,
    <SlideTraction key="traction" stats={stats} />,
    <SlideModel key="model" stats={stats} />,
    <SlideMarket key="market" />,
    <SlideCompetition key="competition" />,
    <SlideGTM key="gtm" stats={stats} />,
    <SlideFounder key="founder" />,
    <SlideVision key="vision" />,
    <SlideRoadmap key="roadmap" />,
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
                className="h-1.5 w-6 transition-all lg:w-8"
                style={{
                  background: i === active ? ACCENT : i < active ? ACCENT + "60" : "#2a2a30",
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

      {/* ── slide number top-right ── */}
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

function SlideCover({ stats }: { stats: PitchStats }) {
  return (
    <div className="flex flex-col items-center gap-8 text-center">
      <div className="text-6xl sm:text-8xl lg:text-9xl">
        <span style={{ color: CREAM }}>GIT</span>{" "}
        <span style={{ color: ACCENT }}>CITY</span>
      </div>
      <p className="max-w-lg text-base leading-relaxed text-muted normal-case sm:text-xl lg:text-2xl">
        Your GitHub profile as a 3D pixel art building in an interactive city
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        <Pill>{stats.formattedDevelopers} developers</Pill>
        <Pill>{stats.formattedRevenue} revenue</Pill>
        <Pill>$0 marketing</Pill>
        <Pill>{stats.formattedDaysOld}</Pill>
      </div>
      <p className="mt-4 text-xs text-dim normal-case sm:text-sm">
        Press &rarr; or swipe to navigate
      </p>
    </div>
  );
}

function SlideProblem() {
  return (
    <div className="flex w-full max-w-4xl flex-col gap-8">
      <SlideHeader n="02" title="The Problem" />
      <div className="grid gap-5 sm:grid-cols-3">
        <ProblemCard
          icon="[ ]"
          title="Static profiles"
          body="GitHub profiles are flat pages with a green square grid. No depth, no personality, no reason to come back."
        />
        <ProblemCard
          icon="..."
          title="Zero community"
          body="Developers build in isolation. No shared space to discover, compare, or interact with other devs."
        />
        <ProblemCard
          icon="$0"
          title="No monetization"
          body="No way for devs to express identity or for brands to reach this audience natively."
        />
      </div>
      <div className="border-[3px] border-border bg-bg-raised p-6 text-center sm:p-8">
        <p className="text-4xl sm:text-6xl" style={{ color: ACCENT }}>
          100M+
        </p>
        <p className="mt-3 text-sm text-muted normal-case sm:text-base">
          GitHub accounts. Same green grid since 2013.
        </p>
      </div>
    </div>
  );
}

function SlideSolution() {
  return (
    <div className="flex w-full max-w-4xl flex-col gap-8">
      <SlideHeader n="03" title="The Solution" />
      <p className="max-w-2xl text-base leading-relaxed text-muted normal-case sm:text-lg">
        Git City transforms every GitHub developer into a unique 3D pixel art
        building. Contributions become height. Repos become width. Activity
        lights up windows. Together, they form a living city.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <SolutionPoint
          title="Contributions = Height"
          desc="More commits, taller building. The skyline tells the story."
        />
        <SolutionPoint
          title="Repos = Width"
          desc="More public repos, wider foundation."
        />
        <SolutionPoint
          title="Stars = Lit Windows"
          desc="Activity and stars light up your building at night."
        />
        <SolutionPoint
          title="Rank = Location"
          desc="Top contributors live downtown. A living leaderboard."
        />
      </div>
    </div>
  );
}

function SlideProduct() {
  return (
    <div className="flex w-full max-w-4xl flex-col gap-8">
      <SlideHeader n="04" title="The Product" />
      <div className="grid gap-4 sm:grid-cols-2">
        <FeatureCard
          icon="&lt;3D/&gt;"
          title="Interactive 3D City"
          items={[
            "Fly-through camera mode",
            "4 city themes",
            "Lo-fi radio soundtrack",
            "Real-time activity ticker",
          ]}
        />
        <FeatureCard
          icon="[#]"
          title="Leaderboards & Districts"
          items={[
            "5 leaderboard types",
            "10 developer districts",
            "Compare mode",
            "Shareable profile cards",
          ]}
        />
        <FeatureCard
          icon="{!}"
          title="Achievements & Streaks"
          items={[
            "20+ achievements (Bronze to Diamond)",
            "Daily streak system",
            "Unlock free items",
            "Battle system (PvP)",
          ]}
        />
        <FeatureCard
          icon="[$]"
          title="Shop & Social"
          items={[
            "Cosmetic building items",
            "Crown, roof, aura zones",
            "Gift items to other devs",
            "Daily kudos system",
          ]}
        />
      </div>
    </div>
  );
}

function SlideTraction({ stats }: { stats: PitchStats }) {
  return (
    <div className="flex w-full max-w-4xl flex-col gap-8">
      <SlideHeader n="05" title="Traction" />
      <p className="text-sm text-dim normal-case sm:text-base">
        All organic. $0 spent on marketing. {stats.daysOld} days since launch.
      </p>
      <div className="grid gap-5 sm:grid-cols-3">
        <MetricCard value={stats.formattedDevelopers} label="Developers in the city" accent />
        <MetricCard value={stats.formattedClaimed} label="Claimed accounts (OAuth)" />
        <MetricCard value="21,669" label="Unique visitors" />
        <MetricCard value="56,623" label="Pageviews" />
        <MetricCard value="12%" label="Bounce rate" accent />
        <MetricCard value={stats.conversionRate} label="Conversion rate" />
      </div>
      <div className="border-[3px] border-border bg-bg-raised p-5 sm:p-6">
        <p className="mb-4 text-sm text-cream sm:text-base">
          Revenue (first {stats.daysOld} days)
        </p>
        <div className="grid gap-5 sm:grid-cols-3">
          <MetricCard value={stats.formattedRevenue} label="Total revenue" accent />
          <MetricCard value={stats.formattedAdCampaigns} label="Paid ad campaigns" />
          <MetricCard value={stats.formattedUniqueBrands} label="Unique ad brands" />
        </div>
      </div>
    </div>
  );
}

function SlideModel({ stats }: { stats: PitchStats }) {
  return (
    <div className="flex w-full max-w-4xl flex-col gap-8">
      <SlideHeader n="06" title="Business Model" />
      <div className="grid gap-5 sm:grid-cols-3">
        <ModelCard
          status="live"
          title="In-Game Ads"
          desc="Self-serve dashboard. Planes, blimps, billboards, rooftop signs, LED wraps. Weekly or monthly."
          price="$9 - $99"
          revenue={stats.formattedAdRevenue}
        />
        <ModelCard
          status="live"
          title="Cosmetic Shop"
          desc="Building customization. Crown effects, roof structures, auras. Achievements unlock free items."
          price="$0.75 - $2"
          revenue={stats.formattedShopRevenue}
        />
        <ModelCard
          status="planned"
          title="Pixels Currency"
          desc="Virtual currency. Hybrid earn + purchase. Daily activities earn small amounts. Premium marketplace."
          price="$1 = 100 PX"
          revenue="Designed"
        />
      </div>
    </div>
  );
}

function SlideMarket() {
  return (
    <div className="flex w-full max-w-4xl flex-col gap-8">
      <SlideHeader n="07" title="Market Opportunity" />
      <div className="flex flex-col gap-6">
        <MarketRow label="TAM" value="100M+" desc="GitHub accounts worldwide" />
        <MarketRow
          label="SAM"
          value="4M"
          desc="Active devs who care about their developer identity"
        />
        <MarketRow
          label="SOM"
          value="500K"
          desc="Devs who engage with gamification and social dev tools"
        />
      </div>
      <p className="text-sm leading-relaxed text-muted normal-case sm:text-base">
        Developer tools market projected at $45B+ by 2028. Developer identity
        and community platforms are underserved. GitHub has no social layer
        beyond follow/star.
      </p>
    </div>
  );
}

function SlideCompetition() {
  return (
    <div className="flex w-full max-w-4xl flex-col gap-8">
      <SlideHeader n="08" title="Competitive Landscape" />
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm normal-case sm:text-base">
          <thead>
            <tr className="border-b-2 border-border text-muted">
              <th className="pb-3 pr-6 text-sm sm:text-base">Feature</th>
              <th className="pb-3 pr-6 text-sm sm:text-base" style={{ color: ACCENT }}>
                Git City
              </th>
              <th className="pb-3 pr-6 text-sm sm:text-base">GitHub Skyline</th>
              <th className="pb-3 text-sm sm:text-base">CodersRank</th>
            </tr>
          </thead>
          <tbody className="text-muted">
            <CompRow feature="3D visualization" gc="Full city" sky="Bar chart" cr="None" />
            <CompRow feature="Community" gc="Kudos, battles, gifts" sky="None" cr="Basic" />
            <CompRow feature="Gamification" gc="Achievements, streaks, boards" sky="None" cr="Score" />
            <CompRow feature="Monetization" gc="Ads + Shop" sky="None (dead)" cr="Premium" />
            <CompRow feature="Status" gc="Active, growing" sky="Discontinued" cr="Low traction" />
          </tbody>
        </table>
      </div>
      <p className="text-sm text-dim normal-case sm:text-base">
        GitHub Skyline was discontinued. No active product does what Git City
        does.
      </p>
    </div>
  );
}

function SlideGTM({ stats }: { stats: PitchStats }) {
  return (
    <div className="flex w-full max-w-4xl flex-col gap-8">
      <SlideHeader n="09" title="Go-to-Market" />
      <div className="grid gap-5 sm:grid-cols-2">
        <GTMCard
          n="01"
          title="Build in Public"
          desc="Real numbers, real decisions shared on X/Twitter. The journey IS the content."
        />
        <GTMCard
          n="02"
          title="Viral Mechanics"
          desc="Share cards, comparisons, achievements, leaderboards. Every interaction generates a share."
        />
        <GTMCard
          n="03"
          title="Dev Communities"
          desc="Product Hunt, Hacker News, Reddit, Dev.to. Each feature launch is a mini-event."
        />
        <GTMCard
          n="04"
          title="Famous Devs"
          desc="Torvalds, Karpathy, Sindre Sorhus, Pieter Levels are in the city. Tagging drives reach."
        />
      </div>
      <div className="border-[3px] border-border bg-bg-raised p-6 text-center sm:p-8">
        <p className="text-4xl sm:text-6xl" style={{ color: ACCENT }}>
          $0
        </p>
        <p className="mt-3 text-sm text-muted normal-case sm:text-base">
          Customer acquisition cost. {stats.formattedDevelopers} developers joined organically.
        </p>
      </div>
    </div>
  );
}

function SlideFounder() {
  return (
    <div className="flex w-full max-w-4xl flex-col gap-8">
      <SlideHeader n="10" title="The Founder" />
      <div className="border-[3px] border-border bg-bg-raised p-6 sm:p-8">
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-5">
            <div
              className="flex h-20 w-20 items-center justify-center border-[3px] border-border text-3xl sm:h-24 sm:w-24 sm:text-4xl"
              style={{ color: ACCENT }}
            >
              SR
            </div>
            <div>
              <p className="text-2xl text-cream sm:text-3xl">Samuel Rizzon</p>
              <p className="mt-1 text-sm text-muted normal-case sm:text-base">
                Solo Founder & Full-Stack Developer
              </p>
            </div>
          </div>
          <div className="h-0.5 bg-border" />
          <div className="grid gap-6 sm:grid-cols-3">
            <div>
              <p className="text-sm text-dim sm:text-base">Age</p>
              <p className="text-xl text-cream sm:text-2xl">29</p>
            </div>
            <div>
              <p className="text-sm text-dim sm:text-base">Role</p>
              <p className="text-xl text-cream sm:text-2xl">Solo dev</p>
            </div>
            <div>
              <p className="text-sm text-dim sm:text-base">Built in</p>
              <p className="text-xl text-cream sm:text-2xl">1 day</p>
            </div>
          </div>
          <p className="text-sm leading-relaxed text-muted normal-case sm:text-base">
            Built Git City in a single day and has been iterating daily since.
            Handles everything: 3D engine, backend, payments, marketing,
            community. Building in public on X/Twitter.
          </p>
          <div className="flex flex-wrap gap-3">
            <Pill>Next.js</Pill>
            <Pill>React</Pill>
            <Pill>Three.js</Pill>
            <Pill>Supabase</Pill>
            <Pill>Stripe</Pill>
            <Pill>Vercel</Pill>
          </div>
        </div>
      </div>
    </div>
  );
}

function SlideVision() {
  return (
    <div className="flex w-full max-w-4xl flex-col items-center justify-center gap-10 text-center">
      <SlideHeader n="11" title="Vision" />
      <p className="max-w-2xl text-lg leading-relaxed text-muted normal-case sm:text-2xl">
        Building the social layer GitHub never made. A living city where
        developers have an identity, a community, and a reason to come back
        every day.
      </p>
      <div className="border-[3px] border-border bg-bg-raised p-8 sm:p-10">
        <p className="text-3xl text-cream sm:text-5xl">
          The future of developer identity is a{" "}
          <span style={{ color: ACCENT }}>city</span>.
        </p>
        <p className="mt-4 text-sm text-muted normal-case sm:text-base">
          thegitcity.com
        </p>
      </div>
    </div>
  );
}

function SlideRoadmap() {
  return (
    <div className="flex w-full max-w-4xl flex-col gap-6">
      <SlideHeader n="12" title="Roadmap" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <RoadmapItem quarter="Q1 2026" status="done" title="Core City" desc="3D city, leaderboards, achievements, streaks, shop, ads, districts, battles" />
        <RoadmapItem quarter="Q2 2026" status="next" title="Street Mode" desc="Third-person walking. Visit buildings, discover secrets, vehicles." />
        <RoadmapItem quarter="Q3 2026" status="planned" title="Pixels Economy" desc="Virtual currency, premium marketplace, season passes." />
        <RoadmapItem quarter="Q4 2026" status="planned" title="Git City Wrapped" desc="Year-in-review animations. Viral shareable cards." />
        <RoadmapItem quarter="2027" status="planned" title="100K+ Devs" desc="Enterprise, API, analytics dashboard, global events." />
      </div>
    </div>
  );
}

function SlideContact() {
  return (
    <div className="flex w-full max-w-4xl flex-col items-center justify-center gap-10 text-center">
      <SlideHeader n="13" title="Let's Talk" />
      <p className="max-w-xl text-base leading-relaxed text-muted normal-case sm:text-lg">
        Interested in Git City? Have questions, ideas, or want to collaborate?
      </p>
      <div className="flex flex-col gap-5">
        <a
          href="https://x.com/srizzon"
          target="_blank"
          rel="noopener noreferrer"
          className="border-[3px] border-border bg-bg-raised px-8 py-4 text-base text-cream transition-colors hover:border-border-light sm:text-lg"
        >
          @srizzon on X
        </a>
        <a
          href="mailto:samuelrizzondev@gmail.com"
          className="border-[3px] border-border bg-bg-raised px-8 py-4 text-base text-cream transition-colors hover:border-border-light sm:text-lg"
        >
          samuelrizzondev@gmail.com
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

function ProblemCard({
  icon,
  title,
  body,
}: {
  icon: string;
  title: string;
  body: string;
}) {
  return (
    <div className="border-[3px] border-border bg-bg-raised p-5 sm:p-6">
      <p className="mb-3 text-2xl sm:text-3xl" style={{ color: ACCENT }}>
        {icon}
      </p>
      <p className="mb-2 text-base text-cream sm:text-lg">{title}</p>
      <p className="text-sm leading-relaxed text-muted normal-case">{body}</p>
    </div>
  );
}

function SolutionPoint({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="flex items-start gap-4 border-[3px] border-border bg-bg-raised p-4 sm:p-5">
      <span className="text-lg sm:text-xl" style={{ color: ACCENT }}>
        +
      </span>
      <div>
        <p className="text-base text-cream sm:text-lg">{title}</p>
        <p className="mt-1 text-sm text-muted normal-case">{desc}</p>
      </div>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  items,
}: {
  icon: string;
  title: string;
  items: string[];
}) {
  return (
    <div className="border-[3px] border-border bg-bg-raised p-5">
      <p className="mb-2 text-base sm:text-lg" style={{ color: ACCENT }}>
        {icon}
      </p>
      <p className="mb-3 text-base text-cream sm:text-lg">{title}</p>
      <ul className="flex flex-col gap-2 text-sm text-muted normal-case">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2">
            <span style={{ color: ACCENT }}>-</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MetricCard({
  value,
  label,
  accent,
}: {
  value: string;
  label: string;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <p
        className="text-3xl sm:text-4xl"
        style={{ color: accent ? ACCENT : CREAM }}
      >
        {value}
      </p>
      <p className="text-xs leading-tight text-muted normal-case sm:text-sm">
        {label}
      </p>
    </div>
  );
}

function ModelCard({
  status,
  title,
  desc,
  price,
  revenue,
}: {
  status: "live" | "planned";
  title: string;
  desc: string;
  price: string;
  revenue: string;
}) {
  return (
    <div className="border-[3px] border-border bg-bg-raised p-5 sm:p-6">
      <div className="mb-3 flex items-center gap-2">
        <span
          className="h-2.5 w-2.5"
          style={{ background: status === "live" ? ACCENT : MUTED }}
        />
        <span
          className="text-xs sm:text-sm"
          style={{ color: status === "live" ? ACCENT : MUTED }}
        >
          {status === "live" ? "LIVE" : "PLANNED"}
        </span>
      </div>
      <p className="mb-2 text-base text-cream sm:text-lg">{title}</p>
      <p className="mb-4 text-sm leading-relaxed text-muted normal-case">
        {desc}
      </p>
      <div className="h-0.5 bg-border" />
      <div className="mt-3 flex justify-between text-sm">
        <span className="text-dim">Price</span>
        <span className="text-cream">{price}</span>
      </div>
      <div className="mt-1 flex justify-between text-sm">
        <span className="text-dim">Revenue</span>
        <span style={{ color: status === "live" ? ACCENT : MUTED }}>
          {revenue}
        </span>
      </div>
    </div>
  );
}

function MarketRow({
  label,
  value,
  desc,
}: {
  label: string;
  value: string;
  desc: string;
}) {
  return (
    <div className="flex items-center gap-6 border-[3px] border-border bg-bg-raised p-5 sm:p-6">
      <div
        className="flex h-16 w-16 shrink-0 items-center justify-center border-[3px] text-lg sm:h-20 sm:w-20 sm:text-xl"
        style={{ borderColor: ACCENT, color: ACCENT }}
      >
        {label}
      </div>
      <div>
        <p className="text-2xl text-cream sm:text-4xl">{value}</p>
        <p className="mt-1 text-sm text-muted normal-case sm:text-base">
          {desc}
        </p>
      </div>
    </div>
  );
}

function CompRow({
  feature,
  gc,
  sky,
  cr,
}: {
  feature: string;
  gc: string;
  sky: string;
  cr: string;
}) {
  return (
    <tr className="border-b border-border/50">
      <td className="py-3 pr-6 text-cream">{feature}</td>
      <td className="py-3 pr-6" style={{ color: ACCENT }}>
        {gc}
      </td>
      <td className="py-3 pr-6">{sky}</td>
      <td className="py-3">{cr}</td>
    </tr>
  );
}

function GTMCard({
  n,
  title,
  desc,
}: {
  n: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="border-[3px] border-border bg-bg-raised p-5 sm:p-6">
      <p className="mb-2 text-base sm:text-lg" style={{ color: ACCENT }}>
        {n}.
      </p>
      <p className="mb-2 text-base text-cream sm:text-lg">{title}</p>
      <p className="text-sm leading-relaxed text-muted normal-case">{desc}</p>
    </div>
  );
}

function RoadmapItem({
  quarter,
  status,
  title,
  desc,
}: {
  quarter: string;
  status: "done" | "next" | "planned";
  title: string;
  desc: string;
}) {
  const colors = { done: ACCENT, next: "#60a0ff", planned: MUTED };
  const labels = { done: "DONE", next: "NEXT", planned: "PLANNED" };

  return (
    <div className="border-[3px] border-border bg-bg-raised p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="h-2 w-2" style={{ background: colors[status] }} />
        <span className="text-xs text-cream">{quarter}</span>
        <span className="text-[10px]" style={{ color: colors[status] }}>
          {labels[status]}
        </span>
      </div>
      <p className="text-base text-cream sm:text-lg">{title}</p>
      <p className="mt-1 text-xs text-muted normal-case sm:text-sm">{desc}</p>
    </div>
  );
}
