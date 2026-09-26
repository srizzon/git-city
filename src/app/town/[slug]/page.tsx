import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { headers } from "next/headers";
import {
  countJoinRequests,
  currentSlugFor,
  getInviteToken,
  getJoinAction,
  getLeagueBySlug,
  getOrCreateInviteToken,
  getViewer,
  openInviteLink,
  type League,
  type Viewer,
} from "@/lib/leagues/service";
import { getLapBoard } from "@/lib/league-city/race/board";
import { TRACK_ID } from "@/lib/league-city/race/track";
import { getCityNorms, getGlobalRanking, getGlobalWinner, getLeagueCityDevs, getLeaguePageData } from "@/lib/leagues/queries";
import { isoDay, weekStart } from "@/lib/leagues/scoring";
import { getCachedCity } from "@/lib/league-city/service";
import { LOGIN_RE } from "@/lib/leagues/names";
import { tokenMatches } from "@/lib/leagues/invite-token";
import LeagueClient from "./league-client";
import { townDisplayName } from "@/lib/towns/names";
import { getTownBadges } from "@/lib/towns/badges";
import { isCoverDue } from "@/lib/towns/cover";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ invite?: string; ref?: string; t?: string; edit?: string; drive?: string; join?: string; new?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const league = await getLeagueBySlug(slug);
  if (!league) return { title: "Town not found - Git City" };
  const title = `${townDisplayName(league.name)} - Git City`;
  const description = `${townDisplayName(league.name)} in Git City: a skyline built together, a weekly race and a crown for the winner.`;
  // The card's URL carries identity_version: a new logo or sky is a new URL.
  const city = await getCachedCity(league.id).catch(() => null);
  const image = { url: `/town/${league.slug}/og?v=${city?.identity.identityVersion ?? 0}`, width: 1200, height: 630, alt: "Town in Git City" };
  return {
    title,
    description,
    openGraph: { title, description, images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
    ...(league.hidden ? { robots: { index: false, follow: false } } : {}),
  };
}

export default async function LeaguePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const query = await searchParams;
  const { invite, ref, t, edit, drive, join } = query;
  const justCreated = query.new === "1";
  const league = await getLeagueBySlug(slug);
  if (!league) {
    // A renamed town: send old links (invites included) to its new address.
    const moved = await currentSlugFor(slug);
    if (!moved) notFound();
    const qs = new URLSearchParams(
      Object.entries(query).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])),
    ).toString();
    permanentRedirect(`/town/${moved}${qs ? `?${qs}` : ""}`);
  }

  const viewer = await getViewer();
  const data = await getLeaguePageData(league, viewer);
  const lastWeek = weekStart(new Date());
  lastWeek.setUTCDate(lastWeek.getUTCDate() - 7);
  const [city, cityDevs, cityNorms, globalWinner, inviteToken, badges, weeklyRank, raceRecord] = await Promise.all([
    getCachedCity(league.id),
    getLeagueCityDevs(data.members),
    getCityNorms(),
    league.kind === "company" ? getGlobalWinner(isoDay(lastWeek)) : Promise.resolve(null),
    t && league.kind === "custom" ? getInviteToken(league.id) : Promise.resolve(null),
    getTownBadges(league.id).catch(() => ({ townOfWeek: false, milestones: [] })),
    // The intro's title: this week's place among companies (cached ranking).
    league.kind === "company"
      ? getGlobalRanking()
          .then((r) => r.rows.find((row) => row.league_id === league.id)?.rank ?? null)
          .catch(() => null)
      : Promise.resolve(null),
    // The race gate's plate: the track record.
    getLapBoard(league.id, TRACK_ID, 1)
      .then((rows) => (rows[0] ? { login: rows[0].login, best_ms: rows[0].best_ms } : null))
      .catch(() => null),
  ]);

  // Query params are attacker-written: name only an invited member, pass on
  // only a token that works, and credit only a real login.
  const inviteLower = invite?.toLowerCase() ?? "";
  const invitee = LOGIN_RE.test(inviteLower)
    ? (data.members.find((m) => m.status === "invited" && m.login.toLowerCase() === inviteLower)?.login ?? null)
    : null;
  const token = t && tokenMatches(t, inviteToken) ? t : null;
  const refLogin = ref && LOGIN_RE.test(ref) ? ref.toLowerCase() : null;

  const isAdmin = data.viewer?.is_admin === true;
  const isMember = data.viewer?.status === "active";
  const [joinAction, pendingRequests, groupLink, coverDue] = await Promise.all([
    getJoinAction(league, viewer, !!token),
    isAdmin && league.kind === "custom" ? countJoinRequests(league.id).catch(() => 0) : Promise.resolve(0),
    viewer && isMember ? groupInviteLink(league, viewer, isAdmin) : Promise.resolve(null),
    // Members' pages photograph the city for its Discover card when it's due.
    isMember ? isCoverDue(league.id) : Promise.resolve(false),
  ]);

  return (
    <LeagueClient
      data={data}
      city={city}
      cityDevs={cityDevs}
      cityNorms={cityNorms}
      topCompanyLastWeek={globalWinner?.slug === league.slug}
      raceRecord={raceRecord}
      invite={invitee}
      inviteToken={token}
      refLogin={refLogin}
      startEditing={edit === "1" && data.viewer?.is_admin === true}
      startDriving={drive === "1"}
      startJoin={join === "1"}
      startQuest={justCreated && data.viewer?.is_admin === true}
      joinAction={joinAction}
      pendingRequests={pendingRequests}
      groupLink={groupLink}
      badges={badges}
      weeklyRank={weeklyRank}
      coverDue={coverDue}
    />
  );
}

/**
 * The link a member drops in a group chat. The admin's carries the town's
 * invite token (anyone who opens it joins); everyone else's is the town with
 * their ref, so newcomers join or ask by the town's setting.
 */
async function groupInviteLink(league: League, viewer: Viewer, isAdmin: boolean): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const origin = (
    process.env.PORTLESS_URL ?? (host ? `${h.get("x-forwarded-proto") ?? "https"}://${host}` : "https://thegitcity.com")
  ).replace(/\/$/, "");
  if (isAdmin && league.kind === "custom") {
    return openInviteLink(league.slug, viewer.github_login, await getOrCreateInviteToken(viewer, league), origin);
  }
  return `${origin}/town/${league.slug}?ref=${encodeURIComponent(viewer.github_login)}`;
}
