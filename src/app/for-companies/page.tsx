import type { Metadata } from "next";
import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";

export const revalidate = 300;

const FOUNDING_SLOTS = 20;
const LAUNCH_END = "2026-04-30";

export const metadata: Metadata = {
  title: "Hire Developers with Verified GitHub Profiles - Git City",
  description:
    "Post developer jobs to a community of GitHub-verified profiles. Real salary required. See their code before the call. Launch pricing available.",
  openGraph: {
    title: "Hire Developers with Verified GitHub Profiles - Git City",
    description:
      "Post developer jobs to a community of GitHub-verified profiles. Real salary required. See their code before the call.",
    siteName: "Git City",
    type: "website",
  },
};

async function getStats() {
  const admin = getSupabaseAdmin();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const [cityStats, claimedRes, wauRes, languagesRes, foundingRes] = await Promise.all([
    admin.from("city_stats").select("total_developers, total_contributions").eq("id", 1).single(),
    admin.from("developers").select("*", { count: "exact", head: true }).eq("claimed", true),
    admin.from("streak_checkins").select("developer_id", { count: "exact", head: true }).gte("checkin_date", sevenDaysAgo),
    admin.from("developers").select("primary_language").eq("claimed", true).not("primary_language", "is", null).limit(1000),
    // Count founding companies (free tier used)
    admin.from("job_listings").select("company_id", { count: "exact", head: true }).eq("tier", "free").neq("status", "draft"),
  ]);

  const totalDevs = cityStats.data?.total_developers ?? 0;
  const totalContribs = cityStats.data?.total_contributions ?? 0;
  const claimed = claimedRes.count ?? 0;
  const wau = wauRes.count ?? 0;
  const foundingClaimed = foundingRes.count ?? 0;

  const langCount = new Map<string, number>();
  for (const row of languagesRes.data ?? []) {
    const lang = row.primary_language;
    if (lang) langCount.set(lang, (langCount.get(lang) ?? 0) + 1);
  }
  const topLanguages = [...langCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([lang]) => lang);

  // Days left until launch pricing ends
  const daysLeft = Math.max(0, Math.ceil((new Date(LAUNCH_END).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

  return { totalDevs, totalContribs, claimed, wau, topLanguages, foundingClaimed, foundingSpotsLeft: Math.max(0, FOUNDING_SLOTS - foundingClaimed), daysLeft };
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M+`;
  if (n >= 1000) return `${Math.floor(n / 1000)}k+`;
  return String(n);
}

const STEPS = [
  { n: "01", title: "Set up your company", desc: "Add your company name, website, and logo. Takes 2 minutes." },
  { n: "02", title: "Post your job", desc: "Role, tech stack, and salary range. No 'competitive compensation' allowed." },
  { n: "03", title: "Review verified candidates", desc: "Every applicant comes with their full GitHub profile and career history." },
];

const FAQ = [
  {
    q: "Git City is new. Why should I trust it?",
    a: "Git City launched in February 2026 and is growing organically. Every developer profile is built from real GitHub data. Every listing is manually reviewed. We're small, focused, and transparent about our numbers.",
  },
  {
    q: "What makes this different from LinkedIn or Indeed?",
    a: "On LinkedIn, anyone can claim 'Senior React Developer'. Here, you see their actual GitHub contributions, repos, stars, and commit streaks. You know if they ship code before you schedule a call.",
  },
  {
    q: "What is a Founding Company?",
    a: "The first 20 companies to post on Git City get a permanent 'Founding Company' badge on all their listings, a free first listing, and locked-in launch pricing forever. Once the 20 spots are taken, this offer is gone.",
  },
  {
    q: "What happens after launch pricing ends?",
    a: "Prices go up to regular rates ($99 Standard, $249 Featured, $449 Premium). Founding Companies keep their launch prices forever.",
  },
  {
    q: "Can I use a personal email?",
    a: "No. We require a company email domain to keep the job board trustworthy for developers.",
  },
  {
    q: "Can I edit my listing after posting?",
    a: "Yes. Update title, description, salary, and tech stack anytime from your dashboard.",
  },
];

const COMPARE_ROWS = [
  { feature: "Developer profiles", others: "Self-reported resumes", gitcity: "GitHub-verified data" },
  { feature: "Skills verification", others: "Trust the resume", gitcity: "Real contributions & repos" },
  { feature: "Salary on listing", others: "Optional or hidden", gitcity: "Required on every job" },
  { feature: "Candidate quality", others: "Mass applications", gitcity: "Developers self-select" },
  { feature: "Activity proof", others: "None", gitcity: "Streaks, XP, commit history" },
  { feature: "Community", others: "Resume database", gitcity: "Active developer platform" },
];

export default async function ForCompaniesPage() {
  const stats = await getStats();

  return (
    <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">

        {/* Nav */}
        <div className="flex items-center justify-between">
          <Link href="/" className="text-xs text-dim transition-colors hover:text-muted">&larr; Back to City</Link>
          <Link href="/business/login" className="text-xs text-muted transition-colors hover:text-cream">Log in</Link>
        </div>

        {/* ─── Launch banner ─── */}
        {stats.foundingSpotsLeft > 0 && (
          <div className="mt-6 border-[3px] border-[#fbbf24]/30 bg-[#fbbf24]/[0.04] p-4 text-center">
            <p className="text-xs text-[#fbbf24]">
              Early access: {stats.foundingSpotsLeft} of {FOUNDING_SLOTS} founding company spots left
              {stats.daysLeft > 0 && <> · Launch pricing ends in {stats.daysLeft} days</>}
            </p>
          </div>
        )}

        {/* ─── Hero ─── */}
        <div className="mt-10 sm:mt-14 text-center">
          <h1 className="text-3xl text-cream sm:text-5xl leading-tight">
            Hire developers<br />
            <span className="text-lime">who actually ship.</span>
          </h1>
          <p className="mt-5 text-sm text-muted normal-case max-w-lg mx-auto leading-relaxed">
            Stop guessing from resumes. Every developer here has a GitHub-verified profile with real contributions, real code, and real activity.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/business/login?redirect=/jobs/dashboard/new"
              className="btn-press inline-block bg-lime px-8 py-4 text-sm text-bg"
              style={{ boxShadow: "4px 4px 0 0 #5a7a00" }}
            >
              Post Your First Job Free
            </Link>
            <Link
              href="/jobs"
              className="btn-press inline-block border-[3px] border-border px-8 py-4 text-sm text-cream transition-colors hover:border-border-light"
            >
              Browse Jobs
            </Link>
          </div>
        </div>

        {/* ─── Live stats ─── */}
        <div className="mt-14">
          <p className="text-xs text-dim text-center mb-4 normal-case">Live from the database</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard value={fmt(stats.totalDevs)} label="Developer profiles" />
            <StatCard value={fmt(stats.claimed)} label="Signed up" />
            <StatCard value={fmt(stats.wau)} label="Active this week" />
            <StatCard value={fmt(stats.totalContribs)} label="GitHub contributions" />
          </div>
        </div>

        {/* ─── Comparison table ─── */}
        <div className="mt-14">
          <h2 className="text-sm text-muted/50 tracking-[0.15em] text-center mb-6">Git City vs other job boards</h2>
          <div className="border-[3px] border-border">
            <div className="grid grid-cols-3 border-b-[3px] border-border bg-bg-raised">
              <div className="p-4" />
              <div className="p-4 text-center border-l-[3px] border-border">
                <p className="text-xs text-muted">Others</p>
              </div>
              <div className="p-4 text-center border-l-[3px] border-border bg-lime/[0.03]">
                <p className="text-xs text-lime">Git City</p>
              </div>
            </div>
            {COMPARE_ROWS.map((row, i) => (
              <div key={row.feature} className={`grid grid-cols-3 ${i < COMPARE_ROWS.length - 1 ? "border-b-[3px] border-border" : ""}`}>
                <div className="p-4"><p className="text-xs text-cream">{row.feature}</p></div>
                <div className="p-4 border-l-[3px] border-border"><p className="text-xs text-red-400/50 normal-case">{row.others}</p></div>
                <div className="p-4 border-l-[3px] border-border bg-lime/[0.02]"><p className="text-xs text-lime/80 normal-case">{row.gitcity}</p></div>
              </div>
            ))}
          </div>
        </div>

        {/* ─── See a real profile ─── */}
        <div className="mt-14 border-[3px] border-lime/20 bg-lime/[0.03] p-8">
          <h2 className="text-sm text-cream text-center mb-2">See what a developer profile looks like</h2>
          <p className="text-xs text-muted text-center normal-case mb-6">
            This is what you see when a developer applies. Real data, verified by GitHub.
          </p>
          <div className="flex justify-center">
            <Link href="/hire/srizzon" className="btn-press border-[3px] border-lime/30 px-6 py-3 text-xs text-lime transition-colors hover:border-lime/50 hover:bg-lime/5">
              View example profile &#8599;
            </Link>
          </div>
        </div>

        {/* ─── Languages ─── */}
        {stats.topLanguages.length > 0 && (
          <div className="mt-8 text-center">
            <p className="text-xs text-dim mb-3">Top languages in the community</p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {stats.topLanguages.map((lang) => (
                <span key={lang} className="border-[2px] border-border px-3 py-1 text-xs text-muted">{lang}</span>
              ))}
            </div>
          </div>
        )}

        {/* ─── How it works ─── */}
        <div className="mt-14">
          <h2 className="text-sm text-muted/50 tracking-[0.15em] text-center mb-6">How it works</h2>
          <div className="space-y-3">
            {STEPS.map((step) => (
              <div key={step.n} className="border-[3px] border-border bg-bg-raised p-5 flex items-start gap-4">
                <span className="text-lg text-lime shrink-0">{step.n}</span>
                <div>
                  <p className="text-sm text-cream">{step.title}</p>
                  <p className="mt-1 text-xs text-muted normal-case">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ─── Pricing ─── */}
        <div className="mt-14">
          <div className="text-center mb-8">
            <h2 className="text-sm text-muted/50 tracking-[0.15em]">Launch Pricing</h2>
            {stats.daysLeft > 0 && (
              <p className="mt-2 text-xs text-[#fbbf24] normal-case">
                Ends in {stats.daysLeft} days. Founding Companies lock these prices forever.
              </p>
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <PricingCard
              tier="Standard"
              launchPrice="$49"
              regularPrice="$99"
              priceNote="per listing / 30 days"
              features={["30-day listing", "Salary visible to developers", "Application tracking", "Verified company badge"]}
              accent="var(--color-muted)"
              borderColor="var(--color-border)"
            />
            <PricingCard
              tier="Featured"
              launchPrice="$149"
              regularPrice="$249"
              priceNote="per listing / 30 days"
              features={["Everything in Standard", "Highlighted in search results", "Appears above standard listings", "More views from developers"]}
              accent="#c8e64a"
              borderColor="rgba(200,230,74,0.3)"
              recommended
            />
            <PricingCard
              tier="Premium"
              launchPrice="$249"
              regularPrice="$449"
              priceNote="per listing / 30 days"
              features={["Everything in Featured", "Pinned to the top of results", "Spotlight section on job board", "Maximum visibility"]}
              accent="#fbbf24"
              borderColor="rgba(251,191,36,0.3)"
            />
          </div>
          <p className="mt-4 text-center text-xs text-dim normal-case">
            All tiers include 30 days. Real salary ranges required on every listing.
          </p>
        </div>

        {/* ─── Founding Company ─── */}
        <div
          className="mt-8 border-[3px] p-8 sm:p-10 text-center"
          style={{
            borderColor: "rgba(251,191,36,0.3)",
            background: "linear-gradient(180deg, rgba(251,191,36,0.06) 0%, rgba(251,191,36,0.01) 100%)",
            boxShadow: "0 0 30px rgba(251,191,36,0.04)",
          }}
        >
          <span className="inline-block border-[2px] border-[#fbbf24]/50 px-3 py-1 text-xs text-[#fbbf24] mb-4">
            Founding Company
          </span>
          <p className="text-xl text-cream sm:text-2xl">First listing free. Launch prices forever.</p>
          <p className="mt-3 text-xs text-muted normal-case max-w-md mx-auto">
            The first {FOUNDING_SLOTS} companies to post on Git City become Founding Companies.
            You get a permanent badge on all your listings, a free first listing, and launch pricing locked in forever.
          </p>
          {stats.foundingSpotsLeft > 0 ? (
            <p className="mt-4 text-sm text-[#fbbf24]">
              {stats.foundingSpotsLeft} of {FOUNDING_SLOTS} spots left
            </p>
          ) : (
            <p className="mt-4 text-sm text-red-400">All founding spots have been claimed</p>
          )}
          <Link
            href="/business/login?redirect=/jobs/dashboard/new"
            className="btn-press inline-block mt-6 py-4 px-8 text-sm text-bg"
            style={{ backgroundColor: "#fbbf24", boxShadow: "4px 4px 0 0 #b8860b" }}
          >
            Claim Your Spot
          </Link>
          <p className="mt-3 text-xs text-dim normal-case">No credit card required for your first listing</p>
        </div>

        {/* ─── FAQ ─── */}
        <div className="mt-14">
          <h2 className="text-sm text-muted/50 tracking-[0.15em] text-center mb-6">FAQ</h2>
          <div className="space-y-2">
            {FAQ.map((item) => (
              <details key={item.q} className="group border-[3px] border-border">
                <summary className="flex cursor-pointer items-center justify-between p-4 text-xs text-cream transition-colors hover:text-lime [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <span className="ml-3 text-xs text-muted transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="border-t border-border px-4 py-3 text-xs leading-relaxed text-muted normal-case">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </div>

        {/* ─── Footer ─── */}
        <div className="mt-14 text-center pb-8">
          <p className="text-xs text-dim normal-case">
            Questions?{" "}
            <a href="mailto:samuelrizzondev@gmail.com" className="text-lime transition-colors hover:text-cream">
              samuelrizzondev@gmail.com
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}

/* ─── Components ─── */

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="border-[3px] border-border bg-bg-raised p-4 text-center">
      <p className="text-2xl text-lime">{value}</p>
      <p className="mt-1 text-xs text-muted">{label}</p>
    </div>
  );
}

function PricingCard({ tier, launchPrice, regularPrice, priceNote, features, accent, borderColor, recommended }: {
  tier: string;
  launchPrice: string;
  regularPrice: string;
  priceNote?: string;
  features: string[];
  accent: string;
  borderColor: string;
  recommended?: boolean;
}) {
  return (
    <div className="border-[3px] bg-bg-raised p-6 flex flex-col" style={{ borderColor }}>
      {recommended && (
        <span className="self-start border-[2px] px-2 py-0.5 text-xs mb-3" style={{ borderColor: accent, color: accent }}>
          Best Value
        </span>
      )}
      <p className="text-sm" style={{ color: accent }}>{tier}</p>
      <div className="mt-2 flex items-baseline gap-2">
        <p className="text-3xl text-cream">{launchPrice}</p>
        <p className="text-sm text-dim line-through">{regularPrice}</p>
      </div>
      {priceNote && <p className="text-xs text-dim">{priceNote}</p>}
      <ul className="mt-5 space-y-2.5 flex-1">
        {features.map((f) => (
          <li key={f} className="text-xs text-muted normal-case flex items-start gap-2">
            <span className="shrink-0" style={{ color: accent }}>&#10003;</span>
            {f}
          </li>
        ))}
      </ul>
      <Link
        href="/business/login?redirect=/jobs/dashboard/new"
        className="btn-press mt-6 block w-full border-[3px] py-3 text-xs text-center transition-colors"
        style={{ borderColor, color: accent }}
      >
        Post a Job
      </Link>
    </div>
  );
}
