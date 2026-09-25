import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { currentSlugFor, getLeagueBySlug, getViewer } from "@/lib/leagues/service";
import { getGhostLogins, getLapBoard, getLastWeekWinner, getWeekBoard } from "@/lib/league-city/race/board";
import { getLeagueMembers } from "@/lib/leagues/queries";
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
  const [viewer, board, week, lastWinner, ghosts, members] = await Promise.all([
    getViewer(),
    getLapBoard(league.id, TRACK_ID),
    getWeekBoard(league.id, TRACK_ID),
    getLastWeekWinner(league.id, TRACK_ID),
    getGhostLogins(league.id, TRACK_ID),
    getLeagueMembers(league.id),
  ]);
  return (
    <RaceClient
      slug={league.slug}
      townName={townDisplayName(league.name)}
      viewerLogin={viewer?.github_login ?? null}
      board={board}
      week={week}
      lastWinner={lastWinner}
      ghosts={ghosts}
      members={members
        .filter((m) => m.status === "active")
        .map((m) => ({ login: m.login, avatar_url: m.avatar_url }))
        .slice(0, 200)}
    />
  );
}
