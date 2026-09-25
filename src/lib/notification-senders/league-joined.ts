import { sendNotificationAsync } from "../notifications";
import { EMAIL_BASE_URL, button, heading, paragraph, trackedUrl } from "../email/components";
import { renderLayout, renderText, type EmailLinks } from "../email/layout";
import { townDisplayName } from "../towns/names";
import { townHero } from "./town-email";

export interface LeagueJoinedEmailData {
  inviteeLogin: string;
  leagueSlug: string;
  leagueName: string;
  /** The invite counted toward the inviter's Town Builder emblem (invitee's GitHub account is 30+ days old). */
  countsForBuilder: boolean;
}

function leagueJoinedHeader(d: LeagueJoinedEmailData) {
  const town = townDisplayName(d.leagueName);
  return {
    town,
    subject: `@${d.inviteeLogin} joined ${town}`,
    preheader: "They took your invite. Their building now races with the town every week.",
  };
}

export function renderLeagueJoinedEmail(d: LeagueJoinedEmailData, links: EmailLinks) {
  const { town, subject, preheader } = leagueJoinedHeader(d);
  const townUrl = trackedUrl(`/town/${d.leagueSlug}`, "league_joined");
  const intro = `Your invite worked. Their building is on the town's skyline, and every contribution they push this week scores in the race.${d.countsForBuilder ? " It also counts toward your Town Builder emblem." : ""}`;
  const reason = `You're getting this because you invited @${d.inviteeLogin} to ${town} on Git City.`;

  const html = renderLayout({
    title: subject,
    preheader,
    hero: townHero(d.leagueSlug, town, townUrl),
    body: [
      heading("", `@${d.inviteeLogin}`, ` joined ${town}`),
      paragraph(intro),
      button("See your town", townUrl),
    ].join("\n"),
    reason,
    links,
  });

  const text = renderText({
    lines: [subject, "", intro, "", `See your town: ${townUrl}`],
    reason,
    links,
  });

  return { subject, preheader, html, text };
}

/** "@pedro joined Acme Town" email to whoever invited them. */
export function sendLeagueJoinedNotification(opts: {
  inviterId: number;
  inviteeId: number;
  inviteeLogin: string;
  leagueId: string;
  leagueSlug: string;
  leagueName: string;
  countsForBuilder: boolean;
}) {
  const data: LeagueJoinedEmailData = {
    inviteeLogin: opts.inviteeLogin,
    leagueSlug: opts.leagueSlug,
    leagueName: opts.leagueName,
    countsForBuilder: opts.countsForBuilder,
  };
  const { subject, preheader } = leagueJoinedHeader(data);

  sendNotificationAsync({
    type: "league_joined",
    category: "leagues",
    developerId: opts.inviterId,
    dedupKey: `league_joined:${opts.leagueId}:${opts.inviterId}:${opts.inviteeId}`,
    title: subject,
    body: preheader,
    render: (links) => renderLeagueJoinedEmail(data, links),
    actionUrl: `${EMAIL_BASE_URL}/town/${opts.leagueSlug}`,
    priority: "normal",
    channels: ["email"],
  });
}
