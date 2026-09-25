import { sendNotificationAsync } from "../notifications";
import { button, heading, paragraph, trackedUrl } from "../email/components";
import { renderLayout, renderText, type EmailLinks } from "../email/layout";
import { CROWN_DAYS } from "../leagues/close";
import { townDisplayName } from "../towns/names";
import { townHero } from "./town-email";

export interface LeagueInvitedEmailData {
  inviterLogin: string;
  leagueSlug: string;
  leagueName: string;
  /** Personal invite link (carries ?ref= and ?invite=). */
  link: string;
}

function leagueInvitedHeader(d: LeagueInvitedEmailData) {
  const town = townDisplayName(d.leagueName);
  return {
    town,
    subject: `@${d.inviterLogin} invited you to ${town}`,
    preheader: "Your building is already on its skyline. Join to race the town every week.",
  };
}

export function renderLeagueInvitedEmail(d: LeagueInvitedEmailData, links: EmailLinks) {
  const { town, subject, preheader } = leagueInvitedHeader(d);
  const joinUrl = trackedUrl(d.link, "league_invited");
  const intro = `Your building is already on ${town}'s skyline, marked as invited until you join.`;
  const race = `Members race every week. Your GitHub contributions score points, and whoever tops the week wears the crown for ${CROWN_DAYS} days.`;
  const reason = `You're getting this because @${d.inviterLogin} invited you to ${town} on Git City.`;

  const html = renderLayout({
    title: subject,
    preheader,
    hero: townHero(d.leagueSlug, town, joinUrl),
    body: [
      heading("", `@${d.inviterLogin}`, ` invited you to ${town}`),
      paragraph(intro),
      paragraph(race),
      button("Join the town", joinUrl),
    ].join("\n"),
    reason,
    links,
  });

  const text = renderText({
    lines: [subject, "", intro, "", race, "", `Join the town: ${joinUrl}`],
    reason,
    links,
  });

  return { subject, preheader, html, text };
}

/**
 * "@samuel invited you to Acme Town" to an invitee who already has a Git City
 * account (only they have an email on file). One per invitee per town.
 */
export function sendLeagueInvitedNotification(opts: {
  inviteeId: number;
  inviterLogin: string;
  leagueId: string;
  leagueSlug: string;
  leagueName: string;
  link: string;
}) {
  const data: LeagueInvitedEmailData = {
    inviterLogin: opts.inviterLogin,
    leagueSlug: opts.leagueSlug,
    leagueName: opts.leagueName,
    link: opts.link,
  };
  const { subject, preheader } = leagueInvitedHeader(data);

  sendNotificationAsync({
    type: "league_invited",
    category: "leagues",
    developerId: opts.inviteeId,
    dedupKey: `league_invited:${opts.leagueId}:${opts.inviteeId}`,
    title: subject,
    body: preheader,
    render: (links) => renderLeagueInvitedEmail(data, links),
    actionUrl: opts.link,
    priority: "normal",
    channels: ["email"],
  });
}
