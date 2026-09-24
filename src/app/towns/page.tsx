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
    <main className="min-h-screen bg-bg pb-16 font-pixel uppercase text-warm">
      <DiscoverHeader signedIn={!!viewer} startCreating={create === "1"} />

      <section className="relative h-[52vh] min-h-[320px] max-h-[620px] overflow-hidden border-y-[3px] border-border bg-bg-raised">
        {discover.featured && hero ? (
          <>
            <TownHero city={hero.city} cityDevs={hero.cityDevs} cityNorms={hero.cityNorms} />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-bg via-bg/60 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 mx-auto max-w-6xl px-4 pb-6">
              <p className="text-[10px] text-lime">&#9733; Town of the week</p>
              <h2 className="mt-1 text-3xl leading-tight text-cream normal-case sm:text-4xl">{discover.featured.name}</h2>
              <p className="mt-1 flex gap-3 text-[10px] text-muted">
                {discover.featured.verified && <span className="text-lime">&#10003; Verified</span>}
                <span>
                  {discover.featured.totalBuildings.toLocaleString("en-US")} building
                  {discover.featured.totalBuildings === 1 ? "" : "s"}
                </span>
              </p>
              <div className="mt-4 flex gap-2">
                <Link
                  href={`/town/${discover.featured.slug}`}
                  className="btn-press bg-lime px-4 py-2.5 text-[11px] tracking-widest text-bg"
                >
                  &#9654; Visit
                </Link>
                <HeroDrive slug={discover.featured.slug} />
              </div>
            </div>
          </>
        ) : (
          <EmptyHero />
        )}
      </section>

      <div className="mx-auto max-w-6xl px-4">
        {discover.yours.length > 0 && <Row id="yours" title="Your towns" cards={discover.yours} />}
        {ROWS.map((r) =>
          discover.rows[r.id].length > 0 ? (
            <Row
              key={r.id}
              id={r.id}
              title={r.title}
              cards={discover.rows[r.id]}
              action={r.id === "companies" ? { href: "/towns/verify", label: "Verify yours" } : undefined}
            />
          ) : null,
        )}
        {Object.values(discover.rows).every((r) => r.length === 0) && discover.yours.length === 0 && (
          <p className="mt-10 text-center text-[11px] text-muted normal-case">No towns yet. Be the first to start one.</p>
        )}
      </div>
    </main>
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
    <section id={`row-${id}`} className="mt-10 scroll-mt-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base text-cream">{title}</h2>
        {action && (
          <Link href={action.href} className="text-[10px] text-lime hover:text-cream">
            {action.label} &rarr;
          </Link>
        )}
      </div>
      <div className="-mx-4 mt-3 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-2">
        {cards.map((c) => (
          <TownCard key={c.slug} card={c} />
        ))}
      </div>
    </section>
  );
}

// No Town of the week yet: a flat pixel skyline and the one thing to do.
const SKYLINE = [38, 62, 46, 80, 54, 92, 58, 70, 44, 86, 50, 66, 40, 74, 56];

function EmptyHero() {
  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-4">
        <p className="text-[10px] text-lime">&#9733; Town of the week</p>
        <h2 className="mt-1 text-2xl leading-tight text-cream normal-case sm:text-3xl">Could be yours.</h2>
        <p className="mt-2 max-w-sm text-[10px] text-muted normal-case">
          The town with the most visitors each week takes this spot for the next seven days.
        </p>
        <Link href="/towns?create=1" className="btn-press mt-4 self-start bg-lime px-4 py-2.5 text-[11px] tracking-widest text-bg">
          + Create a town
        </Link>
      </div>
      <div className="flex h-2/5 items-end justify-center gap-1.5 px-4" aria-hidden>
        {SKYLINE.map((h, i) => (
          <div key={i} className="relative w-8 bg-border sm:w-12" style={{ height: `${h}%` }}>
            <div
              className="absolute inset-1.5 opacity-60"
              style={{
                backgroundImage: "linear-gradient(var(--color-lime) 50%, transparent 50%)",
                backgroundSize: "6px 10px",
                maskImage: "linear-gradient(90deg, #000 40%, transparent 40%)",
                WebkitMaskImage: "linear-gradient(90deg, #000 40%, transparent 40%)",
                maskSize: "10px 100%",
                WebkitMaskSize: "10px 100%",
              }}
            />
          </div>
        ))}
      </div>
      <div className="h-1 bg-border" />
    </div>
  );
}
