import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { currentSlugFor, getLeagueBySlug, getViewer } from "@/lib/leagues/service";
import { getCachedCity } from "@/lib/league-city/service";
import { getLapBoard } from "@/lib/league-city/race/board";
import { TRACK_ID } from "@/lib/league-city/race/track";
import { townDisplayName } from "@/lib/towns/names";
import RaceClient from "./race-client";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const league = await getLeagueBySlug(slug);
  if (!league) return { title: "Town not found - Git City" };
  const name = townDisplayName(league.name);
  return {
    title: `${name} race track - Git City`,
    description: `Race the ${name} track in Git City: laps timed by the server, the town's best laps on the board.`,
    ...(league.hidden ? { robots: { index: false, follow: false } } : {}),
  };
}

export default async function RacePage({ params }: Props) {
  const { slug } = await params;
  const league = await getLeagueBySlug(slug);
  if (!league) {
    const moved = await currentSlugFor(slug);
    if (!moved) notFound();
    permanentRedirect(`/town/${moved}/race`);
  }
  const [viewer, city, board] = await Promise.all([
    getViewer(),
    getCachedCity(league.id).catch(() => null),
    getLapBoard(league.id, TRACK_ID),
  ]);
  return (
    <RaceClient
      slug={league.slug}
      townName={townDisplayName(league.name)}
      sky={city?.identity.sky ?? 1}
      viewerLogin={viewer?.github_login ?? null}
      board={board}
    />
  );
}
