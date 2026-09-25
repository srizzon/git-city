import { sendNotification } from "../notifications";
import { EMAIL_BASE_URL, button, heading, paragraph, statTiles, trackedUrl } from "../email/components";
import { renderLayout, renderText, type EmailLinks } from "../email/layout";
import { formatLap } from "../league-city/race/laps";
import { townDisplayName } from "../towns/names";

// The race track's two provocations, after the raid loop: someone took your
// spot on the town's lap board, or someone challenged you with their lap.
// Both link to the track with their ghost loaded, so the answer is one click.

export interface RacePassedEmailData {
  leagueSlug: string;
  leagueName: string;
  passerLogin: string;
  /** Their new best and yours (ms). */
  theirMs: number;
  yourMs: number;
  /** Your place on the board now. */
  newRank: number;
}

export interface RaceChallengeEmailData {
  leagueSlug: string;
  leagueName: string;
  challengerLogin: string;
  /** Their best lap (ms), and yours or null if you haven't set one. */
  theirMs: number;
  yourMs: number | null;
}

const gap = (ms: number) => `${(ms / 1000).toFixed(3)}s`;
const raceUrl = (slug: string, ghost: string, campaign: string) =>
  trackedUrl(`/town/${slug}/race?ghost=${encodeURIComponent(ghost)}`, campaign);

function passedHeader(d: RacePassedEmailData) {
  const town = townDisplayName(d.leagueName);
  return {
    town,
    subject: `@${d.passerLogin} took your spot on the ${town} track`,
    preheader: `${formatLap(d.theirMs)}, ${gap(d.yourMs - d.theirMs)} faster than you. You're #${d.newRank} now.`,
  };
}

export function renderRacePassedEmail(d: RacePassedEmailData, links: EmailLinks) {
  const { town, subject, preheader } = passedHeader(d);
  const url = raceUrl(d.leagueSlug, d.passerLogin, "race_passed");
  const intro = `They beat your best lap on the ${town} race track. Their ghost is waiting on the grid.`;
  const tiles = [
    { value: formatLap(d.theirMs), label: `@${d.passerLogin}` },
    { value: formatLap(d.yourMs), label: "Your best" },
    { value: `#${d.newRank}`, label: "Your place" },
  ];
  const reason = `You're getting this because you set a lap on the ${town} race track in Git City.`;
  const html = renderLayout({
    title: subject,
    preheader,
    body: [
      heading("", `@${d.passerLogin}`, " took your spot"),
      paragraph(intro),
      statTiles(tiles),
      button("Race their ghost", url),
    ].join("\n"),
    reason,
    links,
  });
  const text = renderText({
    lines: [subject, "", intro, "", ...tiles.map((t) => `${t.label}: ${t.value}`), "", `Race their ghost: ${url}`],
    reason,
    links,
  });
  return { subject, preheader, html, text };
}

function challengeHeader(d: RaceChallengeEmailData) {
  const town = townDisplayName(d.leagueName);
  return {
    town,
    subject: `@${d.challengerLogin} challenged you on the ${town} track`,
    preheader:
      d.yourMs === null
        ? `Their lap: ${formatLap(d.theirMs)}. You haven't set one yet.`
        : `Their lap: ${formatLap(d.theirMs)}. Yours: ${formatLap(d.yourMs)}.`,
  };
}

export function renderRaceChallengeEmail(d: RaceChallengeEmailData, links: EmailLinks) {
  const { town, subject, preheader } = challengeHeader(d);
  const url = raceUrl(d.leagueSlug, d.challengerLogin, "race_challenge");
  const intro = `They sent you their best lap on the ${town} race track. Beat their ghost.`;
  const tiles = [
    { value: formatLap(d.theirMs), label: `@${d.challengerLogin}` },
    { value: d.yourMs === null ? "No lap yet" : formatLap(d.yourMs), label: "Your best" },
  ];
  const reason = `You're getting this because you're a member of ${town} in Git City.`;
  const html = renderLayout({
    title: subject,
    preheader,
    body: [
      heading("", `@${d.challengerLogin}`, " challenged you"),
      paragraph(intro),
      statTiles(tiles),
      button("Take the challenge", url),
    ].join("\n"),
    reason,
    links,
  });
  const text = renderText({
    lines: [subject, "", intro, "", ...tiles.map((t) => `${t.label}: ${t.value}`), "", `Take the challenge: ${url}`],
    reason,
    links,
  });
  return { subject, preheader, html, text };
}

/** "@x took your spot" (email + in-app). One per dev per town per UTC day. */
export async function sendRacePassedNotification(opts: RacePassedEmailData & { developerId: number }) {
  const { developerId, ...data } = opts;
  const { subject, preheader } = passedHeader(data);
  const day = new Date().toISOString().slice(0, 10);
  return sendNotification({
    type: "race_passed",
    category: "leagues",
    developerId,
    dedupKey: `race_passed:${developerId}:${data.leagueSlug}:${day}`,
    title: subject,
    body: preheader,
    render: (links) => renderRacePassedEmail(data, links),
    actionUrl: `${EMAIL_BASE_URL}/town/${data.leagueSlug}/race?ghost=${encodeURIComponent(data.passerLogin)}`,
    priority: "normal",
    channels: ["email", "in_app"],
  });
}

/** "@x challenged you" (email + in-app). One per pair per UTC day. */
export async function sendRaceChallengeNotification(opts: RaceChallengeEmailData & { developerId: number; fromId: number }) {
  const { developerId, fromId, ...data } = opts;
  const { subject, preheader } = challengeHeader(data);
  const day = new Date().toISOString().slice(0, 10);
  return sendNotification({
    type: "race_challenge",
    category: "leagues",
    developerId,
    dedupKey: `race_challenge:${fromId}:${developerId}:${day}`,
    title: subject,
    body: preheader,
    render: (links) => renderRaceChallengeEmail(data, links),
    actionUrl: `${EMAIL_BASE_URL}/town/${data.leagueSlug}/race?ghost=${encodeURIComponent(data.challengerLogin)}`,
    priority: "high",
    channels: ["email", "in_app"],
  });
}
