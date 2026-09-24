import type { Metadata } from "next";
import Link from "next/link";
import { getViewer } from "@/lib/leagues/service";
import { getDevLeagues, getGlobalRanking } from "@/lib/leagues/queries";
import CreateLeague from "./create-league";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Leagues - Git City",
  description: "Company leagues ranked by weekly score per active developer. Start a league with your team.",
  openGraph: {
    title: "Leagues - Git City",
    description: "Company leagues ranked by weekly score per active developer.",
  },
};

function fmt(n: number) {
  return n.toLocaleString("en-US");
}

export default async function LeaguesPage() {
  const [ranking, viewer] = await Promise.all([getGlobalRanking(), getViewer()]);
  const mine = viewer ? await getDevLeagues(viewer.id) : [];
  const ranked = ranking.rows.filter((r) => r.rank !== null);
  const unranked = ranking.rows.filter((r) => r.rank === null);

  return (
    <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Link href="/" className="text-xs text-muted transition-colors hover:text-cream">
          &larr; Back to City
        </Link>

        <div className="mt-6 text-center">
          <h1 className="text-3xl text-cream md:text-4xl">
            Lea<span className="text-lime">gues</span>
          </h1>
          <p className="mt-3 text-xs text-muted normal-case">
            Your company&apos;s skyline, a weekly race and a crown for the winner. Companies rank by average score per
            active dev.
          </p>
        </div>

        {ranking.last_week_winner && (
          <Link
            href={`/league/${ranking.last_week_winner.slug}`}
            className="mt-8 flex items-center justify-between border-[3px] border-lime bg-bg-card px-4 py-3"
          >
            <span className="text-[10px] text-lime">Last week&apos;s top company</span>
            <span className="text-sm text-cream normal-case">{ranking.last_week_winner.name}</span>
          </Link>
        )}

        <div className="mt-8 grid gap-2 sm:grid-cols-2">
          <CreateLeague signedIn={!!viewer} />
          <Link
            href="/leagues/verify"
            className="btn-press flex items-center justify-center border-2 border-border px-4 py-3 text-[11px] text-cream hover:border-lime"
          >
            Verify your company
          </Link>
        </div>

        {mine.length > 0 && (
          <section className="mt-10">
            <h2 className="text-lg text-cream">Your leagues</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {mine.map((l) => (
                <Link
                  key={l.slug}
                  href={`/league/${l.slug}`}
                  className="border-2 border-border px-3 py-2 text-[11px] text-cream normal-case hover:border-lime"
                >
                  {l.name}
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="mt-10">
          <h2 className="text-lg text-cream">This week</h2>
          <ol className="mt-3 space-y-1.5">
            {ranked.map((r) => (
              <li key={r.league_id}>
                <Link
                  href={`/league/${r.slug}`}
                  className="flex items-center gap-3 border-[3px] border-border bg-bg-card px-3 py-2 hover:border-border-light"
                >
                  <span className={`w-6 text-right text-xs ${r.rank === 1 ? "text-lime" : "text-muted"}`}>{r.rank}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-cream normal-case">{r.name}</span>
                  <span className="text-[9px] text-muted">{fmt(r.active_members)} devs</span>
                  <span className="w-14 text-right text-xs text-cream tabular-nums">{fmt(r.score ?? 0)}</span>
                </Link>
              </li>
            ))}
            {ranked.length === 0 && (
              <li className="text-[11px] text-muted normal-case">
                No company has 3 active devs yet. Verify yours and invite two colleagues.
              </li>
            )}
          </ol>

          {unranked.length > 0 && (
            <div className="mt-6">
              <h3 className="text-[10px] text-muted">Need 3 active devs to rank</h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {unranked.map((r) => (
                  <Link
                    key={r.league_id}
                    href={`/league/${r.slug}`}
                    className="border-2 border-border px-2 py-1 text-[10px] text-dim normal-case hover:text-cream"
                  >
                    {r.name} · {r.active_members}/3
                  </Link>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
