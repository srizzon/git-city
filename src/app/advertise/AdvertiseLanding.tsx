"use client";

import { useState, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import { trackAdvertiseCtaClick } from "@/lib/himetrica";
import { MAX_TEXT_LENGTH } from "@/lib/skyAds";

const AdPreview = dynamic(() => import("@/components/AdPreview"), { ssr: false });

const ACCENT = "#c8e64a";
const CREAM = "#e8dcc8";

type Currency = "usd" | "brl";
type PreviewVehicle = "rooftop_sign" | "blimp" | "plane" | "led_wrap" | "billboard" | null;
type PackageId = "foundation" | "skyline" | "landmark" | null;

const NOTABLE_DEVS = [
  { login: "torvalds", name: "Linus Torvalds" },
  { login: "bcherny", name: "Boris Cherny" },
  { login: "steipete", name: "Peter Steinberger" },
  { login: "gustavoguanabara", name: "Gustavo Guanabara" },
  { login: "filipedeschamps", name: "Filipe Deschamps" },
];

const FAQ = [
  {
    q: "How many people will see my ad?",
    a: "Each rooftop sign gets ~63K impressions/mo. A blimp gets ~41K. A full Skyline package reaches 200K+ combined monthly impressions across all vehicles.",
  },
  {
    q: "What's included in each package?",
    a: "Foundation includes 2 rooftop signs. Skyline adds a blimp, LED wrap, and plane. Landmark includes everything plus a custom 3D building and social media launch posts.",
  },
  {
    q: "How do I pay?",
    a: "Credit card, Apple Pay, or Google Pay via Stripe. Secure checkout, cancel anytime.",
  },
  {
    q: "Can I change my ad after buying?",
    a: "Yes. Update your text, brand, description, and link anytime from the dashboard. Unlimited changes, no extra cost.",
  },
  {
    q: "What if I want to cancel?",
    a: "Cancel anytime. Your ads stay active until the end of the billing period.",
  },
  {
    q: "How is CTR measured?",
    a: "We track impressions when your ad enters the viewport and clicks when a developer interacts with it. All stats are available in real-time on your dashboard.",
  },
];

const PACKAGE_LABELS: Record<string, string> = {
  foundation: "Foundation",
  skyline: "Skyline",
  landmark: "Landmark",
};

/* ─────────────── main component ─────────────── */
export default function AdvertiseLanding() {
  const [currency, setCurrency] = useState<Currency>("usd");
  const [checkoutPkg, setCheckoutPkg] = useState<PackageId>(null);
  const [brand, setBrand] = useState("");
  const [text, setText] = useState("");
  const [color, setColor] = useState("#f8d880");
  const [bgColor, setBgColor] = useState("#1a1018");
  const [link, setLink] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [previewVehicle, setPreviewVehicle] = useState<PreviewVehicle>(null);
  const packagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof navigator !== "undefined") {
      const lang = navigator.language || "";
      if (lang.startsWith("pt")) setCurrency("brl");
    }
  }, []);

  function scrollToPackages() {
    packagesRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  function openCheckout(pkg: PackageId) {
    trackAdvertiseCtaClick();
    setCheckoutPkg(pkg);
    setError("");
    setLoading(false);
  }

  const textLength = text.length;
  const textOver = textLength > MAX_TEXT_LENGTH;
  const hexValid = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v);
  const colorValid = hexValid(color);
  const bgColorValid = hexValid(bgColor);
  const canSubmit = text.trim().length > 0 && !textOver && colorValid && bgColorValid && !loading;

  async function handleCheckout() {
    if (!canSubmit || !checkoutPkg) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/ads/checkout/package", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          package_id: checkoutPkg,
          brand: brand.trim() || undefined,
          text: text.trim(),
          color,
          bgColor,
          currency,
          link: link.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong");
        setLoading(false);
        return;
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  function getPriceLabel(pkg: string): string {
    const prices: Record<string, Record<Currency, string>> = {
      foundation: { usd: "$47", brl: "R$297" },
      skyline: { usd: "$77", brl: "R$497" },
      landmark: { usd: "$127", brl: "R$797" },
    };
    return prices[pkg]?.[currency] ?? "";
  }

  return (
    <>
      {/* ── Hero ── */}
      <section className="pt-16 pb-20 text-center sm:pt-24 sm:pb-28">
        <h1 className="text-4xl text-cream sm:text-6xl lg:text-7xl">
          Your brand.{" "}
          <span style={{ color: ACCENT }}>In the skyline.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-sm leading-relaxed text-muted normal-case sm:text-base">
          Planes, blimps, and rooftop signs inside a 3D city with 172K+ developers. 1%+ CTR — 3x the industry average.
        </p>
        <button
          onClick={scrollToPackages}
          className="btn-press mt-10 px-8 py-4 text-sm text-bg sm:text-base"
          style={{
            backgroundColor: ACCENT,
            boxShadow: "4px 4px 0 0 #5a7a00",
          }}
        >
          See Packages
        </button>
      </section>

      {/* ── Traction ── */}
      <section className="pb-16 sm:pb-20">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {[
            { n: "172K+", l: "Unique Visitors", accent: true },
            { n: "3.3M+", l: "Ad Impressions", accent: true },
            { n: "64+", l: "Ads Sold", accent: false },
            { n: "71K+", l: "Devs in the City", accent: false },
          ].map((m) => (
            <div
              key={m.l}
              className="border-[3px] bg-bg-raised p-4 text-center sm:p-6"
              style={{ borderColor: m.accent ? ACCENT : undefined }}
            >
              <p
                className="text-2xl sm:text-4xl"
                style={{ color: m.accent ? ACCENT : CREAM }}
              >
                {m.n}
              </p>
              <p className="mt-2 text-[9px] text-dim sm:text-xs">{m.l}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {["40K+ Logged In", "14K+ Link Clicks", "$0 Marketing · 100% Organic"].map((t) => (
            <span key={t} className="border-2 border-border px-3 py-1.5 text-[9px] text-muted sm:text-xs">
              {t}
            </span>
          ))}
        </div>
      </section>

      {/* ── Audience ── */}
      <section className="pb-16 sm:pb-20">
        <h2 className="mb-8 text-2xl text-cream sm:text-3xl">Audience</h2>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-4">
          <StatCard value="Global" sub="IN 36% · BR 15% · US 8%" accent />
          <StatCard value="69%" sub="Desktop" accent />
          <StatCard value="1K+" sub="Daily Visitors" />
          <StatCard value="6K+" sub="Weekly Visitors" />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
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

        <div className="mt-4">
          <p className="mb-3 text-xs text-dim normal-case">
            Linus Torvalds has a building here. So do 71,000+ other developers, including:
          </p>
          <div className="flex flex-wrap items-center gap-3">
            {NOTABLE_DEVS.map((dev) => (
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
      </section>

      {/* ── Packages ── */}
      <section ref={packagesRef} className="pb-16 sm:pb-20">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl text-cream sm:text-3xl">Packages</h2>
          <div className="flex border-2 border-border text-xs">
            {(["usd", "brl"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCurrency(c)}
                className="px-4 py-1.5 transition-colors"
                style={{
                  backgroundColor: currency === c ? ACCENT : "transparent",
                  color: currency === c ? "#1a1018" : "var(--color-muted)",
                }}
              >
                {c.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:gap-5 lg:grid-cols-3">
          <PackageCard
            name="Foundation"
            price={currency === "usd" ? "$47" : "R$297"}
            period="/mo"
            cta="Go Foundation"
            features={[
              "2 Rooftop Signs on top-contributor buildings",
              "~63K impressions/mo per sign",
              "Real-time stats dashboard",
            ]}
            onSelect={() => openCheckout("foundation")}
          />
          <PackageCard
            name="Skyline"
            price={currency === "usd" ? "$77" : "R$497"}
            period="/mo"
            cta="Go Skyline"
            features={[
              "2 Rooftop Signs",
              "Blimp flying across the skyline",
              "LED Wrap on buildings",
              "Plane with banner",
              "200K+ combined impressions/mo",
            ]}
            onSelect={() => openCheckout("skyline")}
          />
          <PackageCard
            name="Landmark"
            price={currency === "usd" ? "$127" : "R$797"}
            period="/mo"
            featured
            cta="Go Landmark"
            features={[
              "Everything in Skyline",
              "Custom 3D building with your brand",
              "Launch post to 7K+ followers on Instagram & X",
            ]}
            onSelect={() => openCheckout("landmark")}
          />
        </div>
      </section>

      {/* ── Formats ── */}
      <section className="pb-16 sm:pb-20">
        <h2 className="mb-8 text-2xl text-cream sm:text-3xl">Formats</h2>

        {/* Landmark — featured */}
        <div className="border-[3px] p-5 sm:p-8" style={{ borderColor: ACCENT }}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-lg">
              <div className="flex items-center gap-3">
                <p className="text-lg text-cream sm:text-2xl">Landmark</p>
                <span
                  className="border px-2 py-0.5 text-[10px]"
                  style={{ borderColor: ACCENT, color: ACCENT }}
                >
                  PREMIUM
                </span>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-muted normal-case">
                Your company becomes a building in the city. Custom 3D model with
                your brand colors and logo. Developers click on it every day.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {["AbacatePay", "Viral Day", "Acelera Dev"].map((name) => (
                  <span key={name} className="border-2 border-border px-3 py-1.5 text-xs text-muted">
                    {name}
                  </span>
                ))}
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

        {/* Rooftop + Blimp */}
        <div className="mt-4 grid gap-4 sm:gap-6 sm:grid-cols-2">
          <FormatCard
            name="Rooftop Sign"
            description="Illuminated sign that spins 360° on top of the tallest buildings. Click goes straight to your link — no extra steps."
            onPreview={() => setPreviewVehicle("rooftop_sign")}
            stats={
              <div className="flex items-baseline gap-6">
                <div>
                  <p className="text-2xl sm:text-3xl" style={{ color: ACCENT }}>0.93%</p>
                  <p className="mt-1 text-[10px] text-dim">CTR</p>
                </div>
                <div>
                  <p className="text-2xl sm:text-3xl" style={{ color: CREAM }}>96%</p>
                  <p className="mt-1 text-[10px] text-dim">click&rarr;visit</p>
                </div>
              </div>
            }
          />
          <FormatCard
            name="Blimp"
            description="Airship with LED screens on both sides. Flies slowly across the skyline — impossible to miss."
            onPreview={() => setPreviewVehicle("blimp")}
            stats={
              <div>
                <p className="text-2xl sm:text-3xl" style={{ color: ACCENT }}>0.35%</p>
                <p className="mt-1 text-[10px] text-dim">CTR</p>
              </div>
            }
          />
        </div>
      </section>

      {/* ── Case Study ── */}
      <section className="pb-16 sm:pb-20">
        <h2 className="mb-8 text-2xl text-cream sm:text-3xl">Results</h2>

        <div className="border-[3px] border-border bg-bg-raised p-5 sm:p-8">
          {/* Quote */}
          <div className="flex items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://github.com/BonaVictor.png?size=64"
              alt="Victor Bona"
              width={40}
              height={40}
              className="rounded-sm border border-border"
              loading="lazy"
            />
            <div>
              <p className="text-sm text-cream">Victor Bona</p>
              <p className="text-[10px] text-dim normal-case">guaracloud.com</p>
            </div>
          </div>

          <p className="mt-5 text-sm leading-relaxed text-muted normal-case">
            &ldquo;Ads on Git City really impressed me. 1,400 impressions and dozens of clicks in less than 24 hours. We converted 6 users to our Hobby trial.&rdquo;
          </p>

          {/* Stats row */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="border-2 border-border p-3 text-center">
              <p className="text-lg sm:text-2xl" style={{ color: ACCENT }}>3,900</p>
              <p className="mt-1 text-[9px] text-dim">Impressions</p>
            </div>
            <div className="border-2 border-border p-3 text-center">
              <p className="text-lg sm:text-2xl" style={{ color: ACCENT }}>136</p>
              <p className="mt-1 text-[9px] text-dim">Clicks</p>
            </div>
            <div className="border-2 border-border p-3 text-center">
              <p className="text-lg sm:text-2xl" style={{ color: ACCENT }}>9</p>
              <p className="mt-1 text-[9px] text-dim">Conversions</p>
            </div>
            <div className="border-2 border-border p-3 text-center">
              <p className="text-lg sm:text-2xl" style={{ color: ACCENT }}>0.44%</p>
              <p className="mt-1 text-[9px] text-dim">CTR</p>
            </div>
          </div>

          <p className="mt-4 text-[10px] text-dim normal-case">
            Guara Cloud — Skyline package, 3 days of data. Blimp + Landmark + Rooftop Sign.
          </p>
        </div>

        {/* Industry benchmark */}
        <div
          className="mt-4 border-l-[3px] py-2 pl-5"
          style={{ borderColor: ACCENT }}
        >
          <p className="text-sm text-muted normal-case">
            Industry avg display ad CTR (Tech/SaaS):{" "}
            <span className="text-cream">0.34%</span>
          </p>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="pb-16 sm:pb-20">
        <h2 className="mb-6 text-2xl text-cream sm:text-3xl">FAQ</h2>
        <div className="space-y-2">
          {FAQ.map((item) => (
            <details
              key={item.q}
              className="group border-2 border-border"
            >
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

      {/* ── Footer ── */}
      <footer className="pb-12 text-center">
        <p className="text-xs text-muted normal-case">
          Questions?{" "}
          <a
            href="mailto:samuel@thegitcity.com"
            className="transition-colors hover:text-cream"
            style={{ color: ACCENT }}
          >
            samuel@thegitcity.com
          </a>
        </p>
        <p className="mt-4 text-xs text-muted normal-case">
          Built by{" "}
          <a
            href="https://x.com/samuelrizzondev"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-cream"
            style={{ color: ACCENT }}
          >
            @samuelrizzondev
          </a>
        </p>
      </footer>

      {/* ── Checkout Modal ── */}
      {checkoutPkg && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !loading) setCheckoutPkg(null);
          }}
        >
          <div className="w-full max-w-md border-[3px] border-border bg-bg p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-base text-cream sm:text-lg">
                {PACKAGE_LABELS[checkoutPkg]}{" "}
                <span className="text-sm text-muted">{getPriceLabel(checkoutPkg)}/mo</span>
              </h3>
              <button
                onClick={() => !loading && setCheckoutPkg(null)}
                className="text-sm text-muted transition-colors hover:text-cream"
              >
                &times;
              </button>
            </div>

            <p className="mt-3 text-[10px] text-dim normal-case">
              Set up your ads — you can change everything later from the dashboard.
            </p>

            <div className="mt-4 space-y-3">
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
                  className="mt-1 w-full border-[3px] border-border bg-transparent px-3 py-2 font-pixel text-xs text-cream outline-none transition-colors focus:border-lime"
                />
              </div>

              {/* Banner text */}
              <div>
                <div className="flex items-baseline justify-between">
                  <label className="text-[10px] text-muted normal-case">Banner text</label>
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
                  className="mt-1 w-full border-[3px] border-border bg-transparent px-3 py-2 font-pixel text-xs text-cream uppercase outline-none transition-colors focus:border-lime"
                />
              </div>

              {/* Link */}
              <div>
                <label className="text-[10px] text-muted normal-case">Link (optional)</label>
                <input
                  type="url"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="https://yoursite.com"
                  className="mt-1 w-full border-[3px] border-border bg-transparent px-3 py-2 font-pixel text-xs text-cream outline-none transition-colors focus:border-lime"
                />
              </div>

              {/* Colors */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-muted normal-case">Text color</label>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      className="h-8 w-8 cursor-pointer border-2 border-border bg-transparent"
                    />
                    <input
                      type="text"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      maxLength={7}
                      className="w-full border-2 border-border bg-transparent px-2 py-1.5 font-pixel text-[10px] text-cream outline-none transition-colors focus:border-lime"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-muted normal-case">Background</label>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      type="color"
                      value={bgColor}
                      onChange={(e) => setBgColor(e.target.value)}
                      className="h-8 w-8 cursor-pointer border-2 border-border bg-transparent"
                    />
                    <input
                      type="text"
                      value={bgColor}
                      onChange={(e) => setBgColor(e.target.value)}
                      maxLength={7}
                      className="w-full border-2 border-border bg-transparent px-2 py-1.5 font-pixel text-[10px] text-cream outline-none transition-colors focus:border-lime"
                    />
                  </div>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div
                  className="border-[3px] px-4 py-3 text-center text-xs normal-case"
                  style={{ borderColor: "#ff6b6b", color: "#ff6b6b", backgroundColor: "#ff6b6b10" }}
                >
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                type="button"
                onClick={handleCheckout}
                disabled={!canSubmit}
                className="btn-press w-full py-3.5 text-sm text-bg transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
                style={{
                  backgroundColor: ACCENT,
                  boxShadow: "4px 4px 0 0 #5a7a00",
                }}
              >
                {loading
                  ? "Redirecting to checkout..."
                  : `Start for ${getPriceLabel(checkoutPkg)}/mo`}
              </button>
              <p className="text-center text-[9px] text-muted normal-case">
                Monthly subscription, cancel anytime. Secure checkout via Stripe.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Format Preview Modal ── */}
      {previewVehicle && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPreviewVehicle(null);
          }}
        >
          <div className="w-full max-w-2xl border-[3px] border-border bg-bg p-4 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base text-cream sm:text-lg">
                {previewVehicle === "rooftop_sign"
                  ? "Rooftop Sign"
                  : previewVehicle === "led_wrap"
                    ? "LED Wrap"
                    : previewVehicle.charAt(0).toUpperCase() + previewVehicle.slice(1)}{" "}
                Preview
              </h3>
              <button
                onClick={() => setPreviewVehicle(null)}
                className="text-sm text-muted transition-colors hover:text-cream"
              >
                &times;
              </button>
            </div>
            <AdPreview
              vehicle={previewVehicle}
              text="YOUR BRAND HERE"
              color="#f8d880"
              bgColor="#1a1018"
              tall
            />
          </div>
        </div>
      )}
    </>
  );
}

/* ─────────────── sub-components ─────────────── */

function StatCard({
  value,
  sub,
  accent,
}: {
  value: string;
  sub: string;
  accent?: boolean;
}) {
  return (
    <div className="border-[3px] border-border bg-bg-raised p-3 text-center sm:p-4">
      <p
        className="text-lg sm:text-2xl"
        style={{ color: accent ? ACCENT : CREAM }}
      >
        {value}
      </p>
      <p className="mt-1 text-[9px] text-dim sm:text-[10px]">{sub}</p>
    </div>
  );
}

function PackageCard({
  name,
  price,
  period,
  features,
  featured,
  cta,
  onSelect,
}: {
  name: string;
  price: string;
  period: string;
  features: string[];
  featured?: boolean;
  cta?: string;
  onSelect: () => void;
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
      <p className="text-base text-cream sm:text-lg">{name}</p>
      <div className="mt-3">
        <span
          className="text-2xl sm:text-3xl"
          style={{ color: featured ? ACCENT : CREAM }}
        >
          {price}
        </span>
        <span className="ml-1 text-xs text-muted">{period}</span>
      </div>
      <div className="my-4 h-0.5 bg-border" />
      <ul className="flex-1 space-y-2">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-xs text-muted normal-case">
            <span style={{ color: ACCENT }} className="mt-0.5 text-[10px]">
              +
            </span>
            {f}
          </li>
        ))}
      </ul>
      <button
        onClick={onSelect}
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
        {cta ?? "Get Started"}
      </button>
    </div>
  );
}

function FormatCard({
  name,
  description,
  stats,
  onPreview,
}: {
  name: string;
  description: string;
  stats: React.ReactNode;
  onPreview: () => void;
}) {
  return (
    <div className="border-[3px] border-border bg-bg-raised p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <p className="text-base text-cream sm:text-lg">{name}</p>
        <button
          onClick={onPreview}
          className="cursor-pointer border-2 px-3 py-1 text-[10px] transition-colors hover:text-bg"
          style={{ borderColor: ACCENT, color: ACCENT }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = ACCENT; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = ACCENT; }}
        >
          Preview
        </button>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-muted normal-case">
        {description}
      </p>
      <div className="mt-5 h-0.5 bg-border" />
      <div className="mt-4">{stats}</div>
    </div>
  );
}
