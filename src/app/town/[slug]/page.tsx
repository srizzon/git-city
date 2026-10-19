import type { Metadata } from "next";
import { STATES } from "@/lib/towns/brasil-map";
import { cityBySlug, citySlug } from "@/lib/towns/br-cities";
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
import { getCityDevsByIds, getCityNorms, getLeagueCityDevs, getLeaguePageData, getTownRanking, townPlace } from "@/lib/leagues/queries";
import { getBrasilLayout, getBrasilWeek } from "@/lib/towns/brasil-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getElection } from "@/lib/towns/brasil-election-server";
import { PRESIDENCY_ON } from "@/lib/towns/brasil-election";
import BrasilTownLoader from "./brasil/loader";
import { getCachedCity } from "@/lib/league-city/service";
import { LOGIN_RE } from "@/lib/leagues/names";
import { tokenMatches } from "@/lib/leagues/invite-token";
import LeagueClient from "./league-client";
import { townDisplayName } from "@/lib/towns/names";
import { getTownBadges } from "@/lib/towns/badges";
import { isCoverDue } from "@/lib/towns/cover";
import { isAdminGithubLogin } from "@/lib/admin";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ invite?: string; ref?: string; t?: string; edit?: string; drive?: string; at?: string; join?: string; new?: string; uf?: string; cidade?: string; pick?: string; vote?: string; run?: string }>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const league = await getLeagueBySlug(slug);
  if (!league) return { title: "Town not found - Git City" };
  // The Brasil map: its own card, naming the dev (?at=), the city (?cidade=) or the state (?uf=) the link points at.
  if (league.map === "brasil") {
    const { at, uf, cidade, vote, run } = await searchParams;
    const city = typeof cidade === "string" ? cityBySlug(cidade) : undefined;
    const voted = PRESIDENCY_ON && typeof vote === "string" && /^\d{2}$/.test(vote) ? vote : null;
    const running = PRESIDENCY_ON && typeof run === "string" && /^\d{2}$/.test(run) ? run : null;
    const q = running ? `?run=${running}` : voted ? `?vote=${voted}` : at ? `?at=${encodeURIComponent(at)}` : city ? `?cidade=${citySlug(city)}` : uf ? `?uf=${encodeURIComponent(uf)}` : "";
    // Portuguese: the link travels between Brazilians (WhatsApp, stories), and the preview speaks to them.
    const st = uf ? STATES.find((s) => s.uf === uf.toUpperCase()) : undefined;
    const title = running ? `Vote ${running} pra presidente do Brasil dos devs · Git City` : voted ? `Votei ${voted} pra presidente do Brasil dos devs · Git City` : at ? `@${at} tá no mapa dos devs · Git City` : city ? `${city.name} no mapa dos devs · Git City` : st ? `${st.name} no mapa dos devs · Git City` : "Mapa dos devs do Brasil · Git City";
    const description = voted || running ? "Digita o número na urna do mapa e vota também." : "Cada dev vira um prédio na sua cidade. Onde você tá?";
    const image = { url: `/town/${league.slug}/brasil-og${q}`, width: 1200, height: 630, alt: "The Brasil map in Git City" };
    return { title, description, openGraph: { title, description, images: [image] }, twitter: { card: "summary_large_image", title, description, images: [image] } };
  }
  const title = `${townDisplayName(league.name)} - Git City`;
  const description = `${townDisplayName(league.name)} in Git City: a skyline built together and a weekly race for the center of Git City.`;
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
  const { invite, ref, t, edit, drive, at, join } = query;
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

  // The Brasil town is drawn as the map of Brazil: its own page.
  if (league.map === "brasil") {
    const { layout, residents } = await getBrasilLayout(league.id);
    const [cityDevs, cityNorms, week, election] = await Promise.all([
      getCityDevsByIds(residents.map((r) => r.dev.id)),
      getCityNorms(),
      getBrasilWeek(league.id),
      PRESIDENCY_ON ? getElection(league.id, viewer) : Promise.resolve(null),
    ]);
    const home = viewer ? residents.find((r) => r.dev.id === viewer.id) : undefined;
    // Whether they named their city or only a state (then the map asks them once).
    const picked = home
      ? ((await getSupabaseAdmin().from("brasil_residents").select("city_picked").eq("league_id", league.id).eq("developer_id", home.dev.id).maybeSingle<{ city_picked: boolean }>()).data?.city_picked ?? false)
      : false;
    const uf = typeof query.uf === "string" && /^[A-Za-z]{2}$/.test(query.uf) ? query.uf.toUpperCase() : null;
    const cidade = typeof query.cidade === "string" && /^[a-z0-9-]{3,80}$/.test(query.cidade) ? query.cidade : null;
    const atLogin = typeof at === "string" && LOGIN_RE.test(at.toLowerCase()) ? at.toLowerCase() : null;
    return (
      <BrasilTownLoader
        league={{ slug: league.slug, name: league.name }}
        layout={layout}
        cityDevs={cityDevs}
        cityNorms={cityNorms}
        viewerLogin={viewer?.github_login ?? null}
        home={home ? { city: home.city, picked } : null}
        startAt={atLogin ? { login: atLogin } : cidade ? { city: cidade } : uf ? { uf } : null}
        startPick={query.pick === "1"}
        startVote={PRESIDENCY_ON ? [query.run, query.vote].map((v) => (typeof v === "string" && /^\d{2}$/.test(v) ? Number(v) : null)).find((v) => v !== null) ?? null : null}
        week={week}
        election={election}
      />
    );
  }

  const data = await getLeaguePageData(league, viewer);
  const coding = data.week.standings.filter((s) => s.total > 0).length;
  const [city, cityDevs, cityNorms, inviteToken, badges, ranking, raceRecord] = await Promise.all([
    getCachedCity(league.id),
    getLeagueCityDevs(data.members),
    getCityNorms(),
    t && league.kind === "custom" ? getInviteToken(league.id) : Promise.resolve(null),
    getTownBadges(league.id).catch(() => ({ townOfWeek: false, milestones: [] })),
    // This week's town race (cached ranking), for the widget, the panel and the intro.
    league.hidden ? Promise.resolve(null) : getTownRanking().catch(() => null),
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
    // Members' pages (and the site admin's) photograph the city for its Discover card when it's due.
    isMember || (viewer && isAdminGithubLogin(viewer.github_login)) ? isCoverDue(league.id) : Promise.resolve(false),
  ]);

  return (
    <LeagueClient
      data={data}
      city={city}
      cityDevs={cityDevs}
      cityNorms={cityNorms}
      raceRecord={raceRecord}
      invite={invitee}
      inviteToken={token}
      refLogin={refLogin}
      startEditing={edit === "1" && data.viewer?.can_edit === true}
      startDriving={drive === "1"}
      spawnAt={drive === "1" && typeof at === "string" && /^[a-z0-9_-]{1,39}$/i.test(at) ? at.toLowerCase() : null}
      startJoin={join === "1"}
      startQuest={justCreated && data.viewer?.is_admin === true}
      joinAction={joinAction}
      pendingRequests={pendingRequests}
      groupLink={groupLink}
      badges={badges}
      place={ranking ? townPlace(ranking, league.id, coding) : null}
      ranking={ranking?.rows ?? []}
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
