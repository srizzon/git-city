import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/leagues/service";
import { getCityNorms, getLeagueCityDevs, getLeagueMembers } from "@/lib/leagues/queries";
import { getCachedCity } from "@/lib/league-city/service";
import { getDiscover, type FeaturedTown } from "@/lib/towns/discover";
import DiscoverHeader from "@/components/towns/DiscoverHeader";
import TownHero from "@/components/towns/TownHero";
import TownGrid from "@/components/towns/TownGrid";
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

export default async function TownsPage({ searchParams }: { searchParams: Promise<{ create?: string }> }) {
  const { create } = await searchParams;
  // Old "create" links (emails, sign-in returns) open the new town screen.
  if (create === "1") redirect("/towns/new");
  const viewer = await getViewer();
  const discover = await getDiscover(viewer);
  const hero = discover.featured ? await loadHero(discover.featured) : null;

  return (
    <main className="min-h-screen bg-bg pb-24 font-pixel uppercase text-warm">
      <DiscoverHeader />

      {discover.featured && hero ? <Hero featured={discover.featured} hero={hero} /> : <NoTowns />}

      <div className="mx-auto max-w-6xl px-4 sm:px-6">{discover.all.length > 0 && <TownGrid towns={discover.all} />}</div>
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
    <section className="relative h-[38vh] min-h-[280px] max-h-[380px] overflow-hidden border-y-[3px] border-border bg-bg-raised">
      <TownHero city={hero.city} cityDevs={hero.cityDevs} cityNorms={hero.cityNorms} name={featured.name} />
      {/* Legibility: dark from the bottom-left corner, where the copy sits. */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-bg via-bg/40 to-transparent" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-bg/80 via-transparent to-transparent" />
      <div className="absolute inset-x-0 bottom-0 mx-auto max-w-6xl px-4 pb-6 sm:px-6">
        <p className="text-xs tracking-widest text-lime">{REASON_LABEL[featured.reason]}</p>
        <h2 className="mt-2 max-w-3xl text-3xl leading-tight text-cream normal-case sm:text-4xl">{featured.name}</h2>
        <p className="mt-3 flex gap-4 text-sm text-muted">
          {featured.verified && <span className="text-lime">&#10003; Verified</span>}
          <span>
            {featured.totalBuildings.toLocaleString("en-US")} building{featured.totalBuildings === 1 ? "" : "s"}
          </span>
        </p>
        <div className="mt-4 flex gap-3">
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
        <Link href="/towns/new" className="btn-press mt-6 inline-block bg-lime px-6 py-3 text-sm tracking-widest text-bg">
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
