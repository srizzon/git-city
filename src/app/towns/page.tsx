import type { Metadata } from "next";
import Link from "next/link";
import { getViewer } from "@/lib/leagues/service";
import { getCityNorms, getLeagueCityDevs, getLeagueMembers } from "@/lib/leagues/queries";
import { getCachedCity } from "@/lib/league-city/service";
import { getDiscover, type FeaturedTown } from "@/lib/towns/discover";
import type { RowId, TownCard as Card } from "@/lib/towns/rows";
import DiscoverHeader from "@/components/towns/DiscoverHeader";
import TownCard from "@/components/towns/TownCard";
import TownHero from "@/components/towns/TownHero";
import HeroDrive from "./hero-drive";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Towns - Git City",
  description: "Towns are groups' own places in Git City: built together, visited and driven by anyone.",
  openGraph: {
    title: "Towns - Git City",
    description: "Towns are groups' own places in Git City: built together, visited and driven by anyone.",
  },
};

const ROWS: { id: RowId; title: string }[] = [
  { id: "trending", title: "🔥 Trending" },
  { id: "new", title: "✨ New towns" },
  { id: "updated", title: "🛠 Recently updated" },
  { id: "companies", title: "🏢 Companies" },
  { id: "biggest", title: "🏆 Biggest towns" },
];

export default async function TownsPage({ searchParams }: { searchParams: Promise<{ create?: string }> }) {
  const { create } = await searchParams;
  const viewer = await getViewer();
  const discover = await getDiscover(viewer);
  const hero = discover.featured ? await loadHero(discover.featured) : null;

  return (
    <main className="min-h-screen bg-bg pb-24 font-pixel uppercase text-warm">
      <DiscoverHeader signedIn={!!viewer} startCreating={create === "1"} />

      {discover.featured && hero ? <Hero featured={discover.featured} hero={hero} /> : <NoTowns />}

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {discover.yours.length > 0 && <Row id="yours" title="Your towns" cards={discover.yours} />}
        {ROWS.map((r) =>
          discover.rows[r.id].length > 0 ? (
            <Row
              key={r.id}
              id={r.id}
              title={r.title}
              cards={discover.rows[r.id]}
              action={r.id === "companies" ? { href: "/towns/verify", label: "Verify your company" } : undefined}
            />
          ) : null,
        )}
      </div>
    </main>
  );
}

const REASON_LABEL: Record<FeaturedTown["reason"], string> = {
  week: "★ Town of the week",
  staff: "★ Staff pick",
  biggest: "🏆 Biggest town",
};

function Hero({ featured, hero }: { featured: FeaturedTown; hero: NonNullable<Awaited<ReturnType<typeof loadHero>>> }) {
  return (
    <section className="relative h-[62vh] min-h-[440px] max-h-[680px] overflow-hidden border-y-[3px] border-border bg-bg-raised">
      <TownHero city={hero.city} cityDevs={hero.cityDevs} cityNorms={hero.cityNorms} />
      {/* Legibility: dark from the bottom-left corner, where the copy sits. */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-bg via-bg/40 to-transparent" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-bg/80 via-transparent to-transparent" />
      <div className="absolute inset-x-0 bottom-0 mx-auto max-w-6xl px-4 pb-10 sm:px-6">
        <p className="text-xs tracking-widest text-lime">{REASON_LABEL[featured.reason]}</p>
        <h2 className="mt-3 max-w-3xl text-4xl leading-tight text-cream normal-case sm:text-6xl">{featured.name}</h2>
        <p className="mt-3 flex gap-4 text-sm text-muted">
          {featured.verified && <span className="text-lime">&#10003; Verified</span>}
          <span>
            {featured.totalBuildings.toLocaleString("en-US")} building{featured.totalBuildings === 1 ? "" : "s"}
          </span>
        </p>
        <div className="mt-6 flex gap-3">
          <Link href={`/town/${featured.slug}`} className="btn-press bg-lime px-6 py-3 text-sm tracking-widest text-bg">
            &#9654; Visit
          </Link>
          <HeroDrive slug={featured.slug} />
        </div>
      </div>
    </section>
  );
}

// Nothing built anywhere yet: one line and the one thing to do.
function NoTowns() {
  return (
    <section className="border-y-[3px] border-border bg-bg-raised">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-2xl text-cream sm:text-3xl">No towns yet</h2>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-muted normal-case">
          Start one for your team or friends. The town with the most visitors each week gets this spot.
        </p>
        <Link href="/towns?create=1" className="btn-press mt-6 inline-block bg-lime px-6 py-3 text-sm tracking-widest text-bg">
          + Create a town
        </Link>
      </div>
    </section>
  );
}

async function loadHero(featured: FeaturedTown) {
  try {
    const [city, members, cityNorms] = await Promise.all([
      getCachedCity(featured.id),
      getLeagueMembers(featured.id),
      getCityNorms(),
    ]);
    return { city, cityDevs: await getLeagueCityDevs(members), cityNorms };
  } catch (err) {
    console.error("[towns] hero failed:", err);
    return null;
  }
}

function Row({
  id,
  title,
  cards,
  action,
}: {
  id: string;
  title: string;
  cards: Card[];
  action?: { href: string; label: string };
}) {
  return (
    <section id={`row-${id}`} className="mt-14 scroll-mt-6">
      <div className="mb-5 flex items-end justify-between gap-4">
        <h2 className="text-xl text-cream sm:text-2xl">{title}</h2>
        {action && (
          <Link href={action.href} className="shrink-0 text-xs text-lime transition-colors hover:text-cream">
            {action.label} &rarr;
          </Link>
        )}
      </div>
      <div className="-mx-4 flex snap-x scroll-px-4 gap-4 overflow-x-auto px-4 pb-3 sm:-mx-6 sm:scroll-px-6 sm:px-6">
        {cards.map((c) => (
          <TownCard key={c.slug} card={c} />
        ))}
      </div>
    </section>
  );
}
