import type { Metadata } from "next";
import Link from "next/link";
import {
  XP_TIERS,
  XP_RANKS,
  xpForLevel,
  xpDeltaForLevel,
  DAILY_XP_CAP,
  type XpTier,
} from "@/lib/xp";

export const metadata: Metadata = {
  title: "Levels & XP - Git City",
  description:
    "How leveling works in Git City: all 25 levels, the 6 tiers, exactly how much XP each level needs, and every way to earn XP.",
  openGraph: {
    title: "Levels & XP - Git City",
    description:
      "All 25 levels, 6 tiers, the XP required for each, and every way to earn XP in Git City.",
  },
};

const ACCENT = "#c8e64a";

/* ─── number formatting ─── */
function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

/* ─── ways to earn XP ─── */
interface EarnSource {
  action: string;
  xp: string;
  note: string;
  capped: boolean;
}

const EARN_SOURCES: EarnSource[] = [
  {
    action: "Import your GitHub",
    xp: "varies",
    note: "One-time bonus from your contributions, stars, repos & PRs (log scale). Grows when your stats refresh.",
    capped: false,
  },
  { action: "Daily check-in", xp: "+10", note: "Once per day. Keep your streak alive.", capped: true },
  { action: "Complete your dailies", xp: "+25", note: "Finish the day's quests.", capped: true },
  { action: "Open a daily drop", xp: "+25", note: "Your free daily loot pull.", capped: false },
  { action: "Give kudos", xp: "+3", note: "Cheer on another developer.", capped: true },
  { action: "Receive kudos", xp: "+1", note: "When someone cheers you on.", capped: false },
  { action: "Visit a city", xp: "+2", note: "Explore another developer's building.", capped: true },
  { action: "Fly mini-game", xp: "+score × 0.1", note: "Earn XP based on your flight score.", capped: true },
  { action: "Win a raid", xp: "+50", note: "Beat another developer in PvP.", capped: false },
  { action: "Defend a raid", xp: "+30", note: "Awarded when you're raided, win or lose.", capped: false },
  { action: "Lose a raid", xp: "+15", note: "You still earn XP for trying.", capped: false },
  {
    action: "Unlock an achievement",
    xp: "+10 → +100",
    note: "Bronze +10, Silver +25, Gold +50, Diamond +100.",
    capped: false,
  },
  { action: "Add a portfolio project", xp: "+10", note: "Build out your developer profile.", capped: false },
  { action: "Complete a survey", xp: "varies", note: "Reward depends on the survey.", capped: false },
  { action: "Get hired", xp: "+500", note: "Land a job through Git City.", capped: false },
  { action: "Refer a hire", xp: "+1,000", note: "Someone you referred gets hired.", capped: false },
];

/* ─── page ─── */
export default function LevelsPage() {
  const maxLevel = XP_RANKS.length; // 25
  const topXp = xpForLevel(maxLevel);

  return (
    <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
      <div className="mx-auto max-w-2xl px-4 py-10">
        {/* Back link */}
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="text-xs text-muted transition-colors hover:text-cream"
          >
            &larr; Back to City
          </Link>
          <Link
            href="/leaderboard"
            className="text-xs text-muted transition-colors hover:text-cream"
          >
            Leaderboard &rarr;
          </Link>
        </div>

        {/* Hero */}
        <div className="mt-6 text-center">
          <h1 className="text-3xl text-cream md:text-4xl">
            Lev<span style={{ color: ACCENT }}>els</span>
          </h1>
          <p className="mt-3 text-xs text-muted normal-case">
            Every developer in Git City levels up. Here&apos;s exactly how it
            works —
            all {maxLevel} levels, {XP_TIERS.length} tiers, and every way to earn
            XP.
          </p>
        </div>

        {/* Quick stats */}
        <div className="mt-8 grid grid-cols-3 gap-2">
          <StatCard label="Levels" value={`${maxLevel}`} />
          <StatCard label="Tiers" value={`${XP_TIERS.length}`} />
          <StatCard label="XP to max" value={fmt(topXp)} />
        </div>

        {/* How it works */}
        <Section title="How leveling works">
          <div className="space-y-3 text-[11px] text-cream-dark normal-case leading-relaxed">
            <p>
              You earn{" "}
              <span style={{ color: ACCENT }}>XP</span> (experience points) by
              playing — committing code, completing dailies, raiding, giving
              kudos, and more. The more XP you bank, the higher your level.
            </p>
            <p>
              Each level needs a bit more XP than the last. The exact curve is{" "}
              <code className="text-warm">25 × level^2.2</code>, so early levels
              are quick and later ones are a real grind. Reaching the very top
              (Level {maxLevel}) takes{" "}
              <span style={{ color: ACCENT }}>{fmt(topXp)} XP</span> in total.
            </p>
            <p>
              Your level{" "}
              <span className="text-warm">never goes down</span> — once
              you&apos;ve earned it, it&apos;s yours. As you climb, you move
              through {XP_TIERS.length} tiers, each with its own color that shows
              on your building&apos;s border in the city.
            </p>
          </div>

          {/* Daily cap callout */}
          <div
            className="mt-4 border-2 p-3"
            style={{ borderColor: ACCENT, backgroundColor: "rgba(200, 230, 74, 0.06)" }}
          >
            <p className="text-[10px]" style={{ color: ACCENT }}>
              ⚡ Daily XP cap: {DAILY_XP_CAP}
            </p>
            <p className="mt-1 text-[10px] text-cream-dark normal-case leading-relaxed">
              Casual engagement (check-ins, dailies, kudos given, visits, fly
              game) is capped at {DAILY_XP_CAP} XP per day so it stays fair.
              Raids, achievements, GitHub imports and referrals are{" "}
              <span className="text-warm">not capped</span>.
            </p>
          </div>
        </Section>

        {/* Tiers */}
        <Section title={`The ${XP_TIERS.length} tiers`}>
          <div className="space-y-2">
            {XP_TIERS.map((tier) => (
              <TierRow key={tier.id} tier={tier} maxLevel={maxLevel} />
            ))}
          </div>
        </Section>

        {/* Full level table */}
        <Section title={`All ${maxLevel} levels`}>
          <div className="border-[3px] border-border bg-bg-card">
            {/* Header row */}
            <div className="grid grid-cols-[2.5rem_1fr_5rem_5rem] gap-2 border-b-2 border-border px-3 py-2 text-[9px] text-muted">
              <span>Lvl</span>
              <span>Title</span>
              <span className="text-right">Total XP</span>
              <span className="text-right">To next</span>
            </div>
            {XP_RANKS.map((rank) => {
              const isTierStart = rank.level === rank.tier.minLevel;
              const toNext =
                rank.level < maxLevel ? xpDeltaForLevel(rank.level) : null;
              return (
                <div
                  key={rank.level}
                  className="grid grid-cols-[2.5rem_1fr_5rem_5rem] items-center gap-2 border-b border-border/30 px-3 py-2 text-[10px] last:border-b-0"
                  style={
                    isTierStart
                      ? { borderTop: `2px solid ${rank.tier.color}33` }
                      : undefined
                  }
                >
                  <span
                    className="flex h-5 w-5 items-center justify-center text-[9px]"
                    style={{
                      color: rank.tier.color,
                      border: `1px solid ${rank.tier.color}55`,
                    }}
                  >
                    {rank.level}
                  </span>
                  <span className="min-w-0 truncate text-cream">
                    {rank.title}
                    {rank.level === maxLevel && (
                      <span className="ml-1" style={{ color: ACCENT }}>
                        ★
                      </span>
                    )}
                  </span>
                  <span className="text-right text-warm">
                    {fmt(xpForLevel(rank.level))}
                  </span>
                  <span className="text-right text-muted">
                    {toNext !== null ? `+${fmt(toNext)}` : "MAX"}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[9px] text-muted normal-case">
            &quot;Total XP&quot; is the lifetime XP needed to reach that level.
            &quot;To next&quot; is the extra XP from there to the level above.
          </p>
        </Section>

        {/* Ways to earn XP */}
        <Section title="Ways to earn XP">
          <div className="space-y-1">
            {EARN_SOURCES.map((s) => (
              <div
                key={s.action}
                className="flex items-start gap-3 border-b border-border/30 py-2.5 last:border-b-0"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-cream">{s.action}</span>
                    {s.capped && (
                      <span
                        className="border px-1 py-0.5 text-[7px] text-muted"
                        style={{ borderColor: "#2a2a30" }}
                        title="Counts toward the daily cap"
                      >
                        DAILY CAP
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-[9px] text-muted normal-case">
                    {s.note}
                  </span>
                </span>
                <span
                  className="shrink-0 text-[11px] tabular-nums"
                  style={{ color: ACCENT }}
                >
                  {s.xp}
                </span>
              </div>
            ))}
          </div>
        </Section>

        {/* CTA */}
        <div className="mt-12 text-center">
          <Link
            href="/"
            className="btn-press pixel-shadow-lime inline-block px-7 py-3.5 text-sm text-bg"
            style={{ backgroundColor: ACCENT }}
          >
            Start leveling up
          </Link>
          <p className="mt-6 text-[9px] text-muted normal-case">
            built by{" "}
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
        </div>
      </div>
    </main>
  );
}

/* ─── Stat card ─── */
function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-[3px] border-border bg-bg-card p-3 text-center">
      <div className="text-lg text-cream" style={{ color: ACCENT }}>
        {value}
      </div>
      <div className="mt-1 text-[9px] text-muted">{label}</div>
    </div>
  );
}

/* ─── Section wrapper ─── */
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="text-lg text-cream">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/* ─── Tier row ─── */
function TierRow({ tier, maxLevel }: { tier: XpTier; maxLevel: number }) {
  const cappedMax = Math.min(tier.maxLevel, maxLevel);
  const range =
    tier.minLevel === cappedMax
      ? `Lvl ${tier.minLevel}`
      : tier.maxLevel >= 999
        ? `Lvl ${tier.minLevel}+`
        : `Lvl ${tier.minLevel}–${cappedMax}`;
  const minXp = xpForLevel(tier.minLevel);

  return (
    <div className="flex items-center gap-3 border-[3px] border-border bg-bg-card p-3">
      <span
        className="h-8 w-8 shrink-0"
        style={{
          backgroundColor: tier.color,
          boxShadow: `0 0 10px ${tier.color}55`,
        }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-sm" style={{ color: tier.color }}>
            {tier.name}
          </span>
          <span className="text-[9px] text-muted">{range}</span>
        </div>
        <p className="mt-0.5 text-[9px] text-muted normal-case">
          Unlocks at {fmt(minXp)} XP · building border turns{" "}
          <span style={{ color: tier.color }}>this color</span>
        </p>
      </div>
    </div>
  );
}
