"use client";

import { useState } from "react";
import Link from "next/link";
import { trackSponsorshipCtaClick } from "@/lib/himetrica";
import { PixelSelect } from "@/components/ui/PixelSelect";

const ACCENT = "#c8e64a";
const CREAM = "#e8dcc8";

const FAQ = [
  {
    q: "How do you measure success?",
    a: "Every format is tracked. Impressions, clicks, click-to-visit rate, time spent. You get a real-time dashboard plus a weekly summary email. For Sponsored Events, you also get UTM-attributed signups, redemption code claims, raid leaderboard stats, and a final case study report.",
  },
  {
    q: "What if my product is B2B and niche?",
    a: "Git City's audience is developers who actively code, ship, and contribute. If your product solves a developer pain point (devtool, AI infra, cloud, database, observability, hardware), the fit is direct. If you target non-technical buyers, this probably isn't the right fit. I'll tell you that on the call.",
  },
  {
    q: "How long does a custom build take?",
    a: "Standard Landmark: 2 to 3 weeks from contract sign. Sponsored Event: 2 to 4 weeks depending on scope. Annual Partnership starts with the first activation, then iterates from there.",
  },
  {
    q: "Can I customize the landmark beyond colors?",
    a: "Yes. The 3D building is custom modeled. I can add interactive elements, your logo, branded cosmetic drops, click-through CTAs, and event-triggered animations. Walk in with a brief, leave with a one-pager.",
  },
  {
    q: "Is there a contract?",
    a: "For Landmark and Pixel Drop, simple SOW with monthly invoicing. For Sponsored Event and Annual, custom MSA with deliverables and timeline. No agency overhead either way.",
  },
  {
    q: "What is the refund policy?",
    a: "Sky Ads: cancel anytime, no questions. Landmark: prorated refund if I miss a delivery milestone. Sponsored Event and Annual: defined in the SOW per project.",
  },
];

const NUMBERS = [
  { n: "82K", l: "Buildings indexed" },
  { n: "45K", l: "Connected via GitHub" },
  { n: "6.6K", l: "Monthly active devs" },
  { n: "1.8K", l: "Raid emails /mo" },
  { n: "GitHub", l: "Reposted in April" },
];

const CITY_STATS = [
  { value: "82,297", label: "Buildings indexed live from GitHub" },
  { value: "45,437", label: "Claimed via GitHub OAuth" },
  { value: "6,684", label: "Monthly active developers" },
  { value: "16,784", label: "Paying customers" },
];

const AGGREGATE = [
  { value: "15.9M+", label: "Combined GitHub stars across all devs" },
  { value: "5.4M+", label: "Combined followers across all devs" },
  { value: "2.2M+", label: "Public repositories represented" },
  { value: "171/day", label: "New developers joining (30-day avg)" },
];

const SENIORITY = [
  { value: "879", label: "Devs with 1k+ GitHub contributions, active last 30d" },
  { value: "80", label: "Devs with 5k+ contributions, active last 30d" },
  { value: "21", label: "Devs with 10k+ contributions, active last 30d" },
  { value: "11", label: "OSS celebrities (1k+ followers), active last 30d" },
];

const LANG_SHARE = [
  { value: "51.4%", label: "JavaScript · TypeScript · HTML · CSS" },
  { value: "12.6%", label: "Python" },
  { value: "9.7%", label: "Java · C# · C++ · C" },
  { value: "3.6%", label: "Go · Rust · Kotlin · Dart" },
];

const LOOP_ACTIVITY = [
  { value: "1,900", label: "Raids run last 30 days" },
  { value: "1,799", label: "Unique devs receiving raid alert emails" },
  { value: "22,400", label: "Building visits" },
  { value: "7,982", label: "Daily logins (check-ins)" },
];

const TOP_LANGS = ["TypeScript", "Python", "JavaScript", "Go", "Rust", "Java"];

const STEPS = [
  {
    n: "01",
    title: "Discovery call",
    duration: "1 day",
    body:
      "Book a 30 minute call. Tell me your goal, your launch, your audience. I sketch what fits.",
  },
  {
    n: "02",
    title: "Concept",
    duration: "2 days",
    body:
      "I send a one pager with the format, mock visuals, and timeline. You approve or iterate.",
  },
  {
    n: "03",
    title: "Build",
    duration: "2 to 3 weeks",
    body:
      "I build the 3D landmark, theme, or experience end to end. You review halfway, sign off at the end.",
  },
  {
    n: "04",
    title: "Live and report",
    duration: "Run period",
    body:
      "Your activation goes live. You get a weekly report with impressions, clicks, time spent, and a final case study at the end.",
  },
];

const FORMAT_OPTIONS = [
  "Landmark",
  "Sponsored Event",
  "Annual Partnership",
  "Pixel Drop",
  "Not sure yet",
];

const BUDGET_OPTIONS = [
  "Under $5K/mo",
  "$5K to $25K/mo",
  "$25K to $100K",
  "$100K+",
  "Not sure",
];

/* ─────────────── main component ─────────────── */
export default function SponsorshipLanding() {
  // Form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [website, setWebsite] = useState("");
  const [formatInterest, setFormatInterest] = useState("");
  const [budget, setBudget] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  function scrollToContact() {
    trackSponsorshipCtaClick("contact");
    document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" });
  }

  function scrollToFormats() {
    trackSponsorshipCtaClick("formats");
    document.getElementById("formats")?.scrollIntoView({ behavior: "smooth" });
  }

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canSubmit =
    name.trim().length > 0 &&
    emailValid &&
    company.trim().length > 0 &&
    website.trim().length > 0 &&
    formatInterest.trim().length > 0 &&
    message.trim().length > 0 &&
    !loading;

  async function handleSubmit() {
    if (!canSubmit) return;
    trackSponsorshipCtaClick("form_submit");
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/sponsorship/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          company: company.trim(),
          role: role.trim() || undefined,
          website: website.trim(),
          formatInterest: formatInterest.trim(),
          budget: budget.trim() || undefined,
          message: message.trim(),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Something went wrong. Try again.");
        setLoading(false);
        return;
      }

      setSuccess(true);
      setLoading(false);
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <>
      {/* ── Hero ── */}
      <section className="pt-12 pb-16 text-center sm:pt-20 sm:pb-20">
        <p className="text-xs text-muted normal-case sm:text-sm" style={{ color: ACCENT }}>
          For brands
        </p>
        <h1 className="mt-4 text-3xl text-cream sm:text-5xl lg:text-6xl">
          Put your brand where 45,000 developers already hang out
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-sm leading-relaxed text-muted normal-case sm:text-base">
          82,000 GitHub buildings. 45,000 connected via OAuth. 879 senior contributors active monthly. They race in the arcade, raid each other, claim their tower. If you&apos;re at a devtool — web, AI, or dev infra — these are the developers you want.
        </p>
        <p className="mx-auto mt-3 max-w-2xl text-xs text-dim normal-case sm:text-sm">
          Solo dev. No agency. No committees. You talk to the person who builds it.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <button
            onClick={scrollToContact}
            className="btn-press px-8 py-4 text-sm text-bg sm:text-base"
            style={{
              backgroundColor: ACCENT,
              boxShadow: "4px 4px 0 0 #5a7a00",
            }}
          >
            Pitch your brand
          </button>
          <button
            onClick={scrollToFormats}
            className="text-sm text-muted transition-colors hover:text-cream sm:text-base"
          >
            See the 5 formats &darr;
          </button>
        </div>
      </section>

      {/* ── Numbers strip ── */}
      <section className="pb-16 sm:pb-20">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 sm:gap-4">
          {NUMBERS.map((m, i) => (
            <div
              key={m.l}
              className="border-[3px] border-border bg-bg-raised p-4 text-center sm:p-5"
              style={i === 0 ? { borderColor: ACCENT } : undefined}
            >
              <p
                className="text-xl sm:text-2xl"
                style={{ color: i === 0 ? ACCENT : CREAM }}
              >
                {m.n}
              </p>
              <p className="mt-2 text-[9px] text-dim sm:text-[10px]">{m.l}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── GitHub feature (social proof early) ── */}
      <section className="pb-16 sm:pb-20">
        <a
          href="https://x.com/github/status/2048494014383505661"
          target="_blank"
          rel="noopener noreferrer"
          className="block border-[3px] p-5 transition-all sm:p-7"
          style={{
            borderColor: ACCENT,
            boxShadow: "4px 4px 0 0 #5a7a00",
          }}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[10px] normal-case sm:text-xs" style={{ color: ACCENT }}>
              Featured organically by GitHub
            </p>
            <p className="text-[10px] text-dim normal-case sm:text-xs">
              April 2026 · view post &nearr;
            </p>
          </div>
          <p className="mt-4 text-xl text-cream sm:text-2xl lg:text-3xl">
            GitHub reposted Git City on X and Instagram.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted normal-case sm:text-base">
            Organic. Zero marketing spend. Zero outreach. The product spoke for itself.
          </p>
        </a>
      </section>

      {/* ── The problem ── */}
      <section className="pb-16 sm:pb-20">
        <h2 className="mb-8 text-2xl text-cream sm:text-3xl">
          Conferences last 3 days. Hackathons last 48 hours. Now what?
        </h2>
        <div className="space-y-4 text-sm leading-relaxed text-muted normal-case sm:text-base">
          <p>
            DevRel is fragmented. The launch window closes before devs even hear about it.
          </p>
          <p>
            Developers install ad blockers by default. Display CPMs cross $20 with click-through under 1%.
          </p>
          <p>
            Experiences win. The YC AI Hackathons (2025) pooled $180k+ in credits from Vercel, MongoDB, Anthropic, and OpenAI — devs built real things, sponsors got real signups. Supabase sponsored the Vercel AI Accelerator with $40k in credits, not cash. Both teams won.
          </p>
        </div>
        <div
          className="mt-6 border-l-[3px] py-2 pl-5"
          style={{ borderColor: ACCENT }}
        >
          <p className="text-sm normal-case sm:text-base" style={{ color: ACCENT }}>
            Git City is the always-on version. 45K real developers, already inside, already coming back every week.
          </p>
        </div>
      </section>

      {/* ── Formats ── */}
      <section id="formats" className="pb-16 sm:pb-20">
        <p className="text-[10px] text-dim normal-case sm:text-xs" style={{ color: ACCENT }}>
          5 ways to bring your brand in
        </p>
        <h2 className="mt-2 mb-8 text-2xl text-cream sm:text-3xl">Sponsorship formats</h2>

        <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
          <FormatCard
            name="Sky Ad"
            tagline="Entry tier"
            description="Planes, blimps, rooftop signs. Self-serve, live in minutes."
            price="Starting at $19/mo"
            bullets={[
              "Live in 5 minutes",
              "Real-time stats dashboard",
              "Cancel anytime",
            ]}
            ctaLabel="Browse self-serve →"
            ctaHref="/advertise"
          />
          <FormatCard
            name="Landmark"
            tagline="Most common"
            description="Your custom 3D building in the city. Developers click on it every day."
            price="Starting at $500/mo"
            bullets={[
              "Custom 3D model with your branding",
              "Prime placement, first thing devs see",
              "Activity feed mention on launch",
              "Live dashboard with clicks, visits, time spent",
            ]}
            ctaLabel="Reserve a landmark"
            onSelect={scrollToContact}
            featured
          />
          <FormatCard
            name="Sponsored Event"
            tagline="Branded raid season"
            description="A 2-week branded season layered onto the city. Raid leaderboard, three cosmetic tiers, sponsored landmark, in-game quest tied to your CTA."
            price="Bronze $5K · Gold $12K · Title $35K"
            bullets={[
              "Branded raid season + dedicated leaderboard",
              "Three cosmetic tiers: free badge (quest completers), paid shop variant, prestige variant (top 100 raiders)",
              "Event pillar, aircraft, billboards, activity feed branded for the window",
              "Branded raid alert emails (~1,800 sent during a typical window)",
              "Live sponsor dashboard plus wrap report",
            ]}
            ctaLabel="Plan a season"
            onSelect={scrollToContact}
          />
          <FormatCard
            name="Annual Partnership"
            tagline="Always-on"
            description="Always-on landmark plus 2 to 4 takeover weeks per year."
            price="Custom pricing"
            bullets={[
              "Permanent prime landmark",
              "2 to 4 sponsored events per year",
              "Co-marketing across my channels",
              "First look on every new inventory I ship",
            ]}
            ctaLabel="Become a partner"
            onSelect={scrollToContact}
          />
          <div className="lg:col-span-2">
            <FormatCard
              name="Pixel Drop"
              tagline="Low-touch upsell"
              description="Drop pixels on the top devs of the week. Their feed lights up with your brand."
              price="Starting at $500 per drop"
              bullets={[
                "Activity feed feature on launch day",
                "Recurring monthly option",
              ]}
              ctaLabel="Drop pixels"
              onSelect={scrollToContact}
            />
          </div>
        </div>
      </section>

      {/* ── Who's already inside ── */}
      <section className="pb-16 sm:pb-20">
        <h2 className="mb-3 text-2xl text-cream sm:text-3xl">Who&apos;s already inside</h2>
        <p className="mb-8 text-sm leading-relaxed text-muted normal-case sm:text-base">
          45,437 connected. 15.9M GitHub stars combined. 5.4M followers combined. 2.2M public repositories represented. The most engaged dev audience that&apos;s not LinkedIn or Hacker News.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="border-[3px] border-border bg-bg-raised p-5 sm:p-6">
            <p className="mb-4 text-xs text-dim">City stats</p>
            <div className="space-y-3">
              {CITY_STATS.map((s) => (
                <div key={s.label} className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-muted normal-case">{s.label}</span>
                  <span className="text-base sm:text-lg" style={{ color: ACCENT }}>
                    {s.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="border-[3px] border-border bg-bg-raised p-5 sm:p-6">
            <p className="mb-4 text-xs text-dim">Aggregate signal</p>
            <div className="space-y-3">
              {AGGREGATE.map((s) => (
                <div key={s.label} className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-muted normal-case">{s.label}</span>
                  <span className="text-base sm:text-lg" style={{ color: ACCENT }}>
                    {s.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 border-[3px] border-border bg-bg-raised p-5 sm:p-6">
          <p className="mb-3 text-xs text-dim">Top languages in the city</p>
          <div className="flex flex-wrap items-center gap-2">
            {TOP_LANGS.map((lang) => (
              <span
                key={lang}
                className="border-2 border-border px-3 py-1.5 text-[10px] text-muted sm:text-xs"
              >
                {lang}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Audience quality ── */}
      <section className="pb-16 sm:pb-20">
        <p className="text-[10px] text-dim normal-case sm:text-xs" style={{ color: ACCENT }}>
          Quality, not just volume
        </p>
        <h2 className="mt-2 mb-3 text-2xl text-cream sm:text-3xl">
          The 879 senior devs your DevRel wants
        </h2>
        <p className="mb-8 text-sm leading-relaxed text-muted normal-case sm:text-base">
          Active in the last 30 days. Verified via GitHub OAuth. Every visitor is a real developer with a public commit history.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="border-[3px] border-border bg-bg-raised p-5 sm:p-6">
            <p className="mb-4 text-xs text-dim">Seniority</p>
            <div className="space-y-3">
              {SENIORITY.map((s) => (
                <div key={s.label} className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-muted normal-case">{s.label}</span>
                  <span className="text-base sm:text-lg" style={{ color: ACCENT }}>
                    {s.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="border-[3px] border-border bg-bg-raised p-5 sm:p-6">
            <p className="mb-4 text-xs text-dim">Primary language · claimed devs</p>
            <div className="space-y-3">
              {LANG_SHARE.map((s) => (
                <div key={s.label} className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-muted normal-case">{s.label}</span>
                  <span className="text-base sm:text-lg" style={{ color: ACCENT }}>
                    {s.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Retention engine ── */}
      <section className="pb-16 sm:pb-20">
        <p className="text-[10px] text-dim normal-case sm:text-xs" style={{ color: ACCENT }}>
          Why devs keep coming back
        </p>
        <h2 className="mt-2 mb-3 text-2xl text-cream sm:text-3xl">
          The retention engine
        </h2>
        <p className="mb-8 text-sm leading-relaxed text-muted normal-case sm:text-base">
          Sponsored events plug into a loop that already runs. Streaks, raids, dailies, weekly digests — every action triggers an email or notification that brings devs back.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="border-[3px] border-border bg-bg-raised p-5 sm:p-6">
            <p className="mb-4 text-xs text-dim">Loop activity, last 30 days</p>
            <div className="space-y-3">
              {LOOP_ACTIVITY.map((s) => (
                <div key={s.label} className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-muted normal-case">{s.label}</span>
                  <span className="text-base sm:text-lg" style={{ color: ACCENT }}>
                    {s.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="border-[3px] border-border bg-bg-raised p-5 sm:p-6">
            <p className="mb-4 text-xs text-dim">Automated comeback triggers</p>
            <ul className="space-y-3 text-sm leading-relaxed text-muted normal-case">
              <li>
                <span className="text-cream">Raid alert emails</span> on every attack, batched every 60 minutes.
              </li>
              <li>
                <span className="text-cream">Streak milestones</span> at 7, 30, 100, and 365 days.
              </li>
              <li>
                <span className="text-cream">Weekly digest</span> every Monday at 10:00 UTC.
              </li>
              <li>
                <span className="text-cream">Daily missions</span>, achievements, and a live activity feed.
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="pb-16 sm:pb-20">
        <p className="text-[10px] text-dim normal-case sm:text-xs" style={{ color: ACCENT }}>
          From first call to live activation
        </p>
        <h2 className="mt-2 mb-10 text-2xl text-cream sm:text-3xl">How it works</h2>

        <ol className="relative space-y-8 sm:space-y-10">
          {/* vertical connector line */}
          <div
            className="absolute left-5 top-3 bottom-3 w-px sm:left-7"
            style={{ backgroundColor: "var(--color-border)" }}
            aria-hidden
          />

          {STEPS.map((step) => (
            <li key={step.n} className="relative flex gap-5 sm:gap-7">
              {/* number badge */}
              <div className="relative z-10 shrink-0">
                <div
                  className="flex h-10 w-10 items-center justify-center border-[3px] bg-bg sm:h-14 sm:w-14"
                  style={{ borderColor: ACCENT }}
                >
                  <span className="text-sm sm:text-lg" style={{ color: ACCENT }}>
                    {step.n}
                  </span>
                </div>
              </div>

              {/* content */}
              <div className="flex-1 pt-1 sm:pt-2">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <p className="text-base text-cream sm:text-lg">{step.title}</p>
                  <p className="text-[10px] text-dim normal-case sm:text-xs">
                    {step.duration}
                  </p>
                </div>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted normal-case sm:text-base">
                  {step.body}
                </p>
              </div>
            </li>
          ))}
        </ol>

        <div
          className="mt-10 border-l-[3px] py-2 pl-5"
          style={{ borderColor: ACCENT }}
        >
          <p className="text-sm normal-case sm:text-base" style={{ color: ACCENT }}>
            Solo dev. No agency. No committees. You talk to the person who builds it.
          </p>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="pb-16 sm:pb-20">
        <h2 className="mb-6 text-2xl text-cream sm:text-3xl">FAQ</h2>
        <div className="space-y-2">
          {FAQ.map((item) => (
            <details key={item.q} className="group border-2 border-border">
              <summary className="flex cursor-pointer items-center justify-between p-4 text-sm text-cream transition-colors hover:text-lime [&::-webkit-details-marker]:hidden">
                {item.q}
                <span className="ml-3 text-xs text-muted transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="border-t border-border px-4 py-3 text-sm leading-relaxed text-muted normal-case">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </section>

      {/* ── Final CTA + Form ── */}
      <section id="contact" className="pb-16 sm:pb-20">
        <h2 className="mb-3 text-2xl text-cream sm:text-3xl">
          Pitch your brand
        </h2>
        <p className="mb-8 text-sm leading-relaxed text-muted normal-case sm:text-base">
          Tell me what you want to launch. I respond within 48 hours with a proposal.
        </p>

        <div className="border-[3px] border-border bg-bg-raised p-5 sm:p-8">
          {success ? (
            <div className="py-10 text-center">
              <p className="text-xl sm:text-2xl" style={{ color: ACCENT }}>
                Got it. Reply within 48 hours.
              </p>
              <p className="mt-6 text-sm text-muted normal-case">Sam</p>
            </div>
          ) : (
            <div className="space-y-4">
              <Field label="Name" counter={`${name.length}/100`}>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                  placeholder="Jane Doe"
                  className="w-full border-[3px] border-border bg-transparent px-3 py-2 font-pixel text-xs text-cream outline-none transition-colors focus:border-lime"
                />
              </Field>

              <Field label="Email" counter={`${email.length}/200`}>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  maxLength={200}
                  placeholder="you@company.com"
                  className="w-full border-[3px] border-border bg-transparent px-3 py-2 font-pixel text-xs text-cream outline-none transition-colors focus:border-lime"
                />
              </Field>

              <Field label="Company" counter={`${company.length}/200`}>
                <input
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  maxLength={200}
                  placeholder="Acme Inc."
                  className="w-full border-[3px] border-border bg-transparent px-3 py-2 font-pixel text-xs text-cream outline-none transition-colors focus:border-lime"
                />
              </Field>

              <Field label="Role (optional)" counter={`${role.length}/100`}>
                <input
                  type="text"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  maxLength={100}
                  placeholder="e.g. Head of DevRel"
                  className="w-full border-[3px] border-border bg-transparent px-3 py-2 font-pixel text-xs text-cream outline-none transition-colors focus:border-lime"
                />
              </Field>

              <Field label="Website" counter={`${website.length}/300`}>
                <input
                  type="text"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  maxLength={300}
                  placeholder="e.g. yourcompany.com"
                  className="w-full border-[3px] border-border bg-transparent px-3 py-2 font-pixel text-xs text-cream outline-none transition-colors focus:border-lime"
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Format interest">
                  <PixelSelect
                    value={formatInterest}
                    onChange={(v) => setFormatInterest(v)}
                    placeholder="Select an option"
                    ariaLabel="Format interest"
                    className="w-full"
                    options={FORMAT_OPTIONS.map((opt) => ({ value: opt, label: opt }))}
                  />
                </Field>

                <Field label="Budget (optional)">
                  <PixelSelect
                    value={budget}
                    onChange={(v) => setBudget(v)}
                    placeholder="Select an option"
                    ariaLabel="Budget"
                    className="w-full"
                    options={BUDGET_OPTIONS.map((opt) => ({ value: opt, label: opt }))}
                  />
                </Field>
              </div>

              <Field label="Message" counter={`${message.length}/2000`}>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  maxLength={2000}
                  rows={5}
                  placeholder="What are you launching, by when, and what would success look like?"
                  className="w-full border-[3px] border-border bg-transparent px-3 py-2 font-pixel text-xs text-cream normal-case outline-none transition-colors focus:border-lime"
                />
              </Field>

              {error && (
                <div
                  className="border-[3px] px-4 py-3 text-center text-xs normal-case"
                  style={{
                    borderColor: "#ff6b6b",
                    color: "#ff6b6b",
                    backgroundColor: "#ff6b6b10",
                  }}
                >
                  {error}{" "}
                  <a
                    href="mailto:samuel@thegitcity.com"
                    className="underline hover:opacity-80"
                  >
                    Email me directly at samuel@thegitcity.com
                  </a>
                </div>
              )}

              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="btn-press w-full py-3.5 text-sm text-bg transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
                style={{
                  backgroundColor: ACCENT,
                  boxShadow: "4px 4px 0 0 #5a7a00",
                }}
              >
                {loading ? "Sending..." : "Send pitch"}
              </button>
              <p className="text-center text-[10px] text-muted normal-case">
                Or email{" "}
                <a
                  href="mailto:samuel@thegitcity.com"
                  className="hover:text-cream"
                  style={{ color: ACCENT }}
                >
                  samuel@thegitcity.com
                </a>{" "}
                directly.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ── Footer note ── */}
      <footer className="pb-12 text-center">
        <p className="text-xs text-muted normal-case">
          Built by Samuel, solo dev.{" "}
          <a
            href="mailto:samuel@thegitcity.com"
            className="transition-colors hover:text-cream"
            style={{ color: ACCENT }}
          >
            samuel@thegitcity.com
          </a>
          .
        </p>
      </footer>
    </>
  );
}

/* ─────────────── sub-components ─────────────── */

function FormatCard({
  name,
  tagline,
  description,
  price,
  bullets,
  ctaLabel,
  ctaHref,
  onSelect,
  featured,
}: {
  name: string;
  tagline?: string;
  description: string;
  price: string;
  bullets: string[];
  ctaLabel: string;
  ctaHref?: string;
  onSelect?: () => void;
  featured?: boolean;
}) {
  return (
    <div
      className="relative flex flex-col border-[3px] bg-bg-raised p-5 sm:p-6"
      style={{ borderColor: featured ? ACCENT : undefined }}
    >
      {featured && (
        <span
          className="absolute -top-3 left-4 px-2 py-0.5 text-[10px] text-bg"
          style={{ backgroundColor: ACCENT }}
        >
          MOST POPULAR
        </span>
      )}
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-base text-cream sm:text-lg">{name}</p>
        {tagline && (
          <span className="text-[9px] text-dim normal-case sm:text-[10px]">
            {tagline}
          </span>
        )}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted normal-case sm:text-sm">
        {description}
      </p>
      <p
        className="mt-4 text-base sm:text-lg"
        style={{ color: featured ? ACCENT : CREAM }}
      >
        {price}
      </p>
      <div className="my-4 h-0.5 bg-border" />
      <ul className="flex-1 space-y-2">
        {bullets.map((b) => (
          <li
            key={b}
            className="flex items-start gap-2 text-xs text-muted normal-case"
          >
            <span style={{ color: ACCENT }} className="mt-0.5 text-[10px]">
              +
            </span>
            {b}
          </li>
        ))}
      </ul>
      {ctaHref ? (
        <Link
          href={ctaHref}
          onClick={() => trackSponsorshipCtaClick(name)}
          className={`btn-press mt-5 inline-block w-full py-3 text-center text-sm transition-colors ${
            featured ? "text-bg" : "text-cream"
          }`}
          style={
            featured
              ? {
                  backgroundColor: ACCENT,
                  boxShadow: "4px 4px 0 0 #5a7a00",
                }
              : {
                  backgroundColor: "transparent",
                  border: `2px solid ${ACCENT}`,
                  boxShadow: "4px 4px 0 0 #5a7a00",
                }
          }
        >
          {ctaLabel}
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => {
            trackSponsorshipCtaClick(name);
            onSelect?.();
          }}
          className={`btn-press mt-5 w-full py-3 text-sm transition-colors ${
            featured ? "text-bg" : "text-cream"
          }`}
          style={
            featured
              ? {
                  backgroundColor: ACCENT,
                  boxShadow: "4px 4px 0 0 #5a7a00",
                }
              : {
                  backgroundColor: "transparent",
                  border: `2px solid ${ACCENT}`,
                  boxShadow: "4px 4px 0 0 #5a7a00",
                }
          }
        >
          {ctaLabel}
        </button>
      )}
    </div>
  );
}

function Field({
  label,
  counter,
  children,
}: {
  label: string;
  counter?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <label className="text-[10px] text-muted normal-case">{label}</label>
        {counter && (
          <span className="text-[9px] text-muted normal-case">{counter}</span>
        )}
      </div>
      {children}
    </div>
  );
}
