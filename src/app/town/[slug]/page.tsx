import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getInviteToken, getLeagueBySlug, getViewer } from "@/lib/leagues/service";
import { getCityNorms, getGlobalWinner, getLeagueCityDevs, getLeaguePageData } from "@/lib/leagues/queries";
import { isoDay, weekStart } from "@/lib/leagues/scoring";
import { getCachedCity } from "@/lib/league-city/service";
import { LOGIN_RE } from "@/lib/leagues/names";
import { tokenMatches } from "@/lib/leagues/invite-token";
import LeagueClient from "./league-client";
import { townDisplayName } from "@/lib/towns/names";
import { getTownBadges } from "@/lib/towns/badges";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ invite?: string; ref?: string; t?: string; edit?: string; drive?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const league = await getLeagueBySlug(slug);
  if (!league) return { title: "Town not found - Git City" };
  const title = `${townDisplayName(league.name)} - Git City`;
  const description = `${townDisplayName(league.name)} in Git City: a skyline built together, a weekly race and a crown for the winner.`;
  return {
    title,
    description,
    openGraph: { title, description },
    twitter: { card: "summary_large_image", title, description },
    ...(league.hidden ? { robots: { index: false, follow: false } } : {}),
  };
}

export default async function LeaguePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { invite, ref, t, edit, drive } = await searchParams;
  const league = await getLeagueBySlug(slug);
  if (!league) notFound();

  const viewer = await getViewer();
  const data = await getLeaguePageData(league, viewer);
  const lastWeek = weekStart(new Date());
  lastWeek.setUTCDate(lastWeek.getUTCDate() - 7);
  const [city, cityDevs, cityNorms, globalWinner, inviteToken, badges] = await Promise.all([
    getCachedCity(league.id),
    getLeagueCityDevs(data.members),
    getCityNorms(),
    league.kind === "company" ? getGlobalWinner(isoDay(lastWeek)) : Promise.resolve(null),
    t && league.kind === "custom" ? getInviteToken(league.id) : Promise.resolve(null),
    getTownBadges(league.id).catch(() => ({ townOfWeek: false, milestones: [] })),
  ]);

  // Query params are attacker-written: name only an invited member, pass on
  // only a token that works, and credit only a real login.
  const inviteLower = invite?.toLowerCase() ?? "";
  const invitee = LOGIN_RE.test(inviteLower)
    ? (data.members.find((m) => m.status === "invited" && m.login.toLowerCase() === inviteLower)?.login ?? null)
    : null;
  const token = t && tokenMatches(t, inviteToken) ? t : null;
  const refLogin = ref && LOGIN_RE.test(ref) ? ref.toLowerCase() : null;

  return (
    <LeagueClient
      data={data}
      city={city}
      cityDevs={cityDevs}
      cityNorms={cityNorms}
      topCompanyLastWeek={globalWinner?.slug === league.slug}
      invite={invitee}
      inviteToken={token}
      refLogin={refLogin}
      startEditing={edit === "1" && data.viewer?.is_admin === true}
      startDriving={drive === "1"}
      badges={badges}
    />
  );
}
