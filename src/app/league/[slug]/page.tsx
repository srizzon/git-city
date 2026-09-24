import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLeagueBySlug, getViewer } from "@/lib/leagues/service";
import { getCityNorms, getGlobalWinner, getLeagueCityDevs, getLeaguePageData } from "@/lib/leagues/queries";
import { isoDay, weekStart } from "@/lib/leagues/scoring";
import LeagueClient from "./league-client";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ invite?: string; ref?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const league = await getLeagueBySlug(slug);
  if (!league) return { title: "League not found - Git City" };
  const title = `${league.name} league - Git City`;
  const description = `${league.name}'s skyline in Git City: a weekly race, a hall of fame and a crown for the winner.`;
  return { title, description, openGraph: { title, description }, twitter: { card: "summary_large_image", title, description } };
}

export default async function LeaguePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { invite, ref } = await searchParams;
  const league = await getLeagueBySlug(slug);
  if (!league) notFound();

  const viewer = await getViewer();
  const data = await getLeaguePageData(league, viewer);
  const lastWeek = weekStart(new Date());
  lastWeek.setUTCDate(lastWeek.getUTCDate() - 7);
  const [cityDevs, cityNorms, globalWinner] = await Promise.all([
    getLeagueCityDevs(data.members),
    getCityNorms(),
    league.kind === "company" ? getGlobalWinner(isoDay(lastWeek)) : Promise.resolve(null),
  ]);

  return (
    <LeagueClient
      data={data}
      cityDevs={cityDevs}
      cityNorms={cityNorms}
      topCompanyLastWeek={globalWinner?.slug === league.slug}
      invite={invite?.toLowerCase() ?? null}
      refLogin={ref?.toLowerCase() ?? null}
    />
  );
}
