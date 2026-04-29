"use client";

import { useState } from "react";
import Link from "next/link";
import { trackSponsorshipCtaClick } from "@/lib/himetrica";
import { SPONSORS } from "@/lib/sponsors/registry";

const ACCENT = "#c8e64a";
const CREAM = "#e8dcc8";

const FAQ = [
  {
    q: "How do you measure success?",
    a: "Every format is tracked. Impressions, clicks, click-to-visit rate, time spent. You get a real-time dashboard plus a weekly summary email. For Themed Weeks, you also get screenshots, social mentions, and a final case study report.",
  },
  {
    q: "What if my product is B2B and niche?",
    a: "Git City's audience is developers who actively code, ship, and contribute. If your product solves a developer pain point (devtool, AI infra, cloud, database, observability, hardware), the fit is direct. If you target non-technical buyers, this probably isn't the right fit. I'll tell you that on the call.",
  },
  {
    q: "How long does a custom build take?",
    a: "Standard Landmark: 2 to 3 weeks from contract sign. Themed Week: 2 to 4 weeks depending on scope. Annual Partnership starts with the first activation, then iterates from there.",
  },
  {
    q: "Can I customize the landmark beyond colors?",
    a: "Yes. The 3D building is custom modeled. I can add interactive elements, your logo, branded cosmetic drops, click-through CTAs, and event-triggered animations. Walk in with a brief, leave with a one-pager.",
  },
  {
    q: "Is there a contract?",
    a: "For Landmark and Pixel Drop, simple SOW with monthly invoicing. For Themed Week and Annual, custom MSA with deliverables and timeline. No agency overhead either way.",
  },
  {
    q: "What is the refund policy?",
    a: "Sky Ads: cancel anytime, no questions. Landmark: prorated refund if I miss a delivery milestone. Themed Week and Annual: defined in the SOW per project.",
  },
];

const NUMBERS = [
  { n: "70K", l: "Devs in the city" },
  { n: "40K", l: "Logged in via GitHub" },
  { n: "5M", l: "Views in 2 months" },
  { n: "5K", l: "Stars on GitHub" },
  { n: "GitHub", l: "Reposted this month" },
];

const CITY_STATS = [
  { value: "70,000", label: "Buildings in the city" },
  { value: "40,000", label: "Connected via GitHub OAuth" },
  { value: "5M+", label: "Social views in 2 months" },
  { value: "5,000+", label: "GitHub repo stars" },
];

const AGGREGATE = [
  { value: "7.9M+", label: "Combined GitHub stars across all devs" },
  { value: "1.8M+", label: "Combined followers across all devs" },
  { value: "290K+", label: "Public repositories represented" },
  { value: "1,000+", label: "New developers joining per day (average)" },
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
  "Themed Week",
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

const SPONSOR_ORDER = ["firecrawl", "guaracloud", "solana-hackathon"];

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

  const sponsorCards = SPONSOR_ORDER
    .map((slug) => SPONSORS.find((s) => s.slug === slug))
    .filter((s): s is (typeof SPONSORS)[number] => Boolean(s));

  return (
    <>
      {/* ── Hero ── */}
      <section className="pt-12 pb-16 text-center sm:pt-20 sm:pb-20">
        <p className="text-xs text-muted normal-case sm:text-sm" style={{ color: ACCENT }}>
          For brands
        </p>
        <h1 className="mt-4 text-3xl text-cream sm:text-5xl lg:text-6xl">
          Put your brand where 40,000 developers already hang out
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-sm leading-relaxed text-muted normal-case sm:text-base">
          70,000 GitHub buildings. 40,000 connected. They race in the arcade, raid each other, claim their tower. Show up where they already live.
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

      {/* ── The problem ── */}
      <section className="pb-16 sm:pb-20">
        <h2 className="mb-8 text-2xl text-cream sm:text-3xl">
          Conferences last 3 days. YouTube sponsors last 24 hours. Now what?
        </h2>
        <div className="space-y-4 text-sm leading-relaxed text-muted normal-case sm:text-base">
          <p>
            DevRel is fragmented. Hackathons last 48 hours. The clock runs out before the launch lands.
          </p>
          <p>
            Developers install ad blockers by default. Display CPMs cross $20 with click-through under 1%.
          </p>
          <p>
            Experience wins. Roblox proved it: Chipotle&apos;s Boorito Maze hit 8M visits. Vans World hit 40M visits.
          </p>
        </div>
        <div
          className="mt-6 border-l-[3px] py-2 pl-5"
          style={{ borderColor: ACCENT }}
        >
          <p className="text-sm normal-case sm:text-base" style={{ color: ACCENT }}>
            Git City is the dev-native version. 40K real developers, already inside, already coming back.
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
            ctaLabel="Talk to me"
            onSelect={scrollToContact}
            featured
          />
          <FormatCard
            name="Themed Week"
            tagline="Campaign takeover"
            description="The city wears your brand for 1 to 2 weeks."
            price="Custom pricing"
            bullets={[
              "Skybox tinted in your brand colors",
              "Building skins shift across the city",
              "Branded race minigame in the arcade",
              "Exclusive cosmetic drop",
              "In-city event with countdown and rewards",
            ]}
            ctaLabel="Talk to me"
            onSelect={scrollToContact}
          />
          <FormatCard
            name="Annual Partnership"
            tagline="Always-on"
            description="Always-on landmark plus 2 to 4 takeover weeks per year."
            price="Custom pricing"
            bullets={[
              "Permanent prime landmark",
              "2 to 4 themed weeks per year",
              "Co-marketing across my channels",
              "First look on every new inventory I ship",
            ]}
            ctaLabel="Talk to me"
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
              ctaLabel="Talk to me"
              onSelect={scrollToContact}
            />
          </div>
        </div>
      </section>

      {/* ── Who's already inside ── */}
      <section className="pb-16 sm:pb-20">
        <h2 className="mb-3 text-2xl text-cream sm:text-3xl">Who&apos;s already inside</h2>
        <p className="mb-8 text-sm leading-relaxed text-muted normal-case sm:text-base">
          40,000 connected. 7.9M GitHub stars combined. 1.8M followers combined. The most engaged dev audience that&apos;s not LinkedIn or Hacker News.
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

      {/* ── Brands inside ── */}
      <section className="pb-16 sm:pb-20">
        <h2 className="mb-3 text-2xl text-cream sm:text-3xl">Brands already in the city</h2>
        <p className="mb-8 text-sm leading-relaxed text-muted normal-case sm:text-base">
          Active sponsors right now.
        </p>

        <div className="grid gap-4 sm:gap-5 lg:grid-cols-3">
          {sponsorCards.map((sponsor) => (
            <div
              key={sponsor.slug}
              className="border-[3px] border-border bg-bg-raised p-5 sm:p-6"
            >
              <p
                className="text-[10px] normal-case sm:text-xs"
                style={{ color: sponsor.accent }}
              >
                Active sponsor
              </p>
              <p className="mt-3 text-base text-cream sm:text-lg">{sponsor.name}</p>
              <p className="mt-2 text-xs leading-relaxed text-muted normal-case sm:text-sm">
                {sponsor.tagline}
              </p>
            </div>
          ))}
        </div>

        <div
          className="mt-6 border-[3px] p-5 sm:p-6"
          style={{ borderColor: ACCENT }}
        >
          <p className="text-base text-cream sm:text-lg">Featured officially by GitHub</p>
          <p className="mt-3 text-sm leading-relaxed text-muted normal-case">
            GitHub reposted Git City on X and Instagram in April 2026. Organic, zero marketing spend.
          </p>
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
                  <select
                    value={formatInterest}
                    onChange={(e) => setFormatInterest(e.target.value)}
                    className="w-full border-[3px] border-border bg-transparent px-3 py-2 font-pixel text-xs text-cream outline-none transition-colors focus:border-lime"
                  >
                    <option value="">Select an option</option>
                    {FORMAT_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Budget (optional)">
                  <select
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    className="w-full border-[3px] border-border bg-transparent px-3 py-2 font-pixel text-xs text-cream outline-none transition-colors focus:border-lime"
                  >
                    <option value="">Select an option</option>
                    {BUDGET_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
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
